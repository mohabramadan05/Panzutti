import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TrackOrder } from "@/components/track-order";
import { Mascot } from "@/components/brand";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).track.metaTitle, robots: { index: false } };
}

/** Find your orders from any device by phone number. */
export default async function TrackPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 pt-6">
        <div className="mb-6 flex items-end justify-center gap-4">
          <Mascot pose="walking" point="end" eager className="h-32 animate-float md:h-44" />
          <h1 className="pb-4 text-4xl text-primary md:text-5xl">{t.track.title}</h1>
        </div>
        <TrackOrder locale={locale} t={t.track} tOrder={t.order} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
