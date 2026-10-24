import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CheckoutForm } from "@/components/checkout-form";
import { getMenuData } from "@/lib/data";
import { buildCatalog } from "@/lib/catalog";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

// Branch hours, fee and sold-out flags must be fresh here
export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).checkout.metaTitle, robots: { index: false } };
}

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const data = await getMenuData();

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 pt-6">
        <h1 className="mb-8 text-4xl text-primary md:text-5xl">{t.checkout.title}</h1>
        <CheckoutForm locale={locale} t={t.checkout} tCart={t.cart} branch={data.branch} catalog={data.live ? buildCatalog(data.categories) : null} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
