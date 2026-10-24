import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Flame, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ApplicationForm } from "@/components/application-form";
import { Mascot } from "@/components/brand";
import { getJoinData } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

// Open positions change rarely; refresh every 10 minutes
export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: t.careers.metaTitle,
    description: t.careers.metaDescription,
    alternates: { canonical: `/${locale}/careers`, languages: { en: "/en/careers", ar: "/ar/careers" } },
  };
}

export default async function CareersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const { positions, live } = await getJoinData();

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main">
        <section className="relative overflow-hidden bg-primary text-primary-foreground">
          <span aria-hidden className="pointer-events-none absolute -bottom-8 -end-4 select-none font-display text-[7rem] leading-none text-primary-foreground/[0.05] md:text-[11rem]">
            TEAM
          </span>
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:py-16">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-brand-yellow">
                <Flame className="h-4 w-4" aria-hidden /> {t.careers.kicker}
              </p>
              <h1 className="mt-3 text-5xl md:text-6xl">{t.careers.title}</h1>
              <p className="mt-4 max-w-xl text-lg opacity-90">{t.careers.body}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {t.careers.perks.map((p) => (
                  <li key={p} className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-sm font-bold ring-1 ring-primary-foreground/20">
                    <Sparkles className="h-3.5 w-3.5 text-brand-yellow" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <Mascot point="start" eager className="mx-auto hidden h-80 animate-float drop-shadow-xl md:block" />
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <ApplicationForm mode="job" locale={locale} t={t.joinForm} tc={t.careers} positions={positions} live={live} />
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
