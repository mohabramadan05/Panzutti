import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Home, UtensilsCrossed, Receipt, Star, User, Flame, ShoppingBag, Instagram, Facebook } from "lucide-react";
import { Logo } from "./brand";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { settingsQuery, hoursQuery, DAYS } from "@/lib/data";

export function AnnouncementBar() {
  const { data } = useQuery(settingsQuery);
  const a = data?.announcement;
  if (!a?.enabled || !a.text) return null;
  const inner = <span className="font-semibold">{a.text}</span>;
  return (
    <div className="bg-brand-red px-4 py-2 text-center text-sm text-brand-cream">
      {a.link ? <a href={a.link} className="underline-offset-4 hover:underline">{inner}</a> : inner}
    </div>
  );
}

const nav = [
  { to: "/menu", label: "Menu" },
  { to: "/club", label: "PANZUTTI Club" },
  { to: "/journal", label: "Journal" },
  { to: "/contact", label: "Visit" },
] as const;

export function SiteHeader() {
  const { count } = useCart();
  const { session } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const otherActive = nav.slice(1).some((n) => path.startsWith(n.to));
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link to="/" aria-label="PANZUTTI home"><Logo className="h-9 md:h-11" /></Link>
        <nav className="hidden items-center gap-2 md:flex">
          {nav.map((n, i) => {
            const active = i === 0 ? !otherActive : path.startsWith(n.to);
            return (
              <Link key={n.to} to={n.to} className={`rounded-full px-4 py-2 text-sm font-extrabold transition ${active ? "bg-brand-red text-brand-cream" : "text-foreground/80 hover:text-primary"}`}>
                {i === 0 ? "Order Now" : n.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Link to={session ? "/account" : "/auth"} className="hidden rounded-full px-3 py-2 text-sm font-bold md:inline-flex hover:bg-muted">
            {session ? "Account" : "Sign in"}
          </Link>
          <Link to="/cart" className="relative inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <ShoppingBag className="h-4 w-4" />
            <span className="hidden sm:inline">Cart</span>
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-yellow px-1 text-xs text-foreground">
                {count}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { session } = useAuth();
  if (path.startsWith("/admin")) return null;
  const items = [
    { to: "/", label: "Home", icon: Home },
    { to: "/menu", label: "Menu", icon: UtensilsCrossed },
    { to: "/menu", label: "Order", icon: Flame },
    { to: session ? "/orders" : "/club", label: session ? "Orders" : "Club", icon: session ? Receipt : Star },
    { to: session ? "/account" : "/auth", label: "Account", icon: User },
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5">
        {items.map((i) => {
          const active = i.to === "/" ? path === "/" : path.startsWith(i.to);
          return (
            <Link key={i.label} to={i.to} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-bold ${active ? "text-primary" : "text-muted-foreground"}`}>
              <i.icon className="h-5 w-5" />
              {i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function SiteFooter() {
  const { data: s } = useQuery(settingsQuery);
  const { data: hours } = useQuery(hoursQuery);
  const loc = s?.location ?? {};
  const soc = s?.socials ?? {};
  const pol = s?.policies ?? {};
  const policyLinks = [
    ["terms", "Terms"], ["privacy", "Privacy"], ["delivery", "Delivery policy"], ["refunds", "Cancellations & refunds"], ["loyalty", "Club terms"],
  ].filter(([k]) => pol[k]);
  return (
    <footer className="bg-primary pb-24 text-primary-foreground md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo variant="yellow" className="h-12" />
          <p className="mt-4 text-lg font-bold">على إيدك</p>
        </div>
        <div>
          <h3 className="mb-3 text-lg text-brand-yellow">Find us</h3>
          <p>{loc.address}</p>
          {loc.map_url && <a href={loc.map_url} target="_blank" rel="noreferrer" className="mt-2 inline-block underline">Open in maps</a>}
          {loc.phone && <p className="mt-2">{loc.phone}</p>}
          {loc.email && <p>{loc.email}</p>}
        </div>
        <div>
          <h3 className="mb-3 text-lg text-brand-yellow">Hours</h3>
          <ul className="space-y-1 text-sm">
            {hours?.map((h) => (
              <li key={h.weekday} className="flex justify-between gap-4">
                <span>{DAYS[h.weekday]}</span>
                <span>{h.is_closed ? "Closed" : `${h.open_time.slice(0, 5)} – ${h.close_time.slice(0, 5)}`}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-lg text-brand-yellow">More</h3>
          <ul className="space-y-1 text-sm">
            <li><Link to="/contact" className="hover:underline">Contact & FAQ</Link></li>
            {policyLinks.map(([k, label]) => (
              <li key={k}><Link to="/policies/$key" params={{ key: k }} className="hover:underline">{label}</Link></li>
            ))}
          </ul>
          <div className="mt-4 flex gap-3">
            {soc.instagram && <a href={soc.instagram} aria-label="Instagram" target="_blank" rel="noreferrer"><Instagram /></a>}
            {soc.facebook && <a href={soc.facebook} aria-label="Facebook" target="_blank" rel="noreferrer"><Facebook /></a>}
            {soc.tiktok && <a href={soc.tiktok} target="_blank" rel="noreferrer" className="text-sm font-bold">TikTok</a>}
          </div>
        </div>
      </div>
      <div className="border-t border-primary-foreground/15 py-4 text-center text-xs opacity-70">© {new Date().getFullYear()} PANZUTTI · Panuozzo & more</div>
    </footer>
  );
}
