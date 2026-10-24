import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Clock, Flame, WifiOff } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { MenuBrowser } from "@/components/menu-browser";
import { Mascot } from "@/components/brand";
import { getMenuData, openStatus } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { brand } from "@/lib/brand";
import { timeLabel } from "@/lib/format";

// Prices and sold-out flags change during the day: re-read at most every 5 minutes
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: t.menu.metaTitle,
    description: t.menu.metaDescription,
    alternates: { canonical: `/${locale}/menu`, languages: { en: "/en/menu", ar: "/ar/menu" } },
  };
}

export default async function MenuPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const data = await getMenuData();
  const { open } = openStatus(data.branch);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <SiteHeader locale={locale} t={t.nav} />

      <main id="main">
        {/* ------------------------------------------------------------ BANNER */}
        <section className="relative overflow-hidden bg-primary text-primary-foreground">
          <span aria-hidden className="pointer-events-none absolute -bottom-6 -start-4 select-none font-display text-[7rem] leading-none text-primary-foreground/[0.05] md:text-[11rem]">
            MENU
          </span>
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-[1.2fr_1fr] md:py-16">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-brand-yellow">
                <Flame className="h-4 w-4" aria-hidden /> {t.menu.kicker}
              </p>
              <h1 className="mt-3 text-5xl md:text-7xl">{t.menu.title}</h1>
              <p className="mt-4 max-w-md text-lg opacity-90">{t.menu.subtitle}</p>
              {!open && (
                <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-red px-4 py-2 text-sm font-bold text-brand-cream">
                  <Clock className="h-4 w-4" aria-hidden /> {t.menu.closedNote.replace("{time}", timeLabel(data.branch.opens_at, locale))}
                </p>
              )}
            </div>
            <div className="relative hidden md:block">
              <div className="relative aspect-[5/3] rotate-2 overflow-hidden rounded-[2rem] bg-brand-green-dark shadow-2xl ring-8 ring-brand-cream">
                <Image src={brand.photos.hero} alt="" fill priority sizes="440px" className="object-cover" />
              </div>
              <Mascot point="end" eager className="absolute -bottom-12 -start-16 h-60 animate-float drop-shadow-xl" />
            </div>
          </div>
        </section>

        {!data.live && (
          <p className="mx-auto mt-4 flex max-w-6xl items-center gap-2 px-4 text-sm text-muted-foreground">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden /> {t.menu.offline}
          </p>
        )}

        <MenuBrowser categories={data.categories} locale={locale} t={t.menu} tCard={t.bestsellers} />
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
