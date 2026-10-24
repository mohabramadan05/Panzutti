import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ApplicationForm } from "@/components/application-form";
import { Mascot } from "@/components/brand";
import { getJoinData } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: t.suppliers.metaTitle,
    description: t.suppliers.metaDescription,
    alternates: { canonical: `/${locale}/suppliers`, languages: { en: "/en/suppliers", ar: "/ar/suppliers" } },
  };
}

export default async function SuppliersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const { services, live } = await getJoinData();

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main">
        <section className="relative overflow-hidden bg-brand-yellow">
          <div aria-hidden className="grain absolute inset-0 opacity-50" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-[1.5fr_1fr] md:py-16">
            <div>
            <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-brand-red">
              <Truck className="h-4 w-4" aria-hidden /> {t.suppliers.kicker}
            </p>
            <h1 className="mt-3 text-5xl text-primary md:text-6xl">{t.suppliers.title}</h1>
            <p className="mt-4 max-w-2xl text-lg text-foreground/80">{t.suppliers.body}</p>
            {services.length > 0 && (
              <>
                <h2 className="mt-8 font-sans text-sm font-extrabold uppercase tracking-wider text-foreground/70">{t.suppliers.whatTitle}</h2>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {services.map((s) => (
                    <li key={s.id} className="rounded-full bg-card px-3 py-1.5 text-sm font-bold text-primary shadow-sm">
                      {locale === "ar" ? s.name_ar : s.name_en}
                    </li>
                  ))}
                </ul>
              </>
            )}
            </div>
            <Mascot point="start" eager className="mx-auto hidden h-80 animate-float drop-shadow-xl md:block" />
          </div>
        </section>

        <div className="mx-auto max-w-3xl px-4 py-12 md:py-16">
          <ApplicationForm mode="service_provider" locale={locale} t={t.joinForm} tc={t.suppliers} services={services} live={live} />
        </div>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
