import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { FamilyShare } from "@/components/family-share";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).share.metaTitle, robots: { index: false } };
}

export default async function SharePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 pt-4">
        <Link href={`/${locale}/family`} className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground/70 hover:text-primary">
          <Back className="h-4 w-4" aria-hidden /> {t.share.back}
        </Link>
        <h1 className="mt-4 text-4xl text-primary md:text-5xl">{t.share.title}</h1>
        <p className="mb-8 mt-3 max-w-2xl text-lg text-foreground/80">{t.share.body}</p>
        <FamilyShare locale={locale} t={t.share} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
