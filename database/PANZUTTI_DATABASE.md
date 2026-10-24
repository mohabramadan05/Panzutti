# Panzutti — Database Summary (Supabase, v3)

Database for **Panzutti** (panzutti.com), a panuozzo restaurant in Cairo. It covers:

- user accounts, with Google sign-in
- branches
- the menu with add-ons
- pickup and delivery orders, paid in cash or by InstaPay
- InstaPay transfer screenshots
- promo codes and order history
- saved addresses and checkout suggestions
- the **Panzutti Family** photo gallery, with admin approval
- **Join our team** and service-provider applications
- sales reports
- email notifications sent through Gmail

| | |
|---|---|
| **Platform** | Supabase (PostgreSQL 17) — project `dpwsssmwarxntplorgtl` |
| **Scripts** | `panzutti_supabase.sql` (v1), then `panzutti_supabase_v2.sql` (v2), then `panzutti_supabase_v3.sql` (v3) |
| **Edge Function** | `supabase/functions/send-emails/index.ts` |
| **Tables** | 20 |
| **Storage buckets** | `menu-images` (public), `payment-proofs`, `panzutti-family`, `applications` (private) |
| **Currency** | EGP, stored as integer **piasters** (1 EGP = 100) |
| **Languages** | English and Arabic (`_en` / `_ar` columns, `locale` on orders and emails) |
| **Diagram** | `panzutti-supabase-erd.pdf` / `.png` |

---

## 1. Status of the live project

| Part | Status |
|---|---|
| Tables, functions, triggers, security rules | ✅ Applied (9 migrations) |
| Storage buckets + upload rules | ✅ Created |
| Realtime (`orders`, `order_status_history`, `payment_proofs`) | ✅ On |
| Email queue → Edge Function link (Vault + pg_net) | ✅ Tested: the function answers |
| Retry job every 5 minutes (pg_cron) | ✅ Scheduled |
| `send-emails` Edge Function | ✅ Deployed |
| **Gmail credentials** | ⏳ **You need to add these — see 2.2** |
| **Google sign-in** | ⏳ **You need to turn this on — see 2.1** |
| **InstaPay address** | ⏳ **You need to set this — see 2.3** |
| Notification emails | Set to `mohab.ramadan05@gmail.com` for testing. Change to the restaurant's addresses before launch. |

---

## 2. Setup you still need to do

### 2.1 Google sign-in
1. In Google Cloud Console, go to **APIs & Services → Credentials → Create OAuth client ID** (type: Web application).
2. Under authorised redirect URI, add `https://dpwsssmwarxntplorgtl.supabase.co/auth/v1/callback`.
3. In Supabase, go to **Authentication → Sign In / Providers → Google**, turn it on, and paste the Client ID and Client Secret.
4. In the website, sign in with `supabase.auth.signInWithOAuth({ provider: 'google' })`.

When someone signs in with Google, their profile is created automatically with their name, email and photo (`avatar_url`). Google doesn't give a phone number, so it's collected at checkout.

### 2.2 Gmail for sending emails
1. On the Gmail account that will send the emails, turn on **2-Step Verification**.
2. Go to Google Account → **Security → App passwords** and create one called "Panzutti". You'll get a 16-character password.
3. In Supabase, go to **Edge Functions → Secrets** and add:
   - `GMAIL_USER`: the Gmail address
   - `GMAIL_APP_PASSWORD`: the 16-character app password
   - `SITE_URL` (optional): `https://panzutti.com`. This adds a "Track your order" button to emails.
   - `EMAIL_REPLY_TO` (optional)
4. Emails already in the queue are sent within 5 minutes.

Gmail's free accounts can send about **500 emails a day**. If the restaurant grows past that, use Google Workspace or an email service such as Resend; only the Edge Function would change.

### 2.3 InstaPay
InstaPay stays switched off for a branch until you give it an InstaPay address:
```sql
update public.branches set instapay_address = 'panzutti@instapay' where slug = 'meraki-salah-salem';
```

### 2.4 Admin account
After signing in once, run this in the SQL Editor:
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

---

## 3. How the new features work

