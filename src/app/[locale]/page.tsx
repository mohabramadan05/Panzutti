/* eslint-disable @next/next/no-img-element -- Supabase signed URLs of unknown size in the family collage */
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight, ArrowLeft, Bike, ShoppingBag, Wallet, Flame, Clock, MapPin, Phone,
  Camera, Briefcase, Truck, Sparkles, Heart, CalendarDays,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ProductCard } from "@/components/product-card";
import { PizzaAssembly } from "@/components/pizza-assembly";
import { WelcomePopup } from "@/components/welcome-popup";
import { Mascot, SectionTitle } from "@/components/brand";
import { getHomeData, openStatus } from "@/lib/data";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { brand, type MascotPose } from "@/lib/brand";
import { telHref, timeLabel } from "@/lib/format";

// Re-read the menu and gallery from Supabase at most every 5 minutes
export const revalidate = 300;

/** Stagger for [data-reveal] (see globals.css) */
const delay = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;
  const t = getDictionary(locale);
  const data = await getHomeData();
  const { open } = openStatus(data.branch);
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;
  const name = (i: { name_en: string; name_ar: string }) => (locale === "ar" ? i.name_ar : i.name_en);
  const script = locale === "ar" ? "font-arabic" : "font-script";

  // How-to-order cards: icon, where it goes, and the character drawn faintly in the background
  const howCards: { Icon: typeof Bike; href: string; pose: MascotPose }[] = [
    { Icon: Bike, href: `/${locale}/menu`, pose: "walking" },
    { Icon: ShoppingBag, href: `/${locale}/menu`, pose: "panuozzoExcited" },
    { Icon: Wallet, href: `/${locale}/menu`, pose: "confirm" },
    { Icon: CalendarDays, href: `/${locale}/reserve`, pose: "sitting" },
  ];

  return (
    <>
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
                <span className={`block text-6xl text-brand-red sm:text-7xl lg:text-8xl ${script}`}>{t.hero.titleScript}</span>
              </h1>
              {/* Italian signature line, always in Latin script */}
              <p
                lang="it"
                dir="ltr"
                className="mt-2 inline-flex animate-fade-up items-center gap-2 font-script text-4xl text-brand-yellow [animation-delay:350ms] [text-shadow:2px_2px_0_var(--color-brand-green),-1px_-1px_0_var(--color-brand-green),1px_-1px_0_var(--color-brand-green),-1px_1px_0_var(--color-brand-green)] sm:text-5xl"
              >
                {t.hero.amore}
                <Heart className="h-7 w-7 animate-wiggle fill-brand-red text-brand-red sm:h-8 sm:w-8" aria-hidden />
              </p>

              <p className="mt-5 max-w-md text-lg text-foreground/80">{t.hero.subtitle}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`/${locale}/menu`} className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-extrabold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:brightness-110">
                  {t.hero.orderNow} <Arrow className="h-4 w-4" aria-hidden />
                </Link>
                <Link href={`/${locale}/reserve`} className="inline-flex items-center gap-2 rounded-full border-2 border-primary px-7 py-3.5 font-extrabold text-primary transition hover:bg-primary hover:text-primary-foreground">
                  <CalendarDays className="h-4 w-4" aria-hidden /> {t.hero.reserve}
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
              <div className="relative aspect-[5/4] overflow-hidden rounded-[2.5rem] bg-white shadow-2xl shadow-primary/20 ring-8 ring-card">
                <Image src={brand.photos.hero} alt="Hot Honey Pepperoni panuozzo" fill priority sizes="(min-width: 768px) 560px, 100vw" className="object-cover transition duration-700 hover:scale-105" />
              </div>
              <div className="absolute -top-4 end-3 flex h-24 w-24 rotate-12 animate-[float_5s_ease-in-out_infinite] items-center justify-center rounded-full bg-brand-red text-center text-brand-cream shadow-xl md:h-28 md:w-28">
                <span className={`whitespace-pre-line leading-tight ${locale === "ar" ? "font-arabic text-lg" : "font-script text-xl"}`}>{t.hero.sticker}</span>
              </div>
              {/* sticker head peeking from the bottom corner on phones */}
              <Mascot pose="stickerCheeky" className="absolute -bottom-6 end-4 h-20 animate-wiggle drop-shadow-lg md:hidden" />
              {/* the character presents the panuozzo */}
              <Mascot pose="presenting" point="end" eager className="absolute -bottom-14 -start-24 hidden h-80 animate-float drop-shadow-xl md:block lg:h-96" />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ MARQUEE */}
        <div className="overflow-hidden border-y-4 border-brand-cream bg-brand-red py-3 text-brand-cream" aria-hidden>
          <div className="flex w-max animate-marquee gap-8 whitespace-nowrap hover:[animation-play-state:paused]">
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
            <div className="flex items-end gap-3 md:gap-5" data-reveal="left">
              {/* hungry for the bestsellers */}
              <Mascot pose="forkKnife" className="mb-4 h-28 shrink-0 animate-float md:mb-2 md:h-44" />
              <SectionTitle kicker={t.bestsellers.kicker} title={t.bestsellers.title} />
            </div>
            <Link href={`/${locale}/menu`} className="mb-8 hidden items-center gap-1 font-bold text-primary underline-offset-4 hover:underline sm:inline-flex">
              {t.bestsellers.viewAll} <Arrow className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          {data.signature.length ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.signature.slice(0, 4).map((item, i) => (
                <div key={item.id} data-reveal="up" style={delay(i * 110)}>
                  <ProductCard item={item} locale={locale} t={t.bestsellers} />
                </div>
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
            <div className="relative mx-auto w-full max-w-md md:max-w-none" data-reveal="left">
              {/* the character carrying a giant panuozzo, on the brand yellow */}
              <div className="relative flex aspect-[4/5] -rotate-2 items-end justify-center overflow-hidden rounded-[2rem] bg-brand-yellow shadow-2xl ring-8 ring-brand-cream">
                <div aria-hidden className="absolute inset-0 grain opacity-60" />
                <div aria-hidden className="absolute left-1/2 top-[18%] h-[70%] w-[70%] -translate-x-1/2 animate-spin-slow rounded-full border-[14px] border-dashed border-brand-red/25" />
                <Mascot pose="panuozzoWalk" className="relative h-[92%] animate-float drop-shadow-xl" />
              </div>
              <figure className="absolute -bottom-8 -end-3 w-[44%] rotate-6 rounded-2xl bg-brand-cream p-2 pb-8 shadow-xl transition hover:rotate-2 md:-end-8">
                <div className="relative aspect-square overflow-hidden rounded-xl bg-white">
                  <Image src={brand.photos.story} alt="" fill sizes="220px" className="object-cover" />
                </div>
                <figcaption className={`absolute inset-x-0 bottom-1 text-center text-lg text-brand-red ${script}`}>{t.story.caption}</figcaption>
              </figure>
              <div className="absolute -start-3 -top-5 flex h-24 w-24 -rotate-12 flex-col items-center justify-center rounded-full bg-brand-red text-center text-brand-cream shadow-lg md:-start-6 md:h-28 md:w-28">
                <span className="font-arabic text-2xl md:text-3xl">على إيدك</span>
                <span className="text-[10px] font-bold uppercase tracking-widest">{t.story.badge}</span>
              </div>
            </div>

            <div data-reveal="right">
              <p className="text-sm font-bold uppercase tracking-[0.25em] text-brand-yellow">{t.story.kicker}</p>
              <h2 className="mt-3 text-4xl md:text-6xl">
                <span className="block">{t.story.titleA}</span>
                <span className="block text-brand-yellow">{t.story.titleB}</span>
              </h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed opacity-90">{t.story.body}</p>

              <ol className="mt-8 grid gap-3 sm:grid-cols-3">
                {t.story.steps.map((s, i) => (
                  <li key={s.t} data-reveal="zoom" style={delay(200 + i * 120)} className="rounded-2xl bg-primary-foreground/[0.07] p-4 ring-1 ring-primary-foreground/15 transition hover:-translate-y-1 hover:bg-primary-foreground/[0.12]">
                    <span className="font-script text-2xl text-brand-yellow">0{i + 1}</span>
                    <p className="mt-1 font-display text-lg leading-tight">{s.t}</p>
                    <p className="text-sm opacity-75">{s.d}</p>
                  </li>
                ))}
              </ol>

              <Link href={`/${locale}/menu`} className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand-yellow px-6 py-3 font-extrabold text-foreground transition hover:-translate-y-0.5 hover:brightness-105">
                {t.story.cta} <Arrow className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ BUILD A PIZZA (plays by itself) */}
        <div data-reveal="up">
          <PizzaAssembly locale={locale} t={t.pizza} />
        </div>

        {/* ------------------------------------------------------------ HOW TO ORDER */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div data-reveal="up">
            <SectionTitle kicker={t.how.kicker} title={t.how.title} />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.how.items.map((o, i) => {
              const { Icon, href, pose } = howCards[i];
              return (
                <Link
                  key={o.t}
                  href={href}
                  data-reveal="up"
                  style={delay(i * 120)}
                  className="group relative isolate flex min-h-64 flex-col overflow-hidden rounded-[1.75rem] bg-card p-7 ring-1 ring-border transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
                >
                  {/* the character, drawn faintly behind the text */}
                  <Mascot
                    pose={pose}
                    className="pointer-events-none absolute -bottom-6 -end-8 -z-10 h-56 opacity-[0.16] transition duration-500 group-hover:-translate-y-2 group-hover:opacity-35 rtl:-scale-x-100"
                  />
                  <span aria-hidden className="absolute -end-4 -top-6 -z-10 font-display text-8xl text-primary/[0.06]">0{i + 1}</span>
                  <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-red/10 text-brand-red transition group-hover:rotate-6 group-hover:bg-brand-red group-hover:text-brand-cream">
                    <Icon className="h-7 w-7" aria-hidden />
                  </span>
                  <h3 className="mt-5 text-2xl text-primary">{o.t}</h3>
                  <p className="mt-2 max-w-[16rem] text-muted-foreground">{o.d}</p>
                  {i === 2 && (
                    <div className="mt-auto flex gap-2 pt-4 text-xs font-bold">
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
          {/* sticker heads floating around the wall */}
          <Mascot pose="stickerHappy" className="pointer-events-none absolute -start-6 top-8 hidden h-24 -rotate-12 animate-float opacity-90 md:block" />
          <Mascot pose="stickerExcited" className="pointer-events-none absolute bottom-6 end-[46%] hidden h-20 rotate-12 animate-wiggle md:block" />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1fr_1.2fr] md:py-20">
            <div data-reveal="left" className="relative">
              <SectionTitle kicker={t.family.kicker} title={t.family.title} className="mb-4" />
              <p className="max-w-md text-lg text-foreground/80">{t.family.body}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={`/${locale}/family/share`} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground transition hover:-translate-y-0.5 hover:brightness-110">
                  <Camera className="h-4 w-4" aria-hidden /> {t.family.share}
                </Link>
                <Link href={`/${locale}/family`} className="inline-flex items-center gap-2 rounded-full border-2 border-primary px-6 py-3 font-extrabold text-primary transition hover:bg-primary hover:text-primary-foreground">
                  {t.family.see}
                </Link>
              </div>
              {/* sitting on the steps with his panuozzo, watching the wall */}
              <Mascot pose="engage" point="end" className="mt-6 h-40 md:h-48" />
            </div>

            {data.family.length > 0 ? (
              <ul className="grid grid-cols-3 gap-3">
                {data.family.slice(0, 6).map((p, i) => (
                  <li
                    key={p.id}
                    data-reveal="tilt"
                    style={delay(i * 90)}
                    className={`relative overflow-hidden rounded-2xl bg-card shadow-lg ring-4 ring-card transition hover:z-10 hover:scale-105 hover:rotate-0 ${i % 2 ? "rotate-2" : "-rotate-2"} ${i === 0 ? "col-span-2 row-span-2" : ""}`}
                  >
                    <div className="relative aspect-square">
                      <img src={p.url} alt={p.caption ?? "Panzutti Family photo"} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="relative mx-auto flex h-72 w-full max-w-md items-center justify-center" data-reveal="zoom">
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
                <p className={`absolute -bottom-2 text-center text-2xl text-brand-red ${script}`}>{t.family.empty}</p>
              </div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------------------ JOIN */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div data-reveal="zoom" className="relative grid items-center gap-8 overflow-hidden rounded-[2rem] bg-card p-6 ring-1 ring-border md:grid-cols-[1fr_1.4fr] md:p-10">
            <div className="flex items-end gap-4">
              {/* thinking about joining */}
              <Mascot pose="discover" className="hidden h-44 shrink-0 sm:block" />
              <div>
                <h2 className="text-3xl text-primary md:text-4xl">{t.join.title}</h2>
                <p className="mt-3 text-muted-foreground">{t.join.body}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { href: `/${locale}/careers`, Icon: Briefcase, title: t.join.team, d: t.join.teamD },
                { href: `/${locale}/suppliers`, Icon: Truck, title: t.join.supplier, d: t.join.supplierD },
              ].map(({ href, Icon, title, d }, i) => (
                <Link key={href} href={href} data-reveal="up" style={delay(150 + i * 120)} className="group flex items-start gap-4 rounded-2xl bg-background p-5 ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-primary">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition group-hover:-rotate-6"><Icon className="h-6 w-6" aria-hidden /></span>
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
            <div data-reveal="left">
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
                <Link href={`/${locale}/reserve`} className="inline-flex items-center gap-2 rounded-full bg-brand-red px-6 py-3 font-extrabold text-brand-cream transition hover:brightness-110">
                  <CalendarDays className="h-4 w-4" aria-hidden /> {t.hero.reserve}
                </Link>
                <a href={telHref(data.branch.phone)} className="inline-flex items-center gap-2 rounded-full border-2 border-primary px-6 py-3 font-extrabold text-primary transition hover:bg-primary hover:text-primary-foreground">
                  <Phone className="h-4 w-4" aria-hidden /> {t.visit.call}
                </a>
              </div>
            </div>
            {/* "Ciao!" — the character waves you in with a panuozzo */}
            <div className="relative" data-reveal="right">
              <div className="relative flex aspect-[4/3] items-end justify-center overflow-hidden rounded-[2rem] bg-brand-green-dark shadow-xl ring-8 ring-card">
                <div aria-hidden className="absolute -bottom-24 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-brand-yellow/90" />
                <span aria-hidden className="absolute start-6 top-5 -rotate-6 font-script text-6xl text-brand-cream md:text-7xl">Ciao!</span>
                <Mascot pose="panuozzoGreeting" point="start" className="relative h-[88%] animate-float drop-shadow-2xl" />
              </div>
              <Mascot pose="stickerSatisfied" className="absolute -end-3 -top-8 h-24 rotate-12 animate-wiggle drop-shadow-lg md:h-28" />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter locale={locale} />
      <WelcomePopup locale={locale} t={t.welcome} />
    </>
  );
}
