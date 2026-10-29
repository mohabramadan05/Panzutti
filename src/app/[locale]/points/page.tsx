import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PointsCheck, PointsHow } from "@/components/points-check";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).points.metaTitle, robots: { index: false } };
}

/** Loyalty points balance by phone number (get_loyalty, v5 SQL). */
export default async function PointsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-24 pt-6">
        <div className="mb-8 text-center md:mb-4">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand-red">{t.points.kicker}</p>
          <h1 className="mt-2 text-4xl text-primary md:text-5xl">{t.points.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-foreground/80">{t.points.subtitle}</p>
        </div>
        <PointsCheck locale={locale} t={t.points} />
        <h2 className="mb-5 mt-16 text-center text-3xl text-primary">{t.points.howTitle}</h2>
        <PointsHow t={t.points} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
