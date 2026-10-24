// Panzutti — send-emails Edge Function
// Sends queued emails (public.email_outbox) through Gmail SMTP (smtp.gmail.com:465).
//
// Called by the database (pg_net) whenever emails are queued, and every
// 5 minutes by pg_cron for retries. The request body is ignored: the function
// only ever sends what is already in the queue, so calling it is harmless.
//
// Secrets (Dashboard → Edge Functions → Secrets):
//   GMAIL_USER          sending Gmail address
//   GMAIL_APP_PASSWORD  16-character Google App Password (2-Step Verification required)
//   EMAIL_REPLY_TO      optional
//   SITE_URL            optional, e.g. https://panzutti.com (adds a "Track your order" link)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.16";

type Locale = "en" | "ar";
interface OutboxRow {
  id: number;
  kind: string;
  recipient: string;
  locale: Locale;
  payload: Record<string, any>;
}

const GMAIL_USER = Deno.env.get("GMAIL_USER") ?? "";
const GMAIL_APP_PASSWORD = (Deno.env.get("GMAIL_APP_PASSWORD") ?? "").replace(/\s+/g, "");
const REPLY_TO = Deno.env.get("EMAIL_REPLY_TO") ?? undefined;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "").replace(/\/+$/, "");
const BRAND = "#1F6348";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// ---------------------------------------------------------------- helpers
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!
  );

const money = (piasters: number, l: Locale) =>
  `${((piasters ?? 0) / 100).toFixed(2)} ${l === "ar" ? "ج.م" : "EGP"}`;

const t = (l: Locale, en: string, ar: string) => (l === "ar" ? ar : en);

function layout(l: Locale, title: string, body: string) {
  const dir = l === "ar" ? "rtl" : "ltr";
  const align = l === "ar" ? "right" : "left";
  return `<!doctype html><html lang="${l}" dir="${dir}"><body style="margin:0;background:#f5f2ec;font-family:Arial,Helvetica,sans-serif;color:#222">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f2ec;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${BRAND};color:#fff;padding:20px 28px;font-size:22px;font-weight:bold;text-align:${align}">Panzutti</td></tr>
<tr><td style="padding:28px;text-align:${align};font-size:15px;line-height:1.6">
<h1 style="font-size:20px;margin:0 0 16px;color:${BRAND}">${esc(title)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 28px;background:#faf8f4;color:#888;font-size:12px;text-align:${align}">
${t(l, "Panzutti — The first authentic Panuozzo in Egypt. Fatto con amore ❤", "بانزوتي — أول بانوتزو أصلي في مصر. Fatto con amore ❤")}
</td></tr></table></td></tr></table></body></html>`;
}

const row = (label: string, value: unknown) =>
  value === null || value === undefined || value === ""
    ? ""
    : `<tr><td style="padding:4px 12px;color:#777;white-space:nowrap;vertical-align:top">${esc(label)}</td><td style="padding:4px 12px">${esc(value)}</td></tr>`;

