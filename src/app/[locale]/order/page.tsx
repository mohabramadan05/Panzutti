import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OrderConfirmation } from "@/components/order-status";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).order.metaTitle, robots: { index: false } };
}

/** Confirmation + status for the order this device just placed (`?n=<order number>`). */
export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ n?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const { n } = await searchParams;
  const orderNumber = n && /^\d+$/.test(n) ? Number(n) : null;

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main" className="mx-auto max-w-6xl px-4 pb-20 pt-6">
        <OrderConfirmation locale={locale} t={t.order} orderNumber={orderNumber} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
