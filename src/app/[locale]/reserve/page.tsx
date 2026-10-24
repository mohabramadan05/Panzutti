import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ReserveFlow } from "@/components/reserve-flow";
import { Mascot } from "@/components/brand";
import { getMenuData } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Branch hours must be fresh for the time slots
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale).reserve;
  return { title: t.metaTitle, description: t.metaDescription };
}

/** Table reservation with pre-ordered food (dine-in). Totals add 12% service + 14% VAT (place_order v4). */
export default async function ReservePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const { branch } = await getMenuData();

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <section className="relative mb-10 grid items-center gap-6 overflow-hidden rounded-[2.5rem] bg-primary px-6 py-10 text-primary-foreground md:grid-cols-[1.3fr_1fr] md:px-12 md:py-14">
          <div aria-hidden className="absolute -end-20 -top-24 h-72 w-72 rounded-full bg-brand-yellow/25 blur-3xl" />
          <div className="relative animate-fade-up">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-brand-yellow">{t.reserve.kicker}</p>
            <h1 className="mt-2 text-5xl md:text-6xl">{t.reserve.title}</h1>
            <p className="mt-4 max-w-lg text-lg opacity-90">{t.reserve.body}</p>
            <ol className="mt-6 grid gap-3 sm:grid-cols-3">
              {t.reserve.steps.map((s, i) => (
                <li key={s.t} className="animate-fade-up rounded-2xl bg-primary-foreground/[0.08] p-4 ring-1 ring-primary-foreground/15" style={{ animationDelay: `${200 + i * 120}ms` }}>
                  <span className={cn("text-2xl text-brand-yellow", locale === "ar" ? "font-arabic" : "font-script")}>0{i + 1}</span>
                  <p className="mt-1 font-display text-lg leading-tight">{s.t}</p>
                  <p className="text-sm opacity-75">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
          {/* relaxing at his table — what a reservation feels like */}
          <div className="relative mx-auto flex h-64 w-full max-w-sm items-end justify-center md:h-80">
            <div aria-hidden className="absolute bottom-0 h-56 w-56 rounded-full bg-brand-yellow md:h-72 md:w-72" />
            <Mascot pose="sitting" point="start" eager className="relative h-full animate-slide-in drop-shadow-2xl" />
          </div>
        </section>

        <ReserveFlow locale={locale} t={t.reserve} tCheckout={t.checkout} tItem={t.item} tCart={t.cart} branch={branch} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