### 3.1 Checkout: suggestions → payment
1. The website calls `get_checkout_suggestions(p_cart_item_ids)`. It returns up to 6 items:
   - only items the admin flagged with `suggest_at_checkout`
   - never anything already in the cart or sold out
   - **items from categories not already in the cart come first**: food in the cart → drinks and desserts suggested
   - `has_required_choices: true` means the website should open the item first so the customer can make a choice, e.g. pick a side
   - if nothing is flagged, it suggests the best sellers of the last 30 days
2. The customer picks **cash on delivery** or **InstaPay**, and calls `place_order(..., p_payment_method, p_customer_email)`.

### 3.2 InstaPay transfer screenshots
1. `place_order` returns `instapay_address` and `total`. The website shows "Send X EGP to …".
2. The customer uploads the screenshot to the **`payment-proofs`** bucket at `<order_id>/<file>`, as a JPG, PNG, WebP, HEIC or PDF up to 5 MB. Uploads are refused for cash orders, paid orders, cancelled orders, or orders more than 3 days old.
3. The website calls `submit_payment_proof(order_id, phone, file_path, reference?)`. This works for guests, who prove the order is theirs with the phone number. The restaurant gets an email.
4. Staff see it live (Realtime on `payment_proofs`) and call `review_payment_proof(proof_id, approve, note)`:
   - **Approve:** the order becomes **paid**.
   - **Reject:** a reason is required. The customer gets an email and can upload again, up to 5 times.
5. **An InstaPay order can't be completed until it is paid.** A cash order becomes paid automatically when it's completed.

### 3.3 Panzutti Family gallery
- **Uploading:** logged-in customers upload to the **`panzutti-family`** bucket at `<their user id>/<file>`, images up to 8 MB. Then the website calls `submit_family_photo(file_path, caption)`.
- **Approval:** the admin gets an email and calls `review_family_photo(photo_id, approve, note)`.
- **Limits:** 10 uploads a day per customer, and at most 5 waiting for approval.
- **Admin photos:** photos uploaded by an admin are published at once as **official** ("Panzutti").
- **Showing the gallery:** the website calls `get_family_gallery(limit, offset)`, then `storage.from('panzutti-family').createSignedUrls(paths, 3600)`.
- **Privacy:** until a photo is approved, only its owner and admins can see the file.

### 3.4 Join our team / service providers
1. The form lists open positions (`job_positions`) or service categories (`service_categories`). Both are readable by anyone.
2. Optionally, the applicant uploads a CV or catalog to the **`applications`** bucket at `incoming/<random id>/<file>`, as a PDF, Word file or image up to 10 MB.
3. The website calls `submit_application(type, name, phone, email, message, position or category, company, attachment_path, locale)`.
4. Emails:
   - **HR** gets job applications.
   - **Suppliers** gets service-provider applications.
   - **The applicant** gets a thank-you email in their language.
5. Only **admins** can read applications and files. They track progress with `status`: new → reviewing → contacted → accepted or rejected.
6. Spam limit: 3 applications per phone or email per day.

### 3.5 Emails (Gmail SMTP)

| Event | Email | To |
|---|---|---|
| New **delivery** order (pickup too if `app_settings.email_pickup_orders = true`) | Order details | `orders_email` |
| Same order | Confirmation in English or Arabic, with InstaPay instructions if needed | Customer, if an email was given or they signed in with Google |
| InstaPay screenshot uploaded | "Screenshot to review" | `orders_email` |
| Screenshot rejected | Reason + "upload again" | Customer |
| Gallery photo uploaded | "Photo waiting for approval" | `gallery_email` |
| Job application | Applicant details | `hr_email` |
| Service-provider application | Applicant details | `suppliers_email` (or `hr_email`) |
| Any application | Thank-you email in English or Arabic | Applicant |

**How it works:**
- The database puts each email in `email_outbox`, then pg_net calls the `send-emails` Edge Function.
- The function sends through `smtp.gmail.com:465`. Ports 25 and 587 are blocked on Edge Functions, but 465 works.
- Failed emails are retried every 5 minutes, up to 5 attempts.
- **A failed email never blocks or loses an order.**
- Admins can read `email_outbox` to see what was sent and why anything failed.


