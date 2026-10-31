import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Flame, WifiOff } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Mascot } from "@/components/brand";
import { getTeamPhotos } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// New photos from the admin panel show up within 5 minutes
export const revalidate = 300;

const TILTS = ["-rotate-2", "rotate-1", "rotate-2", "-rotate-1"];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  return {
    title: t.teamPage.metaTitle,
    description: t.teamPage.metaDescription,
    alternates: { canonical: `/${locale}/team`, languages: { en: "/en/team", ar: "/ar/team" } },
  };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const { photos, live } = await getTeamPhotos();
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <>
      <SiteHeader locale={locale} t={t.nav} />
      <main id="main">
        <section className="relative overflow-hidden bg-primary text-primary-foreground">
          <span aria-hidden className="pointer-events-none absolute -bottom-8 -end-4 select-none font-display text-[7rem] leading-none text-primary-foreground/[0.05] md:text-[11rem]">
            TEAM
          </span>
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-[1.4fr_1fr] md:py-16">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.25em] text-brand-yellow">
                <Flame className="h-4 w-4" aria-hidden /> {t.teamPage.kicker}
              </p>
              <h1 className="mt-3 text-5xl md:text-6xl">{t.teamPage.title}</h1>
              <p className="mt-4 max-w-xl text-lg opacity-90">{t.teamPage.body}</p>
              <Link
                href={`/${locale}/careers`}
                className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-yellow px-6 py-3 font-extrabold text-foreground shadow-lg transition hover:-translate-y-0.5 hover:brightness-105"
              >
                {t.teamPage.join} <Arrow className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <Mascot pose="welcoming" point="start" eager className="mx-auto hidden h-80 animate-float drop-shadow-xl md:block" />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          {!live && (
            <p className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
              <WifiOff className="h-4 w-4 shrink-0" aria-hidden /> {t.teamPage.offline}
            </p>
          )}
          {photos.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <Mascot pose="sitting" point="start" className="h-56" />
              <p className="mt-4 font-display text-2xl text-primary">{t.teamPage.empty}</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-5 sm:gap-8 md:grid-cols-3 lg:grid-cols-4">
              {photos.map((p, i) => {
                const role = (locale === "ar" ? p.role_ar : null) ?? p.role_en;
                return (
                  <li key={p.id} data-reveal className={cn("rounded-xl bg-card p-2.5 pb-3 shadow-lg ring-1 ring-border transition hover:rotate-0", TILTS[i % TILTS.length])}>
                    <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted">
                      <Image src={p.url} alt={p.name ?? t.teamPage.photoAlt} fill sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw" className="object-cover" />
                    </div>
                    {(p.name || role) && (
                      <div className="mt-2 px-1 text-center">
                        {p.name && <p className="font-display text-lg leading-tight text-primary">{p.name}</p>}
                        {role && <p className="text-sm text-muted-foreground">{role}</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
