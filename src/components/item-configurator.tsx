"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, CheckCircle2, Minus, Plus, ShoppingCart } from "lucide-react";
import type { AddonGroup, MenuItem } from "@/lib/data";
import type { Dictionary, Locale } from "@/lib/i18n";
import { MAX_LINE_QUANTITY, missingGroups, useCart, type CartAddon } from "@/lib/cart";
import { egp } from "@/lib/format";
import { cn } from "@/lib/utils";

type Picked = Record<string, number>; // addon id -> quantity

const defaults = (groups: AddonGroup[]): Picked =>
  Object.fromEntries(groups.flatMap((g) => g.addons.filter((a) => a.is_default && !a.is_sold_out).slice(0, g.max_select).map((a) => [a.id, 1])));

function groupHint(g: AddonGroup, t: Dictionary["item"]) {
  if (g.max_select === 1) return t.chooseOne;
  if (g.min_select === 0) return t.chooseUpTo.replace("{n}", String(g.max_select));
  return t.chooseRange.replace("{min}", String(g.min_select)).replace("{max}", String(g.max_select));
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  labels,
  size = "md",
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  labels: { decrease: string; increase: string };
  size?: "sm" | "md";
}) {
  const btn = cn(
    "inline-flex items-center justify-center rounded-full bg-card text-primary ring-1 ring-border transition hover:ring-primary disabled:opacity-40 disabled:hover:ring-border",
    size === "sm" ? "h-8 w-8" : "h-10 w-10",
  );
  return (
    <div className="inline-flex items-center gap-3">
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={labels.decrease}>
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className={cn("min-w-6 text-center font-extrabold tabular-nums", size === "md" && "text-lg")} aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={labels.increase}>
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function ItemConfigurator({
  item,
  locale,
  t,
  canOrder,
}: {
  item: MenuItem;
  locale: Locale;
  t: Dictionary["item"];
  canOrder: boolean;
}) {
  const { add } = useCart();
  const groups = item.addon_groups ?? [];
  const [picked, setPicked] = useState<Picked>(() => defaults(groups));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState<AddonGroup[]>([]);
  const [added, setAdded] = useState(false);
  const pick = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);

  const chosen = groups.flatMap((g) =>
    g.addons
      .filter((a) => (picked[a.id] ?? 0) > 0)
      .map<CartAddon>((a) => ({ id: a.id, group_id: g.id, name_en: a.name_en, name_ar: a.name_ar, price: a.price, quantity: picked[a.id] })),
  );
  const unit = item.price + chosen.reduce((s, a) => s + a.price * a.quantity, 0);

  const toggle = (g: AddonGroup, addonId: string) => {
    setAdded(false);
    setPicked((p) => {
      const next = { ...p };
      const on = (next[addonId] ?? 0) > 0;
      if (g.max_select === 1) {
        // radio behaviour; a required single choice can't be cleared, only switched
        if (on && g.min_select > 0) return p;
        g.addons.forEach((a) => delete next[a.id]);
        if (!on) next[addonId] = 1;
        return next;
      }
      if (on) delete next[addonId];
      else if (g.addons.filter((a) => (next[a.id] ?? 0) > 0).length < g.max_select) next[addonId] = 1;
      return next;
    });
    setMissing((m) => m.filter((x) => x.id !== g.id));
  };

  const submit = () => {
    const miss = missingGroups(groups, picked);
    setMissing(miss);
    if (miss.length) {
      document.getElementById(`group-${miss[0].id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    add({
      item: { id: item.id, slug: item.slug, name_en: item.name_en, name_ar: item.name_ar, price: item.price, image_url: item.image_url },
      addons: chosen,
      quantity,
      note: note.trim(),
    });
    setAdded(true);
  };

  return (
    <div className="mt-8">
      {groups.map((g) => {
        const count = g.addons.filter((a) => (picked[a.id] ?? 0) > 0).length;
        const full = count >= g.max_select;
        const isMissing = missing.some((m) => m.id === g.id);
        return (
          <fieldset
            key={g.id}
            id={`group-${g.id}`}
            className={cn("mb-6 scroll-mt-28 rounded-3xl bg-card p-5 ring-1", isMissing ? "ring-2 ring-brand-red" : "ring-border")}
          >
            <legend className="sr-only">{pick(g.name_en, g.name_ar)}</legend>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-xl text-primary">{pick(g.name_en, g.name_ar)}</h2>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold", g.min_select > 0 ? "bg-brand-red/10 text-brand-red" : "bg-muted text-muted-foreground")}>
                {g.min_select > 0 ? t.required : t.optional} · {groupHint(g, t)}
              </span>
            </div>
            <ul className="divide-y divide-border">
              {g.addons.map((a) => {
                const qty = picked[a.id] ?? 0;
                const on = qty > 0;
                const disabled = a.is_sold_out || (!on && full && g.max_select > 1);
                return (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <button
                      type="button"
                      role={g.max_select === 1 ? "radio" : "checkbox"}
                      aria-checked={on}
                      disabled={disabled}
                      onClick={() => toggle(g, a.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-start disabled:opacity-45"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center border-2 transition",
                          g.max_select === 1 ? "rounded-full" : "rounded-lg",
                          on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
                        )}
                      >
                        {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1 font-semibold">{pick(a.name_en, a.name_ar)}</span>
                    </button>
                    {on && a.max_quantity > 1 && (
                      <Stepper
                        size="sm"
                        value={qty}
                        min={1}
                        max={a.max_quantity}
                        onChange={(v) => setPicked((p) => ({ ...p, [a.id]: v }))}
                        labels={t}
                      />
                    )}
                    <span className="shrink-0 text-sm font-bold text-muted-foreground">
                      {a.is_sold_out ? "—" : a.price ? `+${egp(a.price, locale)}` : t.free}
                    </span>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}

      <label className="block">
        <span className="mb-2 block font-display text-xl text-primary">{t.note}</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          rows={2}
          placeholder={t.notePlaceholder}
          className="w-full resize-none rounded-2xl bg-card px-4 py-3 ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
        />
      </label>

      {missing.length > 0 && (
        <p role="alert" className="mt-4 rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">
          {t.missing.replace("{groups}", missing.map((g) => pick(g.name_en, g.name_ar)).join("، "))}
        </p>
      )}

      {added ? (
        <div role="status" className="mt-6 rounded-3xl bg-primary p-5 text-primary-foreground">
          <p className="flex items-center gap-2 font-display text-xl">
            <CheckCircle2 className="h-6 w-6 text-brand-yellow" aria-hidden /> {t.added}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={`/${locale}/cart`} className="inline-flex items-center gap-2 rounded-full bg-brand-yellow px-5 py-2.5 font-extrabold text-foreground">
              <ShoppingCart className="h-4 w-4" aria-hidden /> {t.viewCart}
            </Link>
            <Link href={`/${locale}/menu`} className="inline-flex rounded-full px-5 py-2.5 font-bold ring-2 ring-primary-foreground/40 hover:ring-primary-foreground">
              {t.keepBrowsing}
            </Link>
          </div>
        </div>
      ) : (
        <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex items-center gap-4 border-t border-border bg-brand-cream/95 px-4 py-4 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
          <Stepper value={quantity} min={1} max={MAX_LINE_QUANTITY} onChange={(v) => { setQuantity(v); setAdded(false); }} labels={t} />
          <button
            type="button"
            onClick={submit}
            disabled={!canOrder}
            className="flex flex-1 items-center justify-between gap-3 rounded-full bg-brand-red px-6 py-3.5 font-extrabold text-brand-cream shadow-lg shadow-brand-red/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted-foreground disabled:shadow-none"
          >
            <span>{t.add}</span>
            <span className="tabular-nums">{egp(unit * quantity, locale)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