---

## 4. Tables (20)

<details><summary><code>profiles</code> — 10 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | FK,PK |
| `full_name` | text |  |
| `phone` | text | UK |
| `email` | text |  |
| `role` | user_role |  |
| `branch_id` | uuid | FK |
| `is_active` | boolean |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |
| `avatar_url` | text |  |

</details>

<details><summary><code>customer_addresses</code> — 12 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK |
| `label` | text |  |
| `address` | text |  |
| `area` | text |  |
| `notes` | text |  |
| `latitude` | numeric |  |
| `longitude` | numeric |  |
| `is_default` | boolean |  |
| `last_used_at` | timestamptz |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

</details>

<details><summary><code>branches</code> — 19 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `slug` | text | UK |
| `name_en` | text |  |
| `name_ar` | text |  |
| `address_en` | text |  |
| `address_ar` | text |  |
| `phone` | text |  |
| `timezone` | text |  |
| `opens_at` | time |  |
| `closes_at` | time |  |
| `accepts_pickup` | boolean |  |
| `accepts_delivery` | boolean |  |
| `delivery_fee` | integer |  |
| `min_delivery_order` | integer |  |
| `is_active` | boolean |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |
| `accepts_instapay` | boolean |  |
| `instapay_address` | text |  |

</details>

<details><summary><code>app_settings</code> — 8 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | boolean | PK |
| `orders_email` | text |  |
| `hr_email` | text |  |
| `suppliers_email` | text |  |
| `gallery_email` | text |  |
| `email_from_name` | text |  |
| `email_pickup_orders` | boolean |  |
| `updated_at` | timestamptz |  |

</details>

<details><summary><code>menu_categories</code> — 8 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `slug` | text | UK |
| `name_en` | text |  |
| `name_ar` | text |  |
| `sort_order` | integer |  |
| `is_active` | boolean |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

</details>

<details><summary><code>menu_items</code> — 16 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `category_id` | uuid | FK |
| `slug` | text | UK |
| `name_en` | text |  |
| `name_ar` | text |  |
| `description_en` | text |  |
| `description_ar` | text |  |
| `price` | integer |  |
| `image_url` | text |  |
| `is_signature` | boolean |  |
| `is_sold_out` | boolean |  |
| `is_active` | boolean |  |
| `sort_order` | integer |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |
| `suggest_at_checkout` | boolean |  |

</details>

<details><summary><code>addon_groups</code> — 7 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `name_en` | text |  |
| `name_ar` | text |  |
| `min_select` | smallint |  |
| `max_select` | smallint |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

</details>

<details><summary><code>addons</code> — 12 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `group_id` | uuid | FK |
| `name_en` | text |  |
| `name_ar` | text |  |
| `price` | integer |  |
| `max_quantity` | smallint |  |
| `is_default` | boolean |  |
| `is_sold_out` | boolean |  |
| `is_active` | boolean |  |
| `sort_order` | integer |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

</details>

<details><summary><code>menu_item_addon_groups</code> — 3 columns</summary>

| Column | Type | Key |
|---|---|---|
| `menu_item_id` | uuid | FK,PK |
| `group_id` | uuid | FK,PK |
| `sort_order` | integer |  |

</details>

<details><summary><code>promo_codes</code> — 16 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `code` | text |  |
| `description` | text |  |
| `discount_type` | discount_type |  |
| `discount_value` | integer |  |
| `max_discount` | integer |  |
| `min_order_total` | integer |  |
| `order_type` | order_type |  |
| `branch_id` | uuid | FK |
| `starts_at` | timestamptz |  |
| `ends_at` | timestamptz |  |
| `usage_limit` | integer |  |
| `per_user_limit` | integer |  |
| `is_active` | boolean |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

</details>

