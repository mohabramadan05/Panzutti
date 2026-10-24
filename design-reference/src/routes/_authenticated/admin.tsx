import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Receipt, Bike, MessageSquareQuote, UtensilsCrossed, CalendarDays, Users, Star, Tag, Newspaper, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/brand";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — PANZUTTI" },
      { name: "description", content: "PANZUTTI restaurant management." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Admin — PANZUTTI" },
      { property: "og:description", content: "Restaurant management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminLayout,
});

const items = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/orders", label: "Orders", icon: Receipt },
  { to: "/admin/drivers", label: "Delivery", icon: Bike },
  { to: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/admin/reservations", label: "Reservations", icon: CalendarDays },
  { to: "/admin/reviews", label: "Reviews", icon: MessageSquareQuote },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/loyalty", label: "Loyalty", icon: Star },
  { to: "/admin/promotions", label: "Promotions", icon: Tag },
  { to: "/admin/articles", label: "Articles", icon: Newspaper },
  { to: "/admin/settings", label: "Content & settings", icon: Settings },
] as const;

function AdminLayout() {
  const { isAdmin, loading, session } = useAuth();
  if (loading || (session && !isAdmin && loading)) return <p className="p-10">Loading…</p>;
  if (!isAdmin)
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-3xl text-primary">Admins only</h1>
        <p className="mt-2 text-muted-foreground">Your account doesn't have access to the dashboard.</p>
      </div>
    );
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 bg-primary p-4 text-primary-foreground md:block">
        <Logo variant="yellow" className="mb-8 h-10" />
        <nav className="space-y-1">
          {items.map((i) => (
            <Link key={i.to} to={i.to} activeOptions={{ exact: "exact" in i }} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold opacity-80 hover:bg-primary-foreground/10" activeProps={{ className: "bg-primary-foreground/15 !opacity-100" }}>
              <i.icon className="h-4 w-4" />{i.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 pt-3"><Logo className="h-8" /><Link to="/" className="text-xs font-bold text-muted-foreground">View site →</Link></div>
          <nav className="flex gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
            {items.map((i) => (
              <Link key={i.to} to={i.to} activeOptions={{ exact: "exact" in i }} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ring-1 ring-border" activeProps={{ className: "bg-primary text-primary-foreground ring-primary" }}>
                <i.icon className="h-3.5 w-3.5" />{i.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="overflow-x-hidden p-4 pb-16 md:p-8"><Outlet /></div>
      </div>
    </div>
  );
}