function itemsTable(p: Record<string, any>, l: Locale) {
  const lines = (p.items ?? []).map((i: any) => {
    const addons = (i.addons ?? []).length ? `<div style="color:#777;font-size:13px">+ ${esc(i.addons.join(", "))}</div>` : "";
    const note = i.note ? `<div style="color:#777;font-size:13px">“${esc(i.note)}”</div>` : "";
    return `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(i.quantity)} × ${esc(i.name)}${addons}${note}</td>
<td style="padding:6px 0;border-bottom:1px solid #eee;text-align:${l === "ar" ? "left" : "right"};white-space:nowrap">${money(i.line_total, l)}</td></tr>`;
  }).join("");
  const total = (label: string, v: number, bold = false) =>
    `<tr><td style="padding:4px 0;${bold ? "font-weight:bold" : "color:#555"}">${esc(label)}</td><td style="padding:4px 0;text-align:${l === "ar" ? "left" : "right"};${bold ? "font-weight:bold" : ""}">${money(v, l)}</td></tr>`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:12px 0 4px">${lines}
${total(t(l, "Subtotal", "المجموع الفرعي"), p.subtotal)}
${p.discount_total ? total(t(l, `Discount (${p.promo_code ?? ""})`, `خصم (${p.promo_code ?? ""})`), -p.discount_total) : ""}
${p.delivery_fee ? total(t(l, "Delivery", "التوصيل"), p.delivery_fee) : ""}
${p.service_total ? total(t(l, "Service (12%)", "خدمة (١٢٪)"), p.service_total) : ""}
${p.tax_total ? total(t(l, "VAT (14%)", "ضريبة القيمة المضافة (١٤٪)"), p.tax_total) : ""}
${total(t(l, "Total", "الإجمالي"), p.total, true)}</table>`;
}

const payWord = (m: string, l: Locale) =>
  m === "instapay" ? "InstaPay" : t(l, "Cash on delivery", "الدفع كاش عند الاستلام");

// ---------------------------------------------------------------- templates
function render(e: OutboxRow): { subject: string; html: string } {
  const p = e.payload ?? {};
  const l: Locale = e.locale === "ar" ? "ar" : "en";

  switch (e.kind) {
    case "order_new_restaurant": {
      const subject = `New ${p.type} order #${p.order_number} — ${money(p.total, "en")} (${payWord(p.payment_method, "en")})`;
      const body = `<table role="presentation" cellspacing="0" cellpadding="0">
${row("Customer", p.customer_name)}${row("Phone", p.customer_phone)}${row("Email", p.customer_email)}
${row("Address", p.delivery_address)}${row("Address notes", p.delivery_notes)}
${p.is_reservation ? row("Guests", p.party_size) : ""}${row("Kitchen note", p.note)}${row("Scheduled for", p.scheduled_for ? new Date(p.scheduled_for).toLocaleString("en-GB", { timeZone: "Africa/Cairo" }) : "ASAP")}
${row("Payment", payWord(p.payment_method, "en"))}${row("Branch", p.branch_name)}</table>
${p.payment_method === "instapay" ? `<p style="background:#fff6e0;padding:10px 12px;border-radius:8px">Waiting for the customer's InstaPay screenshot. Check it in the dashboard before confirming.</p>` : ""}
${itemsTable(p, "en")}`;
      return { subject, html: layout("en", `Order #${p.order_number}`, body) };
    }

    case "order_confirmation_customer": {
      const subject = t(l, `Your Panzutti order #${p.order_number} is received`, `تم استلام طلبك رقم ${p.order_number} من بانزوتي`);
      const insta = p.payment_method === "instapay"
        ? `<p style="background:#fff6e0;padding:12px;border-radius:8px">${t(l,
            `Please send <b>${money(p.total, l)}</b> by InstaPay to <b>${esc(p.instapay_address)}</b>, then upload the transfer screenshot on your order page. We start preparing your order once the transfer is confirmed.`,
            `من فضلك حوّل <b>${money(p.total, l)}</b> عن طريق إنستاباي إلى <b>${esc(p.instapay_address)}</b>، ثم ارفع صورة التحويل في صفحة الطلب. هنبدأ تحضير طلبك بعد تأكيد التحويل.`)}</p>`
        : `<p>${t(l, "You will pay in cash when you receive your order.", "هتدفع كاش عند استلام الطلب.")}</p>`;
      const track = SITE_URL
        ? `<p><a href="${SITE_URL}/${l}/track?order=${encodeURIComponent(p.order_number)}" style="display:inline-block;background:${BRAND};color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${t(l, "Track your order", "تتبع طلبك")}</a></p>`
        : "";
      const body = `<p>${t(l, `Hi ${esc(p.customer_name)}, thank you for your order!`, `أهلاً ${esc(p.customer_name)}، شكراً لطلبك!`)}</p>
<table role="presentation" cellspacing="0" cellpadding="0">
${row(t(l, "Order number", "رقم الطلب"), `#${p.order_number}`)}
${row(t(l, "Delivery to", "التوصيل إلى"), p.delivery_address)}
${row(t(l, "Payment", "طريقة الدفع"), payWord(p.payment_method, l))}</table>
${insta}${itemsTable(p, l)}${track}
<p style="color:#555">${t(l, `Questions? Call us on ${esc(p.branch_phone)}.`, `لأي استفسار كلمنا على ${esc(p.branch_phone)}.`)}</p>`;
      return { subject, html: layout(l, t(l, "Order received", "تم استلام الطلب"), body) };
    }

    case "payment_proof_restaurant":
      return {
        subject: `InstaPay screenshot uploaded — order #${p.order_number}`,
        html: layout("en", "InstaPay screenshot to review", `<table role="presentation">
${row("Order", `#${p.order_number}`)}${row("Customer", p.customer_name)}${row("Phone", p.customer_phone)}
${row("Amount due", money(p.total, "en"))}${row("Reference", p.reference)}</table>
<p>Open the dashboard to approve or reject the transfer.</p>`),
      };

    case "payment_rejected_customer":
      return {
        subject: t(l, `Order #${p.order_number}: we couldn't confirm your InstaPay transfer`, `طلب رقم ${p.order_number}: لم نتمكن من تأكيد تحويل إنستاباي`),
        html: layout(l, t(l, "Payment not confirmed", "لم يتم تأكيد الدفع"), `
<p>${t(l, "We checked your transfer screenshot but couldn't confirm it.", "راجعنا صورة التحويل لكن لم نتمكن من تأكيدها.")}</p>
<table role="presentation">${row(t(l, "Reason", "السبب"), p.reason)}${row(t(l, "Amount due", "المبلغ المطلوب"), money(p.total, l))}</table>
<p>${t(l, "Please upload a new screenshot on your order page, or call us on ", "من فضلك ارفع صورة جديدة من صفحة الطلب، أو كلمنا على ")}${esc(p.branch_phone)}.</p>`),
      };

    case "family_photo_admin":
      return {
        subject: "New Panzutti Family photo waiting for approval",
        html: layout("en", "New photo to review", `<table role="presentation">
${row("From", p.uploader_name)}${row("Email", p.uploader_email)}${row("Caption", p.caption)}</table>
<p>Open the dashboard → Panzutti Family to approve or reject it.</p>`),
      };

    case "application_job_restaurant":
    case "application_provider_restaurant": {
      const job = e.kind === "application_job_restaurant";
      return {
        subject: job
          ? `Job application: ${p.position_en ?? "General"} — ${p.full_name}`
          : `Service provider: ${p.category_en ?? ""} — ${p.company_name ?? p.full_name}`,
        html: layout("en", job ? "New job application" : "New service provider", `<table role="presentation">
${row("Name", p.full_name)}${row("Phone", p.phone)}${row("Email", p.email)}
${job ? row("Position", p.position_en) : row("Supplies", p.category_en)}
${row("Company", p.company_name)}${row("Message", p.message)}
${row(job ? "CV" : "Catalog", p.has_attachment ? "Attached — see the dashboard" : "Not provided")}</table>
<p>Reply to this email or call the applicant directly.</p>`),
      };
    }

    case "application_received_applicant": {
      const job = p.type === "job";
      return {
        subject: t(l, "Thank you for contacting Panzutti", "شكراً لتواصلك مع بانزوتي"),
        html: layout(l, t(l, "We received your application", "استلمنا طلبك"), `
<p>${t(l, `Hi ${esc(p.full_name)},`, `أهلاً ${esc(p.full_name)}،`)}</p>
<p>${job
          ? t(l, `Thank you for applying${p.position ? ` for <b>${esc(p.position)}</b>` : ""} at Panzutti. Our team will review your application and contact you if your profile matches.`,
                 `شكراً لتقديمك${p.position ? ` على وظيفة <b>${esc(p.position)}</b>` : ""} في بانزوتي. فريقنا هيراجع طلبك وهنتواصل معاك لو مناسب.`)
          : t(l, "Thank you for your interest in working with Panzutti. Our team will review your details and get back to you.",
                 "شكراً لاهتمامك بالتعامل مع بانزوتي. فريقنا هيراجع بياناتك وهيتواصل معاك.")}</p>`),
      };
    }

    default:
      throw new Error(`Unknown email kind: ${e.kind}`);
  }
}

