"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banknote, Clock, Loader2, Smartphone, Tag, X } from "lucide-react";
import { OrderTypeToggle, useCartSummary } from "./cart-view";
import type { Branch } from "@/lib/data";
import { openStatus } from "@/lib/data";
import type { Catalog } from "@/lib/catalog";
import type { Dictionary, Locale } from "@/lib/i18n";
import { lineTotal, toOrderItems } from "@/lib/cart";
import { saveLastOrder, type PlacedOrder } from "@/lib/last-order";
import { supabase } from "@/lib/supabase";
import { egp, normalizePhone, timeLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const CUSTOMER_KEY = "panzutti-customer-v1"; // remembered details so returning guests don't retype them
type Customer = { name: string; phone: string; email: string; address: string; addressNotes: string };
type Field = keyof Customer;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Input({
  label,
  hint,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      <input
        {...props}
        aria-invalid={!!error}
        className={cn(
          "h-12 w-full rounded-2xl bg-background px-4 ring-1 outline-none transition placeholder:text-muted-foreground focus:ring-2 focus:ring-primary",
          error ? "ring-2 ring-brand-red" : "ring-border",
        )}
      />
      {error ? <span className="mt-1 block text-sm font-bold text-brand-red">{error}</span> : hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function CheckoutForm({
  locale,
  t,
  tCart,
  branch,
  catalog,
}: {
  locale: Locale;
  t: Dictionary["checkout"];
  tCart: Dictionary["cart"];
  branch: Branch;
  catalog: Catalog | null;
}) {
  const router = useRouter();
  const s = useCartSummary(catalog, branch);
  const [c, setC] = useState<Customer>({ name: "", phone: "", email: "", address: "", addressNotes: "" });
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discount: number } | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [method, setMethod] = useState<"cash" | "instapay">("cash");
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [open, setOpen] = useState(true);
  const pick = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const instapayOn = branch.accepts_instapay && !!branch.instapay_address;

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CUSTOMER_KEY) ?? "null") as Partial<Customer> | null;
      if (saved) setC((cur) => ({ ...cur, ...saved }));
    } catch {
      // nothing saved / storage blocked
    }
    setOpen(openStatus(branch).open);
  }, [branch]);

  // Nothing to check out: back to the cart
  useEffect(() => {
    if (s.ready && !s.lines.length && !submitting) router.replace(`/${locale}/cart`);
  }, [s.ready, s.lines.length, submitting, router, locale]);

  // A promo discount depends on order type and subtotal: drop it when they change
  useEffect(() => {
    setPromo(null);
    setPromoError("");
  }, [s.type, s.subtotal]);

  const set = (f: Field) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setC((cur) => ({ ...cur, [f]: e.target.value }));
    setErrors((er) => ({ ...er, [f]: undefined }));
  };

  const applyPromo = async () => {
    const code = promoInput.trim();
    if (!code || !supabase) return;
    setPromoBusy(true);
    setPromoError("");
    const { data, error } = await supabase.rpc("validate_promo_code", {
      p_code: code,
      p_branch_id: branch.id,
      p_type: s.type,
      p_subtotal: s.subtotal,
      p_phone: normalizePhone(c.phone),
    });
    setPromoBusy(false);
    const row = (data as { promo_code: string; discount_amount: number }[] | null)?.[0];
    if (error || !row) return setPromoError(error?.message ?? t.generic);
    setPromo({ code: row.promo_code, discount: row.discount_amount });
  };

  const validate = () => {
    const er: Partial<Record<Field, string>> = {};
    if (!c.name.trim()) er.name = t.required;
    if (!c.phone.trim()) er.phone = t.required;
    else if (!normalizePhone(c.phone)) er.phone = t.phoneInvalid;
    if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) er.email = t.emailInvalid;
    if (s.type === "delivery" && !c.address.trim()) er.address = t.required;
    setErrors(er);
    const first = Object.keys(er)[0];
    if (first) document.getElementById(`f-${first}`)?.focus();
    return !first;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    if (!validate() || !supabase) return;
    setSubmitting(true);
    const phone = normalizePhone(c.phone)!;
    const { data, error } = await supabase.rpc("place_order", {
      p_branch_id: branch.id,
      p_type: s.type,
      p_customer_name: c.name.trim(),
      p_customer_phone: phone,
      p_customer_email: c.email.trim() || null,
      p_items: toOrderItems(s.lines),
      p_delivery_address: s.type === "delivery" ? c.address.trim() : null,
      p_delivery_notes: s.type === "delivery" ? c.addressNotes.trim() || null : null,
      p_note: note.trim() || null,
      p_promo_code: promo?.code ?? null,
      p_locale: locale,
      p_payment_method: method,
    });
    if (error || !data) {
      setSubmitting(false);
      setServerError(error?.message ?? t.generic);
      return;
    }
    try {
      window.localStorage.setItem(CUSTOMER_KEY, JSON.stringify(c));
    } catch {
      // not critical
    }
    const order = data as PlacedOrder;
    saveLastOrder({ ...order, phone, name: c.name.trim(), type: s.type });
    s.clear();
    router.push(`/${locale}/order?n=${order.order_number}`);
  };

  if (!s.ready || !s.lines.length) return <div className="h-64 animate-pulse rounded-3xl bg-muted" aria-busy />;

  const discount = promo?.discount ?? 0;
  const total = Math.max(s.subtotal - discount, 0) + s.deliveryFee;
  const blocked = !catalog || s.hasUnavailable || s.belowMinimum || !open;

  return (
    <form onSubmit={submit} noValidate className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-8">
        {!open && (
          <p className="flex items-center gap-2 rounded-2xl bg-brand-red/10 px-4 py-3 font-bold text-brand-red">
            <Clock className="h-5 w-5 shrink-0" aria-hidden /> {t.closed.replace("{time}", timeLabel(branch.opens_at, locale))}
          </p>
        )}
        {!catalog && <p className="rounded-2xl bg-brand-red/10 px-4 py-3 font-bold text-brand-red">{t.offline}</p>}

        <section className="rounded-[2rem] bg-card p-6 ring-1 ring-border">
          <h2 className="text-2xl text-primary">{t.how}</h2>
          <div className="mt-4">
            <OrderTypeToggle value={s.type} onChange={s.setType} branch={branch} t={tCart} />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {s.type === "pickup"
              ? t.pickupD.replace("{branch}", pick(branch.name_en, branch.name_ar))
              : t.deliveryD.replace("{fee}", egp(branch.delivery_fee, locale))}
          </p>
        </section>

        <section className="space-y-4 rounded-[2rem] bg-card p-6 ring-1 ring-border">
          <h2 className="text-2xl text-primary">{t.details}</h2>
          <Input id="f-name" label={t.name} value={c.name} onChange={set("name")} autoComplete="name" error={errors.name} maxLength={80} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="f-phone" label={t.phone} value={c.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01012345678" hint={t.phoneHint} error={errors.phone} />
            <Input id="f-email" label={t.email} value={c.email} onChange={set("email")} type="email" autoComplete="email" dir="ltr" hint={t.emailHint} error={errors.email} />
          </div>
          {s.type === "delivery" && (
            <>
              <Input id="f-address" label={t.address} value={c.address} onChange={set("address")} autoComplete="street-address" placeholder={t.addressPlaceholder} error={errors.address} maxLength={300} />
              <Input id="f-addressNotes" label={t.addressNotes} value={c.addressNotes} onChange={set("addressNotes")} maxLength={300} />
            </>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">{t.note}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 300))}
              rows={2}
              className="w-full resize-none rounded-2xl bg-background px-4 py-3 ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </section>

        <section className="rounded-[2rem] bg-card p-6 ring-1 ring-border">
          <h2 className="text-2xl text-primary">{t.payment}</h2>
          <div role="radiogroup" className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { v: "cash" as const, Icon: Banknote, label: t.cash, d: s.type === "delivery" ? t.cashDelivery : t.cashPickup, show: true },
              { v: "instapay" as const, Icon: Smartphone, label: t.instapay, d: t.instapayD, show: instapayOn },
            ]
              .filter((o) => o.show)
              .map(({ v, Icon, label, d }) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={method === v}
                  onClick={() => setMethod(v)}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl p-4 text-start ring-1 transition",
                    method === v ? "bg-primary/5 ring-2 ring-primary" : "bg-background ring-border hover:ring-primary/50",
                  )}
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                  <span>
                    <span className="block font-extrabold">{label}</span>
                    <span className="block text-sm text-muted-foreground">{d}</span>
                  </span>
                </button>
              ))}
          </div>
        </section>
      </div>

      <aside className="rounded-[2rem] bg-card p-6 ring-1 ring-border lg:sticky lg:top-24">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl text-primary">{t.summary}</h2>
          <Link href={`/${locale}/cart`} className="text-sm font-bold text-primary underline-offset-4 hover:underline">{t.edit}</Link>
        </div>
        <ul className="mt-4 space-y-3 text-sm">
          {s.lines.map((l) => (
            <li key={l.key} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="font-bold">{l.quantity}× {pick(l.item.name_en, l.item.name_ar)}</span>
                {l.addons.length > 0 && <span className="block text-muted-foreground">{l.addons.map((a) => pick(a.name_en, a.name_ar)).join(" · ")}</span>}
                {!l.available && <span className="block font-bold text-brand-red">{tCart.unavailable}</span>}
              </span>
              <span className="shrink-0 tabular-nums">{egp(lineTotal(l), locale)}</span>
            </li>
          ))}
        </ul>

        {/* promo code */}
        <div className="mt-6 border-t border-dashed border-border pt-5">
          {promo ? (
            <p className="flex items-center justify-between gap-2 rounded-2xl bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary">
              <span className="inline-flex items-center gap-2">
                <Tag className="h-4 w-4" aria-hidden /> {t.promoApplied.replace("{code}", promo.code)}
              </span>
              <button type="button" onClick={() => setPromo(null)} className="inline-flex items-center gap-1 hover:text-brand-red">
                <X className="h-4 w-4" aria-hidden /> {t.removePromo}
              </button>
            </p>
          ) : (
            <div className="flex gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t.promo}</span>
                <input
                  value={promoInput}
                  onChange={(e) => {
                    setPromoInput(e.target.value.toUpperCase());
                    setPromoError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyPromo();
                    }
                  }}
                  placeholder={t.promo}
                  dir="ltr"
                  className="h-11 w-full rounded-full bg-background px-4 text-sm uppercase ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              <button type="button" onClick={applyPromo} disabled={!promoInput.trim() || promoBusy} className="rounded-full px-5 text-sm font-extrabold text-primary ring-2 ring-primary transition hover:bg-primary hover:text-primary-foreground disabled:opacity-40">
                {promoBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : t.apply}
              </button>
            </div>
          )}
          {promoError && <p className="mt-2 text-sm font-bold text-brand-red">{promoError}</p>}
        </div>

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{tCart.subtotal}</dt>
            <dd className="font-bold tabular-nums">{egp(s.subtotal, locale)}</dd>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-primary">
              <dt>{t.discount}</dt>
              <dd className="font-bold tabular-nums">−{egp(discount, locale)}</dd>
            </div>
          )}
          {s.type === "delivery" && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{tCart.deliveryFee}</dt>
              <dd className="font-bold tabular-nums">{egp(s.deliveryFee, locale)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-dashed border-border pt-3 text-lg">
            <dt className="font-display text-primary">{tCart.total}</dt>
            <dd className="font-extrabold tabular-nums text-primary">{egp(total, locale)}</dd>
          </div>
        </dl>
        {s.belowMinimum && (
          <p className="mt-4 rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">
            {tCart.minDelivery.replace("{amount}", egp(branch.min_delivery_order, locale))}
          </p>
        )}
        {serverError && (
          <p role="alert" className="mt-4 rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={blocked || submitting}
          className="mt-6 flex w-full items-center justify-between gap-3 rounded-full bg-brand-red px-6 py-4 font-extrabold text-brand-cream shadow-lg shadow-brand-red/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted-foreground disabled:shadow-none"
        >
          <span className="inline-flex items-center gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {submitting ? t.placing : t.place}
          </span>
          <span className="tabular-nums">{egp(total, locale)}</span>
        </button>
        <p className="mt-2 text-xs text-muted-foreground">{tCart.estimateNote}</p>
      </aside>
    </form>
  );
}
