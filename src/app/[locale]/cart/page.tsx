import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CartView } from "@/components/cart-view";
import { getMenuData } from "@/lib/data";
import { buildCatalog } from "@/lib/catalog";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).cart.metaTitle, robots: { index: false } };
}

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const data = await getMenuData();

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 pt-6">
        <h1 className="mb-8 text-4xl text-primary md:text-5xl">{t.cart.title}</h1>
        <CartView locale={locale} t={t.cart} tItem={t.item} branch={data.branch} catalog={data.live ? buildCatalog(data.categories) : null} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
