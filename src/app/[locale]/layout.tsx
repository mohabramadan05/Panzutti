import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { dirOf, getDictionary, isLocale, locales } from "@/lib/i18n";
import { CartProvider } from "@/lib/cart";
import { ScrollReveal } from "@/components/scroll-reveal";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://panzutti.com"),
    title: { default: t.meta.title, template: "%s · Panzutti" },
    description: t.meta.description,
    alternates: { canonical: `/${locale}`, languages: { en: "/en", ar: "/ar" } },
    openGraph: {
      type: "website",
      siteName: "Panzutti",
      title: t.meta.title,
      description: t.meta.description,
      locale: locale === "ar" ? "ar_EG" : "en_US",
    },
    twitter: { card: "summary_large_image" },
    icons: { icon: "/favicon.ico" },
  };
}

export const viewport: Viewport = { themeColor: "#1F6348" };

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body>
        <CartProvider>{children}</CartProvider>
        <ScrollReveal />
      </body>
    </html>
  );
}