<details><summary><code>orders</code> — 28 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `order_number` | bigint | UK |
| `branch_id` | uuid | FK |
| `user_id` | uuid | FK |
| `type` | order_type |  |
| `customer_name` | text |  |
| `customer_phone` | text |  |
| `delivery_address` | text |  |
| `delivery_notes` | text |  |
| `customer_address_id` | uuid | FK |
| `status` | order_status |  |
| `payment_status` | payment_status |  |
| `paid_at` | timestamptz |  |
| `scheduled_for` | timestamptz |  |
| `locale` | text |  |
| `promo_code_id` | uuid | FK |
| `promo_code` | text |  |
| `subtotal` | integer |  |
| `discount_total` | integer |  |
| `delivery_fee` | integer |  |
| `total` | integer |  |
| `note` | text |  |
| `cancel_reason` | text |  |
| `handled_by` | uuid | FK |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |
| `payment_method` | payment_method |  |
| `customer_email` | text |  |

</details>

<details><summary><code>order_items</code> — 9 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `order_id` | uuid | FK |
| `menu_item_id` | uuid | FK |
| `item_name` | text |  |
| `unit_price` | integer |  |
| `addons_total` | integer |  |
| `quantity` | smallint |  |
| `line_total` | integer |  |
| `note` | text |  |

</details>

<details><summary><code>order_item_addons</code> — 8 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `order_item_id` | uuid | FK,UK |
| `addon_id` | uuid | FK,UK |
| `group_id` | uuid | FK |
| `group_name` | text |  |
| `addon_name` | text |  |
| `unit_price` | integer |  |
| `quantity` | smallint |  |

</details>

<details><summary><code>order_status_history</code> — 7 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `order_id` | uuid | FK |
| `from_status` | order_status |  |
| `to_status` | order_status |  |
| `changed_by` | uuid | FK |
| `note` | text |  |
| `created_at` | timestamptz |  |

</details>

<details><summary><code>payment_proofs</code> — 9 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `order_id` | uuid | FK |
| `file_path` | text |  |
| `reference` | text |  |
| `status` | review_status |  |
| `reviewed_by` | uuid | FK |
| `reviewed_at` | timestamptz |  |
| `review_note` | text |  |
| `created_at` | timestamptz |  |

</details>

<details><summary><code>family_photos</code> — 12 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `file_path` | text | UK |
| `caption` | text |  |
| `uploaded_by` | uuid | FK |
| `uploader_name` | text |  |
| `is_official` | boolean |  |
| `status` | review_status |  |
| `reviewed_by` | uuid | FK |
| `reviewed_at` | timestamptz |  |
| `review_note` | text |  |
| `sort_order` | integer |  |
| `created_at` | timestamptz |  |

</details>

<details><summary><code>job_positions</code> — 10 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `title_en` | text |  |
| `title_ar` | text |  |
| `description_en` | text |  |
| `description_ar` | text |  |
| `branch_id` | uuid | FK |
| `is_open` | boolean |  |
| `sort_order` | integer |  |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

</details>

<details><summary><code>service_categories</code> — 6 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `slug` | text | UK |
| `name_en` | text |  |
| `name_ar` | text |  |
| `is_active` | boolean |  |
| `sort_order` | integer |  |

</details>

<details><summary><code>applications</code> — 18 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | uuid | PK |
| `type` | application_type |  |
| `full_name` | text |  |
| `phone` | text |  |
| `email` | text |  |
| `job_position_id` | uuid | FK |
| `position_other` | text |  |
| `service_category_id` | uuid | FK |
| `company_name` | text |  |
| `message` | text |  |
| `attachment_path` | text |  |
| `locale` | text |  |
| `status` | application_status |  |
| `staff_note` | text |  |
| `reviewed_by` | uuid | FK |
| `user_id` | uuid | FK |
| `created_at` | timestamptz |  |
| `updated_at` | timestamptz |  |

</details>

<details><summary><code>email_outbox</code> — 11 columns</summary>

| Column | Type | Key |
|---|---|---|
| `id` | bigint | PK |
| `kind` | text |  |
| `recipient` | text |  |
| `locale` | text |  |
| `payload` | jsonb |  |
| `status` | text |  |
| `attempts` | smallint |  |
| `last_error` | text |  |
| `last_attempt_at` | timestamptz |  |
| `sent_at` | timestamptz |  |
| `created_at` | timestamptz |  |

</details>

---

## 5. Order flow (unchanged from v1, plus payment)

