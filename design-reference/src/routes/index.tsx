import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bike, CalendarDays, ShoppingBag, ArrowRight } from "lucide-react";
import { productsQuery, settingsQuery, tiersQuery, articlesQuery } from "@/lib/data";
import { ProductCard } from "@/components/product-card";
import { Mascot, SectionTitle } from "@/components/brand";
import { egp } from "@/lib/format";
import heroImg from "@/assets/panuozzo-plate.jpg.asset.json";
import storyImg from "@/assets/love-wall.jpg.asset.json";
import spreadImg from "@/assets/table-spread.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PANZUTTI — Freshly baked panuozzo in Heliopolis" },
      { name: "description", content: "Order freshly baked sourdough panuozzo for delivery or pickup, book a table at Meraki Complex, Heliopolis, and earn points with PANZUTTI Club." },
      { property: "og:title", content: "PANZUTTI — Your Next Favorite Bite" },
      { property: "og:description", content: "Freshly baked panuozzo. Italian inspiration. PANZUTTI attitude." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { data: settings } = useQuery(settingsQuery);
  const { data: products } = useQuery(productsQuery);
  const { data: tiers } = useQuery(tiersQuery);
  const { data: articles } = useQuery(articlesQuery);
  const home = settings?.home ?? {};
  const featured = (products ?? []).filter((p) => p.is_featured).slice(0, 6);
  const journal = (articles ?? []).filter((a) => a.is_featured).slice(0, 3);

  return (
    <div className="pb-20 md:pb-0">
      {/* Hero */}
      <section className="relative overflow-hidden grain">
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-8 md:grid-cols-[1fr_1.15fr] md:py-14">
          <div className="order-2 md:order-1">
            <h1 className="text-5xl text-primary sm:text-6xl lg:text-7xl">
              {(home.hero_title || "Your Next Favorite Bite.").replace(/Favorite Bite\.?$/, "")}
              <span className="font-script block text-6xl text-brand-red sm:text-7xl lg:text-8xl">
                {/Favorite Bite/.test(home.hero_title || "Your Next Favorite Bite.") ? "Favorite Bite." : ""}
              </span>
            </h1>
            <p className="mt-5 max-w-sm text-lg text-foreground/80">{home.hero_subtitle || "Freshly baked panuozzo. Italian inspiration. PANZUTTI attitude."}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/menu" className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 font-extrabold text-primary-foreground shadow-lg shadow-primary/20 hover:brightness-110">Order Now</Link>
              <Link to="/menu" className="inline-flex rounded-full border-2 border-primary px-7 py-3.5 font-extrabold text-primary hover:bg-primary hover:text-primary-foreground">Explore the Menu</Link>
            </div>
          </div>
          <div className="relative order-1 md:order-2">
            <img src={home.hero_image || heroImg.url} alt="A freshly baked PANZUTTI panuozzo" className="aspect-[5/4] w-full rounded-[2.5rem] object-cover shadow-2xl" />
            <div className="absolute -top-3 right-4 flex h-24 w-24 rotate-12 items-center justify-center rounded-full bg-brand-red text-center text-brand-cream shadow-lg md:h-28 md:w-28">
              <span className="font-script text-xl leading-tight">Panuozzo<br />and more</span>
            </div>
            <Mascot pose="thumbs-up" className="absolute -bottom-6 -left-10 hidden h-72 w-44 drop-shadow-lg md:block" label="Mascot" />
          </div>
        </div>
      </section>

      {/* Bestsellers */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex items-end justify-between gap-4">
          <SectionTitle title="Our Bestsellers" />
          <Link to="/menu" className="mb-8 hidden font-bold text-primary underline-offset-4 hover:underline sm:block">View all →</Link>
        </div>
        {featured.length ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{featured.slice(0, 4).map((p) => <ProductCard key={p.id} p={p} />)}</div>
        ) : (
          <p className="rounded-3xl bg-card p-8 text-center text-muted-foreground">Our bestsellers will appear here soon.</p>
        )}
      </section>

      {/* Story */}
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        {/* faint oversized wordmark behind the section */}
        <span aria-hidden className="pointer-events-none absolute -right-6 top-6 select-none font-display text-[9rem] leading-none text-primary-foreground/[0.04] md:text-[16rem]">PANUOZZO</span>

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2 md:py-24">
          {/* Photo collage */}
          <div className="relative mx-auto w-full max-w-md md:max-w-none">
            <div className="-rotate-2 overflow-hidden rounded-[2rem] ring-8 ring-brand-cream shadow-2xl">
              <img src={home.story_image || storyImg.url} alt="Inside PANZUTTI" className="aspect-[4/5] w-full object-cover" loading="lazy" />
            </div>
            <div className="absolute -bottom-8 -right-3 w-[42%] rotate-6 rounded-2xl bg-brand-cream p-2 pb-6 shadow-xl md:-right-8">
              <img src={spreadImg.url} alt="Panuozzi fresh from the oven" className="aspect-square w-full rounded-xl object-cover" loading="lazy" />
              <span className="font-script absolute inset-x-0 bottom-0.5 text-center text-lg text-brand-red">fresh from the oven</span>
            </div>
            <div className="absolute -left-3 -top-5 flex h-24 w-24 -rotate-12 flex-col items-center justify-center rounded-full bg-brand-red text-center text-brand-cream shadow-lg md:-left-6 md:h-28 md:w-28">
              <span className="font-arabic text-2xl md:text-3xl">على إيدك</span>
              <span className="text-[10px] font-bold uppercase tracking-widest">made to order</span>
            </div>
          </div>

          {/* Words */}
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-brand-yellow">Our story</p>
            <h2 className="mt-3 text-4xl leading-[1.05] md:text-6xl">
              {String(home.story_title || "Egyptian heart. Italian dough.").split(/\.\s+/).map((part: string, i: number, all: string[]) => (
                <span key={i} className={`block ${i % 2 ? "text-brand-yellow" : ""}`}>{i < all.length - 1 ? `${part}.` : part}</span>
              ))}
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed opacity-90">
              {home.story_body ||
                "We took the pizza dough everyone already loves and turned it into a sandwich. Every PANZUTTI panuozzo is sourdough, baked or fried to order, and filled right in front of you — Italian inspiration, made على إيدك."}
            </p>

            {/* How a panuozzo is made */}
            <ol className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { n: "01", t: "Sourdough", d: "Slow-rested pizza dough" },
                { n: "02", t: "Baked or fried", d: "Only when you order" },
                { n: "03", t: "Filled live", d: "Right in front of you" },
              ].map((x) => (
                <li key={x.n} className="rounded-2xl bg-primary-foreground/[0.07] p-4 ring-1 ring-primary-foreground/15">
                  <span className="font-script text-2xl text-brand-yellow">{x.n}</span>
                  <p className="mt-1 font-display text-lg leading-tight">{x.t}</p>
                  <p className="text-sm opacity-75">{x.d}</p>
                </li>
              ))}
            </ol>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link to="/menu" className="inline-flex items-center gap-2 rounded-full bg-brand-yellow px-6 py-3 font-extrabold text-foreground hover:brightness-105">
                Taste the story <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/contact" className="font-bold underline-offset-4 hover:underline">Visit us at Meraki Complex</Link>
            </div>
          </div>
        </div>
        <Mascot pose="wave" className="absolute bottom-0 right-4 hidden h-44 w-32 drop-shadow-lg xl:block" label="Mascot" />
      </section>

      {/* How to order */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <SectionTitle title="How to Order" />
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: Bike, t: "Delivery", d: "Hot to your door — follow it live from the oven to you.", type: "delivery" as const },
            { icon: CalendarDays, t: "Dine-in", d: "Order for your table at Meraki Complex and we'll bring it out fresh.", type: "dine_in" as const },
            { icon: ShoppingBag, t: "Pickup", d: "Pick a time and collect at Meraki Complex.", type: "pickup" as const },
          ].map((o) => (
            <Link key={o.t} to="/menu" search={{ type: o.type }} className="group rounded-3xl bg-card p-7 ring-1 ring-border transition hover:bg-accent">
              <o.icon className="h-9 w-9 text-brand-red" />
              <h3 className="mt-5 text-2xl text-primary">{o.t}</h3>
              <p className="mt-2 text-muted-foreground group-hover:text-foreground">{o.d}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Club */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 md:grid-cols-[1.5fr_1fr]">
          <div>
            <h2 className="text-4xl md:text-5xl">PANZUTTI Club</h2>
            <p className="mt-3 text-lg opacity-90">Every EGP you spend brings you closer to your next reward.</p>
            <div className="mt-6 rounded-3xl bg-card p-5 text-card-foreground">
              <div className="flex items-center gap-4">
                <div className="h-3 flex-1 rounded-full bg-muted"><div className="h-3 w-1/4 rounded-full bg-primary/30" /></div>
                <Link to="/club" className="rounded-full bg-primary px-5 py-2 text-sm font-extrabold text-primary-foreground">Join Now</Link>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {(tiers ?? []).map((t) => (
                  <div key={t.id} className="rounded-2xl bg-brand-yellow/70 p-3 text-center">
                    <p className="font-display text-xl text-primary">{t.points.toLocaleString()} <span className="text-xs">points</span></p>
                    <p className="text-sm font-bold">{egp(t.discount)} off</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="relative flex justify-center">
            <p className="font-script absolute -top-2 right-0 -rotate-6 text-3xl text-brand-yellow">Good Food<br />Better Rewards</p>
            <Mascot pose="celebrate" className="h-64 w-52 border-primary-foreground/30 text-primary-foreground/60" label="Mascot · celebrate" />
          </div>
        </div>
      </section>

      {/* Journal */}
      {journal.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <SectionTitle title="From Our Journal" />
          <div className="grid gap-6 md:grid-cols-3">
            {journal.map((a) => (
              <Link key={a.id} to="/journal/$slug" params={{ slug: a.slug }} className="group">
                <img src={a.cover_url || spreadImg.url} alt="" className="aspect-[4/3] w-full rounded-3xl object-cover" />
                <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-red">{a.category}</p>
                <h3 className="mt-1 text-xl text-primary group-hover:underline">{a.title}</h3>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
