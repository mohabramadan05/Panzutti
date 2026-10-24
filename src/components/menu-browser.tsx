"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CakeSlice, Coffee, CupSoda, Drumstick, GlassWater, Salad, Sandwich, Search, Sparkles, X } from "lucide-react";
import { ProductCard } from "./product-card";
import { Mascot } from "./brand";
import type { MenuCategory } from "@/lib/data";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const iconFor = (slug: string) =>
  slug.includes("morning") || slug.includes("hot") || slug.includes("coffee") ? Coffee
  : slug.includes("sweet") || slug.includes("dessert") ? CakeSlice
  : slug.includes("panuozzo") ? Sandwich
  : slug.includes("fresh") || slug.includes("salad") ? Salad
  : slug.includes("signature") ? Sparkles
  : slug.includes("refresher") || slug.includes("smoothie") || slug.includes("tea") ? CupSoda
  : slug.includes("sauce") ? GlassWater
  : Drumstick;

export function MenuBrowser({
  categories,
  locale,
  t,
  tCard,
}: {
  categories: MenuCategory[];
  locale: Locale;
  t: Dictionary["menu"];
  tCard: Dictionary["bestsellers"];
}) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(categories[0]?.slug ?? "");
  const tabsRef = useRef<HTMLDivElement>(null);
  const pick = (en: string, ar: string | null) => (locale === "ar" ? ar ?? en : en);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return categories;
    return categories
      .map((c) => ({
        ...c,
        items: c.items.filter((i) =>
          [i.name_en, i.name_ar, i.description_en, i.description_ar].some((s) => s?.toLowerCase().includes(term)),
        ),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, q]);

  // Scroll-spy: the category whose section crosses the band under the sticky bars is "active"
  useEffect(() => {
    const sections = visible.map((c) => document.getElementById(c.slug)).filter((el): el is HTMLElement => !!el);
    if (!sections.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-160px 0px -55% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [visible]);

  // Keep the active tab visible in the horizontal strip
  useEffect(() => {
    tabsRef.current
      ?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(active)}"]`)
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  return (
    <>
      <div className="sticky top-16 z-30 border-b border-border bg-brand-cream/95 backdrop-blur-md md:top-20">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <nav ref={tabsRef} aria-label={t.categories} className="-my-1 flex min-w-0 flex-1 gap-2 overflow-x-auto py-1 [scrollbar-width:none]">
            {visible.map((c) => {
              const Icon = iconFor(c.slug);
              const on = active === c.slug;
              return (
                <a
                  key={c.id}
                  href={`#${c.slug}`}
                  data-slug={c.slug}
                  aria-current={on ? "true" : undefined}
                  onClick={() => setActive(c.slug)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ring-1 transition",
                    on ? "bg-primary text-primary-foreground ring-primary" : "bg-card text-foreground/80 ring-border hover:text-primary hover:ring-primary/50",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {pick(c.name_en, c.name_ar)}
                </a>
              );
            })}
          </nav>

          <label className="relative hidden shrink-0 sm:block">
            <span className="sr-only">{t.search}</span>
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t.search}
              className="h-10 w-56 rounded-full bg-card ps-9 pe-4 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>

        {/* Search on phones sits under the tabs */}
        <label className="relative mx-4 mb-3 block sm:hidden">
          <span className="sr-only">{t.search}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.search}
            className="h-10 w-full rounded-full bg-card ps-9 pe-4 text-sm ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
          />
        </label>
      </div>

      <div className="mx-auto max-w-6xl px-4 pb-20 pt-4">
        {visible.length === 0 && (
          <div className="mt-10 flex flex-col items-center gap-4 rounded-3xl bg-card p-10 text-center ring-1 ring-border">
            <Mascot className="h-44" />
            <p className="text-lg text-muted-foreground">{t.noResults.replace("{q}", q.trim())}</p>
            <button type="button" onClick={() => setQ("")} className="inline-flex items-center gap-1 rounded-full border-2 border-primary px-5 py-2 font-bold text-primary hover:bg-primary hover:text-primary-foreground">
              <X className="h-4 w-4" aria-hidden /> {t.clear}
            </button>
          </div>
        )}

        {visible.map((c) => (
          <section key={c.id} id={c.slug} aria-labelledby={`${c.slug}-title`} className="scroll-mt-40 pt-10 md:scroll-mt-44">
            <div className="mb-6 flex items-baseline justify-between gap-4 border-b-2 border-dashed border-border pb-3">
              <h2 id={`${c.slug}-title`} className="text-3xl text-primary md:text-4xl">{pick(c.name_en, c.name_ar)}</h2>
              <span className="shrink-0 text-sm font-bold text-muted-foreground">{c.items.length === 1 ? t.item : t.items.replace("{n}", String(c.items.length))}</span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {c.items.map((item) => (
                <ProductCard key={item.id} item={item} locale={locale} t={tCard} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