```
PICKUP:    pending → confirmed → preparing → ready → completed
DELIVERY:  pending → confirmed → preparing → ready → out_for_delivery → completed
Any status before "completed" can go to → cancelled
```

- **Cash:** completing the order marks it paid.
- **InstaPay:** the order must be paid (screenshot approved, or `mark_order_paid`) before it can be completed.
- **Customers** can cancel their own order while it is still `pending`.
- **Staff** must give a reason when cancelling.

### Totals

$$\text{line\_total} = (\text{unit\_price} + \text{addons\_total}) \times \text{quantity}$$

$$\text{total} = \max(\text{subtotal} - \text{discount\_total},\ 0) + \text{delivery\_fee}$$

$$\text{percent promo: } \min\left(\left\lfloor \text{subtotal} \times \tfrac{\text{value}}{100} \right\rfloor,\ \text{max\_discount}\right) \qquad \text{fixed promo: } \min(\text{value},\ \text{subtotal})$$

---

## 6. All functions the app calls (`supabase.rpc`)

| Who | Functions |
|---|---|
| **Anyone** | `get_menu`, `get_checkout_suggestions`, `place_order`, `validate_promo_code`, `track_order`, **`find_orders_by_phone`** (v3), `is_branch_open`, `submit_payment_proof`, `get_family_gallery`, `submit_application` |
| **Logged-in customers** | `submit_family_photo`, `update_order_status` (cancel own pending order). They also manage `customer_addresses` and their own `profiles` row directly. |
| **Staff** (own branch) | `update_order_status`, `mark_order_paid`, `review_payment_proof`, `set_menu_item_sold_out`, `set_addon_sold_out`, reports |
| **Admins** | Everything staff can do, plus `review_family_photo`, and direct editing of the menu, branches, promo codes, positions, service categories, applications and `app_settings` |
| **Server only** | `claim_email_batch`, `complete_email` (used by the Edge Function) |

**`place_order` parameters (in order):** `p_branch_id`, `p_type`, `p_customer_name`, `p_customer_phone`, `p_items`, `p_delivery_address`, `p_delivery_notes`, `p_note`, `p_scheduled_for`, `p_promo_code`, `p_locale`, `p_address_id`, `p_save_address`, `p_address_label`, **`p_payment_method`**, **`p_customer_email`**.

**Reports:** `report_daily_sales`, `report_branch_summary`, `report_top_items`, `report_top_addons`, `report_category_sales`, `report_hourly_sales`, `report_promo_usage`, `report_staff_activity`, **`report_payment_methods`** (cash vs InstaPay). A business day runs from 05:00 to 04:59 Cairo time, and revenue counts completed orders only.

---

## 7. Who can see what

| Data | Guest | Customer | Staff | Admin |
|---|---|---|---|---|
| Menu, branches, open positions, service categories | read | read | read | full |
| Approved gallery photos | read | read + own pending | read | full |
| Orders | via `track_order` | own | own branch | all |
| InstaPay screenshots | upload only | own order's proofs | own branch | all |
| Saved addresses | — | own | — | — |
| Applications + CVs | submit only | submit only | — | full |
| Settings, email log | — | — | — | full |

All 20 tables have security rules turned on.

---

## 8. App code examples (supabase-js)

