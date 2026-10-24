import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ImageOff, Sparkles } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ItemConfigurator } from "@/components/item-configurator";
import { getMenuItem } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { egp } from "@/lib/format";

export const revalidate = 300;
// Build no item pages up front; each one is rendered on first visit, then cached for `revalidate`
export const generateStaticParams = () => [];

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const found = await getMenuItem(slug);
  if (!found) return {};
  const { item } = found;
  const name = locale === "ar" ? item.name_ar : item.name_en;
  const desc = (locale === "ar" ? item.description_ar ?? item.description_en : item.description_en) ?? undefined;
  return {
    title: name,
    description: desc,
    alternates: { canonical: `/${locale}/menu/${slug}`, languages: { en: `/en/menu/${slug}`, ar: `/ar/menu/${slug}` } },
    openGraph: item.image_url ? { images: [{ url: item.image_url }] } : undefined,
  };
}

export default async function ItemPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const found = await getMenuItem(slug);
  if (!found) notFound();
  const { item, category, live } = found;
  const name = locale === "ar" ? item.name_ar : item.name_en;
  const desc = locale === "ar" ? item.description_ar ?? item.description_en : item.description_en;
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />

      <main id="main" className="mx-auto max-w-6xl px-4 pb-16 pt-4">
        <Link href={`/${locale}/menu#${category.slug}`} className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground/70 hover:text-primary">
          <Back className="h-4 w-4" aria-hidden /> {t.item.back}
        </Link>

        <div className="mt-4 grid items-start gap-8 md:grid-cols-2 md:gap-12">
          <div className="relative md:sticky md:top-24">
            <div className="relative aspect-square overflow-hidden rounded-[2rem] bg-muted shadow-xl shadow-primary/10 ring-8 ring-card">
              {item.image_url ? (
                <Image src={item.image_url} alt={name} fill priority sizes="(min-width: 768px) 540px, 100vw" className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ImageOff className="h-10 w-10" aria-hidden />
                </div>
              )}
            </div>
            {item.is_signature && (
              <span className="absolute -top-3 end-4 inline-flex rotate-6 items-center gap-1 rounded-full bg-brand-yellow px-4 py-1.5 text-sm font-extrabold text-foreground shadow-lg">
                <Sparkles className="h-4 w-4" aria-hidden /> {t.bestsellers.signature}
              </span>
            )}
          </div>

          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand-red">{locale === "ar" ? category.name_ar : category.name_en}</p>
            <h1 className="mt-2 text-4xl text-primary md:text-5xl">{name}</h1>
            <p className="mt-3 text-2xl font-extrabold text-primary">{egp(item.price, locale)}</p>
            {desc && <p className="mt-4 text-lg leading-relaxed text-foreground/80">{desc}</p>}

            {item.is_sold_out && <p className="mt-6 rounded-2xl bg-foreground px-4 py-3 font-bold text-background">{t.item.soldOut}</p>}
            {!live && <p className="mt-6 rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">{t.item.offline}</p>}

            <ItemConfigurator item={item} locale={locale} t={t.item} canOrder={live && !item.is_sold_out} />
          </div>
        </div>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
