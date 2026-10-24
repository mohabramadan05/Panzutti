import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, MessageCircle, Phone } from "lucide-react";
import { settingsQuery, hoursQuery, DAYS } from "@/lib/data";
import { Mascot, PageShell } from "@/components/brand";
import storefront from "@/assets/storefront.jpg.asset.json";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Visit PANZUTTI — Meraki Complex, Heliopolis" },
      { name: "description", content: "Find PANZUTTI at Meraki Complex, Heliopolis. Opening hours, contact details and FAQs." },
      { property: "og:title", content: "Visit PANZUTTI" },
      { property: "og:description", content: "Meraki Complex, Heliopolis — hours and contact." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Contact,
});

function Contact() {
  const { data: s } = useQuery(settingsQuery);
  const { data: hours } = useQuery(hoursQuery);
  const loc = s?.location ?? {};
  const saved: { q: string; a: string }[] = (s?.policies?.faq ?? []).filter((x: { q?: string }) => x?.q?.trim());
  const faq = saved.length ? saved : DEFAULT_FAQ;
  return (
    <PageShell kicker="Come hungry" title="Visit us">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <img src={storefront.url} alt="PANZUTTI storefront" className="aspect-[4/3] w-full rounded-[2rem] object-cover" />
          {(loc.address || loc.map_url) && (
            <div className="overflow-hidden rounded-[2rem] ring-1 ring-border">
              <iframe
                title="PANZUTTI location map"
                src={`https://www.google.com/maps?q=${encodeURIComponent(loc.address || "PANZUTTI Heliopolis")}&output=embed`}
                className="h-64 w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
          {loc.map_url && (
            <a href={loc.map_url} target="_blank" rel="noreferrer" className="inline-block rounded-full bg-primary px-5 py-2 font-bold text-primary-foreground">
              Open in Google Maps
            </a>
          )}
        </div>
        <div className="space-y-6">
          <div className="rounded-3xl bg-card p-6 ring-1 ring-border">
            <h2 className="text-xl text-primary">Location</h2>
            <p className="mt-2 text-lg">{loc.address}</p>
            {loc.phone && <p className="mt-3">Phone: <a href={`tel:${loc.phone}`} className="font-bold">{loc.phone}</a></p>}
            {loc.whatsapp && <p>WhatsApp: <a href={`https://wa.me/${loc.whatsapp.replace(/\D/g, "")}`} className="font-bold">{loc.whatsapp}</a></p>}
            {loc.email && <p>Email: <a href={`mailto:${loc.email}`} className="font-bold">{loc.email}</a></p>}
          </div>
          <div className="rounded-3xl bg-card p-6 ring-1 ring-border">
            <h2 className="text-xl text-primary">Opening hours</h2>
            <ul className="mt-2 space-y-1">{hours?.map((h) => <li key={h.weekday} className="flex justify-between"><span>{DAYS[h.weekday]}</span><span>{h.is_closed ? "Closed" : `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}`}</span></li>)}</ul>
          </div>
        </div>
      </div>
      <section className="mt-16 overflow-hidden rounded-[2rem] bg-primary text-primary-foreground">
        <div className="grid gap-10 p-6 md:grid-cols-[300px_1fr] md:p-10">
          {/* Left: headline + help */}
          <div className="md:sticky md:top-24 md:self-start">
            <p className="font-script text-3xl text-brand-yellow">Got questions?</p>
            <h2 className="mt-1 text-4xl leading-[1.05] md:text-5xl">We've got answers<span className="text-brand-yellow">.</span></h2>
            <p className="mt-3 opacity-80">And panuozzi. Mostly panuozzi.</p>
            <Mascot pose="thinking" className="mt-6 hidden h-48 w-36 border-primary-foreground/30 text-primary-foreground/60 md:flex" label="Mascot" />
            <div className="mt-6 rounded-2xl bg-primary-foreground/10 p-4">
              <p className="font-bold">Still hungry for answers?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {loc.whatsapp && (
                  <a href={`https://wa.me/${String(loc.whatsapp).replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-brand-yellow px-4 py-2 text-sm font-extrabold text-foreground">
                    <MessageCircle className="h-4 w-4" /> WhatsApp us
                  </a>
                )}
                {loc.phone && (
                  <a href={`tel:${String(loc.phone).replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ring-1 ring-primary-foreground/40">
                    <Phone className="h-4 w-4" /> Call
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Right: questions */}
          <div className="space-y-3">
            {faq.map((x, i) => (
              <details key={i} className="group rounded-2xl bg-brand-cream text-foreground ring-1 ring-black/5 transition open:shadow-lg" open={i === 0}>
                <summary className="flex cursor-pointer list-none items-center gap-4 p-4 md:p-5 [&::-webkit-details-marker]:hidden">
                  <span className="font-script w-9 shrink-0 text-2xl text-brand-red">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 font-display text-lg leading-snug text-primary md:text-xl">{x.q}</span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 group-open:rotate-45 group-open:bg-brand-red">
                    <Plus className="h-5 w-5" />
                  </span>
                </summary>
                <div className="px-4 pb-5 md:px-5">
                  <p className="border-l-4 border-brand-yellow pl-4 leading-relaxed text-foreground/80 md:ml-[3.25rem]">{x.a}</p>
                </div>
              </details>
            ))}
            <p className="pt-2 text-sm opacity-80">
              Ready? <Link to="/menu" className="font-bold text-brand-yellow underline-offset-4 hover:underline">Grab a panuozzo →</Link>
            </p>
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/** Shown until the team adds its own FAQ in Admin → Content & settings → Policies & FAQ. */
const DEFAULT_FAQ: { q: string; a: string }[] = [
  { q: "Wait… isn't a panuozzo just a pizza?", a: "Not quite. It's pizza's cooler cousin: our sourdough pizza dough is baked (or fried) into bread, then stuffed like a sandwich. Pizza soul, sandwich attitude. دي مش بيتزا — دي بانوتسو." },
  { q: "Baked or fried — which one should I get?", a: "Baked is light and airy with crispy edges. Fried is golden, crunchy and a little bit naughty. Can't decide? Bring a friend and order one of each." },
  { q: "How do I order?", a: "Tap Order Now, pick Delivery, Pickup or Dine-in, fill your cart and confirm. No account needed — but signing in remembers your address and earns you Club points." },
  { q: "Can I pay by card?", a: "For now it's cash only: pay the driver, or pay at the counter for pickup and dine-in. Online card payment is coming soon." },
  { q: "Where's my food?!", a: "Right after you order you get a private tracking link. It shows every step live — confirmed, in the oven, ready, on the way — and your driver's name and number once they've picked it up." },
  { q: "Do you deliver to my area?", a: "We deliver to every area listed at checkout, all for one flat delivery fee. Not on the list yet? Pickup at Meraki Complex, Heliopolis is always on." },
  { q: "Can I choose my pickup time?", a: "Yes. Pick any available time at checkout and we'll have it hot and waiting — على إيدك." },
  { q: "What is PANZUTTI Club?", a: "Every EGP you spend on a completed order earns 1 point. Stack them up and swap them for money off your next panuozzo. Sign in to start collecting." },
  { q: "Can I tell you how it was?", a: "Please do! Once your order is completed, rate each item — plus the delivery, pickup or dine-in experience — straight from your tracking page." },
];