// ---------------------------------------------------------------- handler
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    // leave everything queued until the secrets are set
    return Response.json({ error: "GMAIL_USER / GMAIL_APP_PASSWORD secrets are not set" }, { status: 503 });
  }

  const { data: settings } = await supabase.from("app_settings").select("email_from_name").single();
  const fromName = settings?.email_from_name ?? "Panzutti";

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,          // ports 25 and 587 are blocked on Edge Functions; 465 (SSL) is allowed
    secure: true,
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });

  let sent = 0, failed = 0;
  // up to 3 batches of 20 per call
  for (let round = 0; round < 3; round++) {
    const { data: batch, error } = await supabase.rpc("claim_email_batch", { p_limit: 20 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!batch?.length) break;

    for (const e of batch as OutboxRow[]) {
      try {
        const { subject, html } = render(e);
        await transporter.sendMail({
          from: `"${fromName}" <${GMAIL_USER}>`,
          to: e.recipient,
          replyTo: e.kind.endsWith("_restaurant") ? (e.payload?.email ?? e.payload?.customer_email ?? REPLY_TO) : REPLY_TO,
          subject,
          html,
        });
        await supabase.rpc("complete_email", { p_id: e.id, p_error: null });
        sent++;
      } catch (err) {
        await supabase.rpc("complete_email", { p_id: e.id, p_error: String((err as Error)?.message ?? err) });
        failed++;
      }
    }
  }

  transporter.close();
  return Response.json({ sent, failed });
});
