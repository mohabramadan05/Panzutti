"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bike, ImageOff, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Stepper } from "./item-configurator";
import { Mascot } from "./brand";
import type { Branch } from "@/lib/data";
import { withImage } from "@/lib/data";
import type { Catalog } from "@/lib/catalog";
import type { Dictionary, Locale } from "@/lib/i18n";
import { MAX_LINE_QUANTITY, freshen, lineTotal, useCart, type OrderType } from "@/lib/cart";
import { supabase } from "@/lib/supabase";
import { egp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Suggestion = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  price: number;
  image_url: string | null;
  has_required_choices: boolean;
};

/** Pickup / delivery switch, shared by the cart and checkout. */
export function OrderTypeToggle({
  value,
  onChange,
  branch,
  t,
}: {
  value: OrderType;
  onChange: (v: OrderType) => void;
  branch: Branch;
  t: Pick<Dictionary["cart"], "pickup" | "delivery">;
}) {
  const options = [
    { v: "delivery" as const, label: t.delivery, Icon: Bike, ok: branch.accepts_delivery },
    { v: "pickup" as const, label: t.pickup, Icon: ShoppingBag, ok: branch.accepts_pickup },
  ];
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
      {options.map(({ v, label, Icon, ok }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={!ok}
          onClick={() => onChange(v)}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-extrabold transition disabled:opacity-40",
            value === v ? "bg-primary text-primary-foreground shadow" : "text-foreground/70 hover:text-primary",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

/** Cart lines checked against the live menu + estimated totals. Shared by cart and checkout. */
export function useCartSummary(catalog: Catalog | null, branch: Branch) {
  const cart = useCart();
  return useMemo(() => {
    const lines = cart.lines.map((l) => freshen(l, catalog));
    const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
    const deliveryFee = cart.type === "delivery" ? branch.delivery_fee : 0;
    const belowMinimum = cart.type === "delivery" && subtotal < branch.min_delivery_order;
    return { ...cart, lines, subtotal, deliveryFee, belowMinimum, hasUnavailable: lines.some((l) => !l.available) };
  }, [cart, catalog, branch]);
}

export function CartView({
  locale,
  t,
  tItem,
  branch,
  catalog,
}: {
  locale: Locale;
  t: Dictionary["cart"];
  tItem: Dictionary["item"];
  branch: Branch;
  /** null when the menu could not be loaded: ordering is paused */
  catalog: Catalog | null;
}) {
  const s = useCartSummary(catalog, branch);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const pick = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const itemIds = s.lines.map((l) => l.item.id).sort().join(",");

  // "Add a drink?" — server picks flagged items not already in the cart
  useEffect(() => {
    if (!supabase || !catalog || !itemIds) return setSuggestions([]);
    let cancelled = false;
    supabase.rpc("get_checkout_suggestions", { p_cart_item_ids: itemIds.split(","), p_limit: 4 }).then(({ data }) => {
      if (!cancelled) setSuggestions(((data ?? []) as Suggestion[]).map(withImage));
    });
    return () => {
      cancelled = true;
    };
  }, [itemIds, catalog]);

  if (!s.ready) return <div className="h-64 animate-pulse rounded-3xl bg-muted" aria-busy />;

  if (!s.lines.length)
    return (
      <div className="flex flex-col items-center rounded-[2rem] bg-card px-6 py-14 text-center ring-1 ring-border">
        <Mascot className="h-64 animate-float" />
        <h2 className="mt-4 text-3xl text-primary">{t.empty}</h2>
        <p className="mt-2 max-w-sm text-muted-foreground">{t.emptyBody}</p>
        <Link href={`/${locale}/menu`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground">
          {t.browse} <Arrow className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    );

  const canCheckout = !!catalog && !s.hasUnavailable && !s.belowMinimum;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <ul className="divide-y divide-border rounded-[2rem] bg-card px-4 ring-1 ring-border sm:px-6">
          {s.lines.map((l) => (
            <li key={l.key} className="flex gap-4 py-5">
              <Link href={`/${locale}/menu/${l.item.slug}`} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-24 sm:w-24">
                {l.item.image_url ? (
                  <Image src={l.item.image_url} alt="" fill sizes="96px" className="object-cover" />
                ) : (
                  <ImageOff className="m-auto h-full w-6 text-muted-foreground" aria-hidden />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg leading-tight text-primary">
                    <Link href={`/${locale}/menu/${l.item.slug}`} className="hover:underline">{pick(l.item.name_en, l.item.name_ar)}</Link>
                  </h3>
                  <span className="shrink-0 font-extrabold tabular-nums text-primary">{egp(lineTotal(l), locale)}</span>
                </div>
                {l.addons.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {l.addons.map((a) => `${a.quantity > 1 ? `${a.quantity}× ` : ""}${pick(a.name_en, a.name_ar)}`).join(" · ")}
                  </p>
                )}
                {l.note && <p className="mt-1 text-sm italic text-muted-foreground">“{l.note}”</p>}
                {!l.available && <p className="mt-2 text-sm font-bold text-brand-red">{t.unavailable}</p>}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <Stepper size="sm" value={l.quantity} min={1} max={MAX_LINE_QUANTITY} onChange={(v) => s.setQuantity(l.key, v)} labels={tItem} />
                  <button type="button" onClick={() => s.remove(l.key)} className="inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-brand-red">
                    <Trash2 className="h-4 w-4" aria-hidden /> {t.remove}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" onClick={s.clear} className="mt-3 text-sm font-bold text-muted-foreground underline-offset-4 hover:text-brand-red hover:underline">
          {t.clear}
        </button>

        {suggestions.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl text-primary">{t.suggestions}</h2>
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {suggestions.map((sug) => (
                <li key={sug.id} className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border">
                  <div className="relative aspect-square bg-muted">
                    {sug.image_url && <Image src={sug.image_url} alt="" fill sizes="160px" className="object-cover" />}
                  </div>
                  <div className="flex flex-1 flex-col p-3">
                    <p className="text-sm font-bold leading-tight">{pick(sug.name_en, sug.name_ar)}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{egp(sug.price, locale)}</p>
                    {sug.has_required_choices ? (
                      <Link href={`/${locale}/menu/${sug.slug}`} className="mt-auto pt-2 text-sm font-extrabold text-primary hover:underline">
                        {t.choose}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          s.add({
                            item: { id: sug.id, slug: sug.slug, name_en: sug.name_en, name_ar: sug.name_ar, price: sug.price, image_url: sug.image_url },
                            addons: [],
                            quantity: 1,
                            note: "",
                          })
                        }
                        className="mt-auto inline-flex items-center gap-1 self-start pt-2 text-sm font-extrabold text-primary hover:text-brand-red"
                      >
                        <Plus className="h-4 w-4" aria-hidden /> {t.add}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <aside className="rounded-[2rem] bg-card p-6 ring-1 ring-border lg:sticky lg:top-24">
        <OrderTypeToggle value={s.type} onChange={s.setType} branch={branch} t={t} />
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{t.subtotal}</dt>
            <dd className="font-bold tabular-nums">{egp(s.subtotal, locale)}</dd>
          </div>
          {s.type === "delivery" && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t.deliveryFee}</dt>
              <dd className="font-bold tabular-nums">{egp(s.deliveryFee, locale)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-dashed border-border pt-3 text-lg">
            <dt className="font-display text-primary">{t.total}</dt>
            <dd className="font-extrabold tabular-nums text-primary">{egp(s.subtotal + s.deliveryFee, locale)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">{t.estimateNote}</p>
        {s.belowMinimum && (
          <p className="mt-4 rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">
            {t.minDelivery.replace("{amount}", egp(branch.min_delivery_order, locale))}
          </p>
        )}
        {!catalog && <p className="mt-4 rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">{tItem.offline}</p>}
        {canCheckout ? (
          <Link
            href={`/${locale}/checkout`}
            className="mt-6 flex items-center justify-center gap-2 rounded-full bg-brand-red px-6 py-4 font-extrabold text-brand-cream shadow-lg shadow-brand-red/25 transition hover:brightness-110"
          >
            {t.checkout} <Arrow className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <span aria-disabled className="mt-6 flex cursor-not-allowed items-center justify-center rounded-full bg-muted-foreground/60 px-6 py-4 font-extrabold text-background">
            {t.checkout}
          </span>
        )}
      </aside>
    </div>
  );
}
