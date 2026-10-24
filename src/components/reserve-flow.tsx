"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Plus, UtensilsCrossed } from "lucide-react";
import { ReservationPicker } from "./reservation-picker";
import type { Branch } from "@/lib/data";
import type { Dictionary, Locale } from "@/lib/i18n";
import { estimateTotals, lineTotal, useCart } from "@/lib/cart";
import { isPickValid } from "@/lib/reservation";
import { egp } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * /reserve: pick date, time and guests (saved in the cart as a reservation), then choose food from the
 * menu and finish in the normal checkout. Everything is re-checked by place_order.
 */
export function ReserveFlow({
  locale,
  t,
  tCheckout,
  tItem,
  tCart,
  branch,
}: {
  locale: Locale;
  t: Dictionary["reserve"];
  tCheckout: Dictionary["checkout"];
  tItem: Pick<Dictionary["item"], "decrease" | "increase">;
  tCart: Dictionary["cart"];
  branch: Branch;
}) {
  const cart = useCart();
  const router = useRouter();
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const pick = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const valid = isPickValid(cart.reservation, branch);
  const totals = estimateTotals({
    subtotal: cart.subtotal,
    type: "reservation",
    taxRate: Number(branch.tax_rate ?? 0.14),
    serviceRate: Number(branch.service_rate ?? 0.12),
  });

  const go = (href: string) => {
    cart.setType("reservation");
    router.push(href);
  };

  if (!cart.ready) return <div className="h-96 animate-pulse rounded-[2rem] bg-muted" aria-busy />;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_1fr]">
      <section data-reveal="up" className="rounded-[2rem] bg-card p-6 ring-1 ring-border md:p-8">
        <h2 className="mb-5 text-2xl text-primary md:text-3xl">{t.when}</h2>
        <ReservationPicker
          value={cart.reservation}
          onChange={cart.setReservation}
          branch={branch}
          locale={locale}
          t={{ ...tCheckout, ...tItem }}
        />
        <p className="mt-5 rounded-2xl bg-brand-yellow/40 px-4 py-3 text-sm font-bold">{t.charges}</p>
      </section>

      <aside data-reveal="up" style={{ "--d": "120ms" } as React.CSSProperties} className="rounded-[2rem] bg-card p-6 ring-1 ring-border lg:sticky lg:top-24">
        <h2 className="flex items-center gap-2 text-2xl text-primary">
          <UtensilsCrossed className="h-5 w-5 text-brand-red" aria-hidden /> {t.yourFood}
        </h2>
        {cart.lines.length ? (
          <>
            <ul className="mt-4 space-y-2 text-sm">
              {cart.lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3">
                  <span className="min-w-0 font-bold">
                    {l.quantity}× {pick(l.item.name_en, l.item.name_ar)}
                  </span>
                  <span className="shrink-0 tabular-nums">{egp(lineTotal(l), locale)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-dashed border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{tCart.service}</dt>
                <dd className="tabular-nums">{egp(totals.service, locale)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{tCart.vat}</dt>
                <dd className="tabular-nums">{egp(totals.tax, locale)}</dd>
              </div>
              <div className="flex justify-between text-base">
                <dt className="font-display text-primary">{tCart.total}</dt>
                <dd className="font-extrabold tabular-nums text-primary">{egp(totals.total, locale)}</dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-4 text-muted-foreground">{t.noFood}</p>
        )}

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={() => go(`/${locale}/menu`)}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-extrabold transition hover:-translate-y-0.5",
              cart.lines.length ? "border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground" : "bg-primary text-primary-foreground shadow-lg shadow-primary/25",
            )}
          >
            <Plus className="h-4 w-4" aria-hidden /> {cart.lines.length ? t.addMore : t.chooseFood}
          </button>
          {cart.lines.length > 0 && (
            <button
              type="button"
              disabled={!valid}
              onClick={() => go(`/${locale}/checkout`)}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-red px-6 py-3.5 font-extrabold text-brand-cream shadow-lg shadow-brand-red/25 transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted-foreground disabled:shadow-none"
            >
              {t.review} <Arrow className="h-4 w-4" aria-hidden />
            </button>
          )}
          {!valid && cart.lines.length > 0 && <p className="text-center text-sm font-bold text-brand-red">{tCheckout.pickTime}</p>}
          <Link href={`/${locale}/cart`} className="text-center text-sm font-bold text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
            {tCheckout.edit}
          </Link>
        </div>
      </aside>
    </div>
  );
}
