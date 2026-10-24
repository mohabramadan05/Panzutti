/* eslint-disable @next/next/no-img-element -- remote brand photos of unknown size in decorative collages */
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight, ArrowLeft, Bike, ShoppingBag, Wallet, Flame, Clock, MapPin, Phone,
  Camera, Briefcase, Truck, Sparkles, Heart,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { PizzaAssembly } from "@/components/pizza-assembly";
import { WelcomePopup } from "@/components/welcome-popup";
import { Mascot, SectionTitle } from "@/components/brand";
import { getHomeData, openStatus } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { brand } from "@/lib/brand";
import { telHref, timeLabel } from "@/lib/format";

// Re-read the menu and gallery from Supabase at most every 5 minutes
export const revalidate = 300;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const data = await getHomeData();
  const { open } = openStatus(data.branch);
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const name = (i: { name_en: string; name_ar: string }) => (locale === "ar" ? i.name_ar : i.name_en);

  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        Skip to content
      </a>
      <SiteHeader locale={locale} t={t.nav} />

      <main id="main">
        {/* ------------------------------------------------------------ HERO */}
        <section className="relative -mt-16 overflow-hidden pt-16 md:-mt-20 md:pt-20">
          <div aria-hidden className="grain absolute inset-0 -z-10" />
          <div aria-hidden className="absolute -end-40 -top-40 -z-10 h-[34rem] w-[34rem] rounded-full bg-brand-yellow/35 blur-3xl" />

          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-6 md:grid-cols-[1fr_1.1fr] md:pb-20 md:pt-10">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-brand-red ring-1 ring-border">
                <Flame className="h-3.5 w-3.5" aria-hidden /> {t.hero.kicker}
              </p>

              <h1 className="mt-5 text-5xl text-primary sm:text-6xl lg:text-7xl">
                {t.hero.titleTop}
                <span className={`block text-6xl text-brand-red sm:text-7xl lg:text-8xl ${locale === "ar" ? "font-arabic" : "font-script"}`}>
                  {t.hero.titleScript}
                </span>
              </h1>

              <p className="mt-5 max-w-md text-lg text-foreground/80">{t.hero.subtitle}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`/${locale}/menu`} className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-extrabold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:brightness-110">
                  {t.hero.orderNow} <Arrow className="h-4 w-4" aria-hidden />
                </Link>
                <Link href={`/${locale}/menu`} className="inline-flex rounded-full border-2 border-primary px-7 py-3.5 font-extrabold text-primary transition hover:bg-primary hover:text-primary-foreground">
                  {t.hero.explore}
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-bold text-foreground/75">
                <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${open ? "bg-primary/10 text-primary" : "bg-brand-red/10 text-brand-red"}`}>
                  <span className={`h-2 w-2 rounded-full ${open ? "animate-pulse bg-primary" : "bg-brand-red"}`} aria-hidden />
                  {open
                    ? `${t.hero.open} · ${t.hero.until} ${timeLabel(data.branch.closes_at, locale)}`
                    : `${t.hero.closed} · ${t.hero.opensAt} ${timeLabel(data.branch.opens_at, locale)}`}
                </span>
                {t.hero.perks.map((p) => (
                  <span key={p} className="inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-brand-red" aria-hidden /> {p}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative animate-fade-up [animation-delay:120ms]">
              <div className="relative aspect-[5/4] overflow-hidden rounded-[2.5rem] bg-muted shadow-2xl shadow-primary/20 ring-8 ring-card">
                <Image src={brand.photos.hero} alt="A Panzutti panuozzo with a long cheese pull" fill priority sizes="(min-width: 768px) 560px, 100vw" className="object-cover" />
              </div>
              <div className="absolute -top-4 end-3 flex h-24 w-24 rotate-12 items-center justify-center rounded-full bg-brand-red text-center text-brand-cream shadow-xl md:h-28 md:w-28">
                <span className={`whitespace-pre-line leading-tight ${locale === "ar" ? "font-arabic text-lg" : "font-script text-xl"}`}>{t.hero.sticker}</span>
              </div>
              <Mascot point="end" eager className="absolute -bottom-14 -start-20 hidden h-80 animate-float drop-shadow-xl md:block lg:h-96" />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ MARQUEE */}
        <div className="overflow-hidden border-y-4 border-brand-cream bg-brand-red py-3 text-brand-cream" aria-hidden>
          <div className="flex w-max animate-marquee gap-8 whitespace-nowrap">
            {[...data.allItems, ...data.allItems].map((i, n) => (
              <span key={`${i.id}-${n}`} className="flex items-center gap-8 font-display text-2xl">
                {name(i)} <Flame className="h-5 w-5 text-brand-yellow" />
              </span>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------------------ BESTSELLERS */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-end gap-3 md:gap-5">
              {/* presents the bestsellers */}
              <Mascot point="end" className="mb-4 h-28 shrink-0 md:mb-2 md:h-44" />
              <SectionTitle kicker={t.bestsellers.kicker} title={t.bestsellers.title} />
            </div>
            <Link href={`/${locale}/menu`} className="mb-8 hidden items-center gap-1 font-bold text-primary underline-offset-4 hover:underline sm:inline-flex">
              {t.bestsellers.viewAll} <Arrow className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {data.signature.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.signature.slice(0, 4).map((item) => (
                <ProductCard key={item.id} item={item} locale={locale} t={t.bestsellers} />
              ))}
            </div>
          ) : (
            <p className="rounded-3xl bg-card p-8 text-center text-muted-foreground">{t.bestsellers.empty}</p>
          )}
          <Link href={`/${locale}/menu`} className="mt-8 flex items-center justify-center gap-1 rounded-full border-2 border-primary py-3 font-bold text-primary sm:hidden">
            {t.bestsellers.viewAll} <Arrow className="h-4 w-4" aria-hidden />
          </Link>
        </section>

        {/* ------------------------------------------------------------ STORY */}
        <section id="story" className="relative scroll-mt-20 overflow-hidden bg-primary text-primary-foreground">
          <span aria-hidden className="pointer-events-none absolute -end-6 top-6 select-none font-display text-[9rem] leading-none text-primary-foreground/[0.05] md:text-[15rem]">
            PANUOZZO
          </span>
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-20 md:grid-cols-2 md:py-28">
            <div className="relative mx-auto w-full max-w-md md:max-w-none">
              <div className="relative aspect-[4/5] -rotate-2 overflow-hidden rounded-[2rem] bg-brand-green-dark shadow-2xl ring-8 ring-brand-cream">
                <Image src={brand.photos.oven} alt="Panuozzo baking in the wood-fired oven" fill sizes="(min-width: 768px) 480px, 90vw" className="object-cover" />
              </div>
              <figure className="absolute -bottom-8 -end-3 w-[44%] rotate-6 rounded-2xl bg-brand-cream p-2 pb-8 shadow-xl md:-end-8">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
                  <Image src={brand.photos.story} alt="" fill sizes="220px" className="object-cover" />
                </div>
                <figcaption className={`absolute inset-x-0 bottom-1 text-center text-lg text-brand-red ${locale === "ar" ? "font-arabic" : "font-script"}`}>
                  {t.story.caption}
                </figcaption>
              </figure>
              <div className="absolute -start-3 -top-5 flex h-24 w-24 -rotate-12 flex-col items-center justify-center rounded-full bg-brand-red text-center text-brand-cream shadow-lg md:-start-6 md:h-28 md:w-28">
                <span className="font-arabic text-2xl md:text-3xl">على إيدك</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">{t.story.badge}</span>
              </div>
            </div>

            <div>
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-brand-yellow">{t.story.kicker}</p>
              <h2 className="mt-3 text-4xl md:text-6xl">
                <span className="block">{t.story.titleA}</span>
                <span className="block text-brand-yellow">{t.story.titleB}</span>
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed opacity-90">{t.story.body}</p>

              <ol className="mt-8 grid gap-3 sm:grid-cols-3">
                {t.story.steps.map((s, i) => (
                  <li key={s.t} className="rounded-2xl bg-primary-foreground/[0.07] p-4 ring-1 ring-primary-foreground/15">
                    <span className="font-script text-2xl text-brand-yellow">0{i + 1}</span>
                    <p className="mt-1 font-display text-lg leading-tight">{s.t}</p>
                    <p className="text-sm opacity-75">{s.d}</p>
                  </li>
                ))}
              </ol>

              <Link href={`/${locale}/menu`} className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-yellow px-6 py-3 font-extrabold text-foreground transition hover:brightness-105">
                {t.story.cta} <Arrow className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ BUILD A PIZZA */}
        <PizzaAssembly locale={locale} t={t.pizza} />

        {/* ------------------------------------------------------------ HOW TO ORDER */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <SectionTitle kicker={t.how.kicker} title={t.how.title} />
          <div className="grid gap-5 md:grid-cols-3">
            {t.how.items.map((o, i) => {
              const Icon = [Bike, ShoppingBag, Wallet][i];
              return (
                <Link
                  key={o.t}
                  href={`/${locale}/menu`}
                  className="group relative overflow-hidden rounded-[1.75rem] bg-card p-7 ring-1 ring-border transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
                >
                  <span aria-hidden className="absolute -end-4 -top-6 font-display text-8xl text-primary/[0.06]">0{i + 1}</span>
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-red/10 text-brand-red transition group-hover:bg-brand-red group-hover:text-brand-cream">
                    <Icon className="h-7 w-7" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-2xl text-primary">{o.t}</h3>
                  <p className="mt-2 text-muted-foreground">{o.d}</p>
                  {i === 2 && (
                    <div className="mt-4 flex gap-2 text-xs font-bold">
                      <span className="rounded-full bg-muted px-3 py-1">Cash</span>
                      <span className="rounded-full bg-muted px-3 py-1">InstaPay</span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>

        {/* ------------------------------------------------------------ PANZUTTI FAMILY */}
        <section className="relative overflow-hidden bg-brand-yellow">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1fr_1.2fr] md:py-20">
            <div>
              <SectionTitle kicker={t.family.kicker} title={t.family.title} className="mb-4" />
              <p className="max-w-md text-lg text-foreground/80">{t.family.body}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={`/${locale}/family/share`} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground transition hover:brightness-110">
                  <Camera className="h-4 w-4" aria-hidden /> {t.family.share}
                </Link>
                <Link href={`/${locale}/family`} className="inline-flex items-center gap-2 rounded-full border-2 border-primary px-6 py-3 font-extrabold text-primary transition hover:bg-primary hover:text-primary-foreground">
                  {t.family.see}
                </Link>
              </div>
            </div>

            {data.family.length > 0 ? (
              <ul className="grid grid-cols-3 gap-3">
                {data.family.slice(0, 6).map((p, i) => (
                  <li key={p.id} className={`relative overflow-hidden rounded-2xl bg-card shadow-lg ring-4 ring-card ${i % 2 ? "rotate-2" : "-rotate-2"} ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                    <div className="relative aspect-square">
                      <img src={p.url} alt={p.caption ?? "Panzutti Family photo"} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="relative mx-auto flex h-72 w-full max-w-md items-center justify-center">
                {[-8, 4, -2].map((r, i) => (
                  <div
                    key={i}
                    aria-hidden
                    style={{ transform: `rotate(${r}deg) translate(${(i - 1) * 70}px, ${i === 1 ? -12 : 10}px)` }}
                    className="absolute h-52 w-44 rounded-xl bg-card p-2.5 pb-10 shadow-xl"
                  >
                    <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-primary/25 bg-muted">
                      {i === 1 ? <Heart className="h-8 w-8 text-brand-red" /> : <Camera className="h-7 w-7 text-primary/40" />}
                    </div>
                  </div>
                ))}
                <p className={`absolute -bottom-2 text-center text-2xl text-brand-red ${locale === "ar" ? "font-arabic" : "font-script"}`}>{t.family.empty}</p>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------ JOIN */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="grid items-center gap-8 rounded-[2rem] bg-card p-6 ring-1 ring-border md:grid-cols-[1fr_1.4fr] md:p-10">
            <div>
              <h2 className="text-3xl text-primary md:text-4xl">{t.join.title}</h2>
              <p className="mt-3 text-muted-foreground">{t.join.body}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { href: `/${locale}/careers`, Icon: Briefcase, title: t.join.team, d: t.join.teamD },
                { href: `/${locale}/suppliers`, Icon: Truck, title: t.join.supplier, d: t.join.supplierD },
              ].map(({ href, Icon, title, d }) => (
                <Link key={href} href={href} className="group flex items-start gap-4 rounded-2xl bg-background p-5 ring-1 ring-border transition hover:ring-primary">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Icon className="h-6 w-6" aria-hidden /></span>
                  <span>
                    <span className="flex items-center gap-1 font-display text-xl text-primary">{title} <Arrow className="h-4 w-4 transition group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden /></span>
                    <span className="mt-1 block text-sm text-muted-foreground">{d}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ VISIT */}
        <section id="visit" className="scroll-mt-20 bg-muted/60">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-20">
            <div>
              <SectionTitle kicker={t.visit.kicker} title={t.visit.title} />
              <ul className="space-y-5 text-lg">
                <li className="flex gap-3"><MapPin className="mt-1 h-5 w-5 shrink-0 text-brand-red" aria-hidden />{locale === "ar" ? data.branch.address_ar : data.branch.address_en}</li>
                <li className="flex gap-3">
                  <Clock className="mt-1 h-5 w-5 shrink-0 text-brand-red" aria-hidden />
                  <span>
                    {t.visit.daily} {timeLabel(data.branch.opens_at, locale)} – {timeLabel(data.branch.closes_at, locale)}
                    <span className={`ms-2 rounded-full px-2 py-0.5 text-xs font-bold ${open ? "bg-primary/10 text-primary" : "bg-brand-red/10 text-brand-red"}`}>{open ? t.hero.open : t.hero.closed}</span>
                  </span>
                </li>
                <li className="flex gap-3"><Phone className="mt-1 h-5 w-5 shrink-0 text-brand-red" aria-hidden /><a href={telHref(data.branch.phone)} dir="ltr" className="hover:underline">{data.branch.phone.replace("+20", "0")}</a></li>
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href={brand.mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground transition hover:brightness-110">
                  <MapPin className="h-4 w-4" aria-hidden /> {t.visit.directions}
                </a>
                <a href={telHref(data.branch.phone)} className="inline-flex items-center gap-2 rounded-full border-2 border-primary px-6 py-3 font-extrabold text-primary transition hover:bg-primary hover:text-primary-foreground">
                  <Phone className="h-4 w-4" aria-hidden /> {t.visit.call}
                </a>
              </div>
            </div>
            <div className="relative">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-brand-green-dark shadow-xl ring-8 ring-card">
                <Image src={brand.photos.story} alt="Inside Panzutti at Meraki Complex" fill sizes="(min-width: 768px) 520px, 100vw" className="object-cover" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
      <WelcomePopup locale={locale} t={t.welcome} />
    </>
  );
}