```js
// Google sign-in
await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://panzutti.com/en' } });

// Checkout suggestions
const { data: suggestions } = await supabase.rpc('get_checkout_suggestions', { p_cart_item_ids: cart.map(i => i.menu_item_id) });

// Place an InstaPay delivery order
const { data: order } = await supabase.rpc('place_order', {
  p_branch_id: branchId, p_type: 'delivery',
  p_customer_name: name, p_customer_phone: phone, p_customer_email: email,
  p_items: cart, p_delivery_address: address,
  p_payment_method: 'instapay', p_locale: 'ar'
});
// → show "Send {order.total/100} EGP to {order.instapay_address}"

// Upload the transfer screenshot, then attach it
const path = `${order.order_id}/${crypto.randomUUID()}.jpg`;
await supabase.storage.from('payment-proofs').upload(path, file);
await supabase.rpc('submit_payment_proof', { p_order_id: order.order_id, p_phone: phone, p_file_path: path });

// Panzutti Family: upload (logged in)
const { data: { user } } = await supabase.auth.getUser();
const photoPath = `${user.id}/${crypto.randomUUID()}.jpg`;
await supabase.storage.from('panzutti-family').upload(photoPath, photo);
await supabase.rpc('submit_family_photo', { p_file_path: photoPath, p_caption: 'Birthday at Panzutti!' });

// Panzutti Family: show approved photos
const { data: photos } = await supabase.rpc('get_family_gallery', { p_limit: 30 });
const { data: urls } = await supabase.storage.from('panzutti-family')
  .createSignedUrls(photos.map(p => p.file_path), 3600);

// Join our team
const cvPath = `incoming/${crypto.randomUUID()}/${cv.name}`;
await supabase.storage.from('applications').upload(cvPath, cv);
await supabase.rpc('submit_application', {
  p_type: 'job', p_full_name: name, p_phone: phone, p_email: email,
  p_job_position_id: positionId, p_attachment_path: cvPath, p_locale: 'ar'
});
```

---

## 9. Starter data

- **Branch:** Meraki Complex – Salah Salem
- **Menu:** 12 categories and 10 items, including 5 drinks and desserts flagged for checkout suggestions
- **Add-ons:**
  - *Choose a side*: required for The Comfort
  - *Extra sauce*: up to 3
- **Promo code:** `WELCOME20`
- **Positions (6):** Cashier, Waiter, Barista, Floor Manager, Financial Accountant, HR Specialist. All are open; close any that aren't hiring with `is_open = false`.
- **Service categories:** 11, in English and Arabic

---

## 10. Known limits and next steps

- ~~Load the full menu~~ the 39 items from the menu PDF are loaded with Arabic names and photos (`panzutti_menu_seed.sql`). The website-only drinks (about 40) are still to add.
- **An old function is still in the database.** `place_order_v1` is the previous version of `place_order`, renamed and switched off rather than deleted. You can delete it when you like:
  `drop function public.place_order_v1(uuid, public.order_type, text, text, jsonb, text, text, text, timestamptz, text, text, uuid, boolean, text);`
- **Gmail limit:** about 500 emails a day on a free account.
- **Abuse protection:** before launch, turn on Supabase rate limiting or a captcha for `place_order`, `track_order` and `submit_application`.
- **Not built yet:**
  - delivery zones (a different fee per area)
  - phone verification by SMS against fake cash orders
  - drivers
  - weekly opening hours with holidays
  - reservations and contact forms

---

## 11. v3 additions (2026-10-23)

**`find_orders_by_phone(p_phone text) → jsonb`** — anyone. Used by the website's "Track your order" page.
- Returns the phone's orders from the **last 3 days** (newest first, at most 10).
- Each row has only `order_number`, `status`, `type`, `payment_method`, `payment_status`, `total`, `created_at`: no name, address or items.
- Raises `Please enter a valid phone number` if the phone can't be normalized.
- Full details still come from `track_order(order_number, phone)`.

**Privacy note:** order numbers are sequential, so for guests the phone number is effectively the key, both here and in `track_order`. Before launch, add rate limiting (or SMS verification) for `find_orders_by_phone` and `track_order`.

### Panzutti Family: anyone can share (v3, second part)

Anyone can now share a photo **without an account**. Every photo still waits for an admin (`review_family_photo`) before it appears on the wall.

1. The website uploads to **`panzutti-family/guest/<random>.<ext>`** (storage rule "Guest upload family photo", anon + signed in).
2. It calls **`submit_guest_family_photo(p_file_path, p_name, p_caption?) → uuid`**:
   - name required (only the first name is shown), caption up to 300 characters
   - the file must exist and be less than 1 hour old
   - the photo is saved as `pending` and `gallery_email` gets the usual "photo waiting for approval" email
3. Signed-in customers keep using `submit_family_photo` and their own folder.

**Limits (no account, so they are global):** 30 guest uploads per hour (`guest_family_upload_allowed()`), and at most 100 guest photos waiting for review. Rejected or abandoned guest files stay in the bucket until an admin deletes them. Consider a captcha before launch if spam appears.
