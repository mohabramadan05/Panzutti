import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Camera } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FamilyWall } from "@/components/family-wall";
import { Mascot } from "@/components/brand";
import { getFamilyWall } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

// New approvals show up within 5 minutes; signed photo URLs last an hour
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: t.familyPage.metaTitle,
    description: t.familyPage.metaDescription,
    alternates: { canonical: `/${locale}/family`, languages: { en: "/en/family", ar: "/ar/family" } },
  };
}

export default async function FamilyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const { photos, live } = await getFamilyWall();

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main">
        <section className="relative overflow-hidden bg-brand-yellow">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:py-16">
            <div className="animate-fade-up">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand-red">{t.family.kicker}</p>
              <h1 className="mt-2 text-5xl text-primary md:text-6xl">{t.family.title}</h1>
              <p className="mt-4 max-w-lg text-lg text-foreground/80">{t.family.body}</p>
              <Link
                href={`/${locale}/family/share`}
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:brightness-110"
              >
                <Camera className="h-4 w-4" aria-hidden /> {t.familyPage.share}
              </Link>
            </div>
            <Mascot point="start" eager className="mx-auto hidden h-80 animate-float drop-shadow-xl md:block" />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <FamilyWall initial={photos} live={live} locale={locale} t={t.familyPage} />
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
