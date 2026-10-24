import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Globe } from "lucide-react";
import { Logo } from "@/components/brand";
import { PizzaScrollytelling } from "@/components/pizza-scrollytelling";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { PIZZA_PHOTO_CREDITS } from "@/lib/pizza-photos";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: t.scrolly.metaTitle,
    description: t.scrolly.metaDescription,
    alternates: { canonical: `/${locale}/pizza`, languages: { en: "/en/pizza", ar: "/ar/pizza" } },
  };
}

/** Standalone dark "making of" page: a pinned, scroll-scrubbed pizza build. */
export default async function PizzaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const other = locale === "en" ? "ar" : "en";
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <div className="min-h-screen bg-[#111417] text-white">
      {/* Fixed bar stays above the pinned section; the gradient keeps it readable over the food */}
      <header className="fixed inset-x-0 top-0 z-50 bg-linear-to-b from-[#111417] to-transparent">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href={`/${locale}`} className="inline-flex items-center gap-2 text-sm font-bold text-white/70 transition hover:text-white">
            <Back className="h-4 w-4" aria-hidden /> {t.scrolly.back}
          </Link>
          <Link href={`/${locale}`} aria-label="Panzutti home">
            <Logo variant="cream" className="h-9" />
          </Link>
          <Link href={`/${other}/pizza`} hrefLang={other} className="inline-flex items-center gap-1.5 text-sm font-bold text-white/70 transition hover:text-white">
            <Globe className="h-4 w-4" aria-hidden />
            <span className={other === "ar" ? "font-arabic text-base" : ""}>{t.nav.language}</span>
          </Link>
        </div>
      </header>

      <main>
        <PizzaScrollytelling t={t.scrolly} />

        {/* Revealed once the pin releases */}
        <section className="relative border-t border-white/10">
          <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-24 text-center md:py-32">
            <h2 className="text-5xl md:text-7xl">{t.scrolly.outroTitle}</h2>
            <p className="mt-5 max-w-md text-lg text-white/65">{t.scrolly.outroBody}</p>
            <Link
              href={`/${locale}/menu`}
              className="mt-10 inline-flex items-center gap-2 rounded-full bg-brand-red px-8 py-4 font-extrabold text-white shadow-lg shadow-brand-red/30 transition hover:-translate-y-0.5 hover:brightness-110"
            >
              {t.scrolly.cta} <Arrow className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <p className="mx-auto max-w-3xl px-4 pb-10 text-center text-xs text-white/35">
            {t.scrolly.photos}:{" "}
            {PIZZA_PHOTO_CREDITS.map((c, i) => (
              <span key={c.href}>
                {i > 0 && " · "}
                <a href={c.href} target="_blank" rel="noreferrer" className="underline-offset-2 hover:text-white/70 hover:underline" dir="ltr">
                  {c.what} {c.by}
                </a>
              </span>
            ))}
          </p>
        </section>
      </main>
    </div>
  );
}
