import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { LayoutDashboard, Receipt, User, MapPin, CalendarDays, Star, LogOut, ChevronRight, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { settingsQuery, tiersQuery, zonesQuery } from "@/lib/data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { egp, errMsg, fmtDateTime, fulfillmentLabel, statusLabel, stepLabel } from "@/lib/format";

const TABS = ["overview", "orders", "profile", "addresses", "bookings"] as const;
type Tab = (typeof TABS)[number];

export const Route = createFileRoute("/_authenticated/account")({
  validateSearch: z.object({ tab: z.enum(TABS).optional() }),
  head: () => ({
    meta: [
      { title: "My account — PANZUTTI" },
      { name: "description", content: "Your PANZUTTI orders, Club points, profile and addresses." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "My account — PANZUTTI" },
      { property: "og:description", content: "Your PANZUTTI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Account,
});

const ACTIVE = ["pending", "confirmed", "preparing", "ready", "driver_assigned", "picked_up", "out_for_delivery", "delivered", "collected"];

function Account() {
  const { session } = useAuth();
  const uid = session!.user.id;
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: settings } = useQuery(settingsQuery);
  const { data: profile } = useQuery({ queryKey: ["profile", uid], queryFn: async () => (await supabase.from("profiles").select("*").eq("id", uid).maybeSingle()).data });
  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ["my-orders", uid],
    queryFn: async () => (await supabase.from("orders").select("id,order_number,status,fulfillment,total,created_at,order_items(quantity,product_name)").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: points } = useQuery({ queryKey: ["points", uid], queryFn: async () => (await supabase.rpc("my_points_balance")).data ?? 0 });
  const { data: tiers } = useQuery(tiersQuery);

  const go = (t: Tab) => navigate({ to: "/account", search: { tab: t }, replace: true });
  const signOut = async () => {
    await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true });
  };

  const bookingsOn = settings?.reservations?.enabled !== false;
  const nav: { k: Tab; l: string; icon: typeof User }[] = [
    { k: "overview", l: "Overview", icon: LayoutDashboard },
    { k: "orders", l: "My orders", icon: Receipt },
    { k: "profile", l: "Profile", icon: User },
    { k: "addresses", l: "Addresses", icon: MapPin },
    ...(bookingsOn ? [{ k: "bookings" as Tab, l: "Table bookings", icon: CalendarDays }] : []),
  ];
  const firstName = (profile?.full_name || "").split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-8 md:pb-16 md:pt-12">
      <p className="text-sm font-bold uppercase tracking-widest text-brand-red">My account</p>
      <h1 className="mt-1 text-4xl text-primary md:text-5xl">{firstName ? `Hi, ${firstName}` : "Welcome back"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{session!.user.email}</p>

      <div className="mt-8 grid gap-6 md:grid-cols-[220px_1fr]">
        {/* Navigation: sidebar on desktop, scrollable tabs on mobile */}
        <aside>
          <nav className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:gap-1 md:overflow-visible">
            {nav.map((n) => (
              <button
                key={n.k}
                onClick={() => go(n.k)}
                aria-current={tab === n.k ? "page" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 text-sm font-bold md:rounded-2xl ${tab === n.k ? "bg-primary text-primary-foreground" : "bg-card ring-1 ring-border hover:bg-muted md:bg-transparent md:ring-0"}`}
              >
                <n.icon className="h-4 w-4" /> {n.l}
              </button>
            ))}
            <Link to="/club" className="flex shrink-0 items-center gap-3 rounded-full bg-card px-4 py-2.5 text-sm font-bold ring-1 ring-border hover:bg-muted md:rounded-2xl md:bg-transparent md:ring-0">
              <Star className="h-4 w-4" /> PANZUTTI Club
            </Link>
            <button onClick={signOut} className="flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 text-sm font-bold text-muted-foreground ring-1 ring-border hover:bg-muted md:rounded-2xl md:ring-0">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </nav>
        </aside>

        <main className="min-w-0">
          {tab === "overview" && <Overview orders={orders ?? []} loading={loadingOrders} points={points ?? 0} tiers={tiers ?? []} go={go} />}
          {tab === "orders" && <OrdersList orders={orders ?? []} loading={loadingOrders} />}
          {tab === "profile" && <Profile uid={uid} email={session!.user.email ?? ""} profile={profile} />}
          {tab === "addresses" && <Addresses uid={uid} />}
          {tab === "bookings" && <Bookings uid={uid} />}
        </main>
      </div>
    </div>
  );
}

type OrderRow = { id: string; order_number: string; status: string; fulfillment: string; total: number; created_at: string; order_items: { quantity: number; product_name: string }[] };

const Card = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <section className="rounded-3xl bg-card p-6 ring-1 ring-border">
    <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-xl text-primary">{title}</h2>{action}</div>
    {children}
  </section>
);

function Overview({ orders, loading, points, tiers, go }: { orders: OrderRow[]; loading: boolean; points: number; tiers: { id: string; points: number; discount: number }[]; go: (t: Tab) => void }) {
  const active = orders.filter((o) => ACTIVE.includes(o.status));
  const sorted = [...tiers].sort((a, b) => a.points - b.points);
  const next = sorted.find((t) => t.points > points);
  const unlocked = [...sorted].reverse().find((t) => t.points <= points);
  const pct = next ? Math.min(100, Math.round((points / next.points) * 100)) : 100;

  return (
    <div className="space-y-6">
      {/* Points */}
      <section className="rounded-3xl bg-primary p-6 text-primary-foreground">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-brand-yellow">PANZUTTI Club</p>
            <p className="mt-1 text-5xl font-extrabold">{points.toLocaleString()} <span className="text-2xl font-bold">points</span></p>
          </div>
          <Link to="/club" className="rounded-full bg-brand-yellow px-5 py-2.5 text-sm font-extrabold text-foreground">Points history</Link>
        </div>
        {next ? (
          <>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-primary-foreground/20"><div className="h-full rounded-full bg-brand-yellow" style={{ width: `${pct}%` }} /></div>
            <p className="mt-2 text-sm opacity-90">{(next.points - points).toLocaleString()} more points to {egp(next.discount)} off</p>
          </>
        ) : null}
        {unlocked && <p className="mt-2 text-sm font-bold text-brand-yellow">You can redeem {egp(unlocked.discount)} off at checkout.</p>}
        <p className="mt-1 text-xs opacity-75">Earn 1 point for every EGP on completed orders.</p>
      </section>

      {/* Active orders */}
      {active.length > 0 && (
        <Card title="Order in progress">
          <ul className="space-y-3">
            {active.map((o) => (
              <li key={o.id}>
                <Link to="/orders/$id" params={{ id: o.id }} className="flex items-center justify-between gap-3 rounded-2xl bg-brand-yellow/40 p-4 ring-1 ring-brand-yellow hover:ring-primary">
                  <div>
                    <p className="font-display text-lg text-primary">{o.order_number} · {fulfillmentLabel[o.fulfillment]}</p>
                    <p className="text-sm font-bold">{stepLabel(o.fulfillment, o.status)}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Track <ChevronRight className="h-4 w-4" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Recent orders */}
      <Card title="Recent orders" action={orders.length > 3 ? <button onClick={() => go("orders")} className="text-sm font-bold text-brand-red">See all →</button> : undefined}>
        <OrderItems orders={orders.slice(0, 3)} loading={loading} />
      </Card>

      {/* Shortcuts */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => go("profile")} className="flex items-center justify-between rounded-3xl bg-card p-5 text-left ring-1 ring-border hover:ring-primary">
          <span><span className="block font-bold">Edit profile</span><span className="text-sm text-muted-foreground">Name, mobile, offers</span></span><ChevronRight className="h-5 w-5" />
        </button>
        <button onClick={() => go("addresses")} className="flex items-center justify-between rounded-3xl bg-card p-5 text-left ring-1 ring-border hover:ring-primary">
          <span><span className="block font-bold">Saved addresses</span><span className="text-sm text-muted-foreground">Faster delivery checkout</span></span><ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function OrderItems({ orders, loading }: { orders: OrderRow[]; loading: boolean }) {
  if (loading) return <p className="text-muted-foreground">Loading…</p>;
  if (!orders.length)
    return (
      <div className="rounded-2xl bg-muted p-6 text-center">
        <p className="font-bold">No orders yet.</p>
        <Link to="/menu" className="mt-3 inline-block rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">Order your first panuozzo</Link>
      </div>
    );
  return (
    <ul className="divide-y divide-border">
      {orders.map((o) => {
        const items = o.order_items.map((i) => `${i.quantity}× ${i.product_name}`).join(", ");
        return (
          <li key={o.id}>
            <Link to="/orders/$id" params={{ id: o.id }} className="flex items-center justify-between gap-3 py-3 hover:opacity-80">
              <div className="min-w-0">
                <p className="font-bold">{o.order_number} <span className="font-normal text-muted-foreground">· {fmtDateTime(o.created_at)} · {fulfillmentLabel[o.fulfillment]}</span></p>
                <p className="truncate text-sm text-muted-foreground">{items}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-extrabold">{egp(o.total)}</p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${o.status === "cancelled" ? "bg-destructive/10 text-destructive" : o.status === "completed" ? "bg-muted" : "bg-brand-yellow"}`}>{stepLabel(o.fulfillment, o.status)}</span>
                {o.status === "completed" && <span className="mt-1 block text-xs font-bold text-brand-red">Rate this order</span>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function OrdersList({ orders, loading }: { orders: OrderRow[]; loading: boolean }) {
  return <Card title="My orders"><OrderItems orders={orders} loading={loading} /></Card>;
}

function Profile({ uid, email, profile }: { uid: string; email: string; profile: { full_name: string | null; phone: string | null; marketing_opt_in: boolean } | null | undefined }) {
  const qc = useQueryClient();
  const [p, setP] = useState({ full_name: "", phone: "", marketing_opt_in: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile) setP({ full_name: profile.full_name ?? "", phone: profile.phone ?? "", marketing_opt_in: profile.marketing_opt_in }); }, [profile]);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ full_name: p.full_name.trim(), phone: p.phone.trim(), marketing_opt_in: p.marketing_opt_in }).eq("id", uid);
    setBusy(false);
    if (error) toast.error(errMsg(error)); else { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile", uid] }); }
  };
  return (
    <Card title="Profile">
      <div className="grid max-w-xl gap-4">
        <div><Label htmlFor="pf-name">Full name</Label><Input id="pf-name" autoComplete="name" value={p.full_name} onChange={(e) => setP({ ...p, full_name: e.target.value })} /></div>
        <div><Label htmlFor="pf-phone">Mobile</Label><Input id="pf-phone" type="tel" autoComplete="tel" placeholder="01x xxxx xxxx" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /><p className="mt-0.5 text-xs text-muted-foreground">Filled in for you at checkout.</p></div>
        <div><Label>Email</Label><Input value={email} disabled /></div>
        <label className="flex items-center gap-3 text-sm"><Switch checked={p.marketing_opt_in} onCheckedChange={(v) => setP({ ...p, marketing_opt_in: v })} /> Send me news and offers</label>
        <button disabled={busy} onClick={save} className="w-fit rounded-full bg-primary px-6 py-2.5 font-bold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Save changes"}</button>
      </div>
    </Card>
  );
}

function Addresses({ uid }: { uid: string }) {
  const { data: zones } = useQuery(zonesQuery);
  const { data: addresses, refetch } = useQuery({ queryKey: ["addresses", uid], queryFn: async () => (await supabase.from("addresses").select("*").order("created_at")).data ?? [] });
  const empty = { label: "Home", address_line: "", building: "", floor: "", apartment: "", zone_id: "" };
  const [a, setA] = useState(empty);
  const [adding, setAdding] = useState(false);
  const zoneName = (id: string | null) => zones?.find((z) => z.id === id)?.name;

  const add = async () => {
    if (!a.address_line.trim()) return toast.error("Enter a street address");
    const { error } = await supabase.from("addresses").insert({ ...a, zone_id: a.zone_id || null, user_id: uid });
    if (error) return toast.error(errMsg(error));
    setA(empty); setAdding(false); refetch(); toast.success("Address saved");
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this address?")) return;
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (error) toast.error(errMsg(error)); else refetch();
  };

  return (
    <Card title="Saved addresses" action={!adding ? <button onClick={() => setAdding(true)} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">+ Add address</button> : undefined}>
      {!addresses?.length && !adding && <p className="text-muted-foreground">No saved addresses yet. Add one to check out faster.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {addresses?.map((x) => (
          <li key={x.id} className="flex justify-between gap-3 rounded-2xl bg-muted p-4 text-sm">
            <span>
              <b className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {x.label}</b>
              <span className="mt-1 block">{x.address_line}{x.building && `, Bldg ${x.building}`}{x.floor && `, Floor ${x.floor}`}{x.apartment && `, Apt ${x.apartment}`}</span>
              {zoneName(x.zone_id) && <span className="block text-muted-foreground">{zoneName(x.zone_id)}</span>}
            </span>
            <button onClick={() => remove(x.id)} aria-label="Delete address" className="h-fit p-1 text-destructive"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
      </ul>
      {adding && (
        <div className="mt-4 space-y-3 rounded-2xl p-4 ring-1 ring-border">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Label</Label><Input placeholder="Home, Work…" value={a.label} onChange={(e) => setA({ ...a, label: e.target.value })} /></div>
            <div><Label>Area</Label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={a.zone_id} onChange={(e) => setA({ ...a, zone_id: e.target.value })}>
                <option value="">Choose area</option>
                {zones?.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2"><Label>Street address</Label><Input value={a.address_line} onChange={(e) => setA({ ...a, address_line: e.target.value })} /></div>
            <div><Label>Building</Label><Input value={a.building} onChange={(e) => setA({ ...a, building: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2"><div><Label>Floor</Label><Input value={a.floor} onChange={(e) => setA({ ...a, floor: e.target.value })} /></div><div><Label>Apt</Label><Input value={a.apartment} onChange={(e) => setA({ ...a, apartment: e.target.value })} /></div></div>
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-primary-foreground">Save address</button>
            <button onClick={() => { setAdding(false); setA(empty); }} className="rounded-full px-5 py-2 text-sm font-bold ring-1 ring-border">Cancel</button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Bookings({ uid }: { uid: string }) {
  const { data: reservations, refetch } = useQuery({ queryKey: ["my-res", uid], queryFn: async () => (await supabase.from("reservations").select("*").order("reserved_date", { ascending: false })).data ?? [] });
  return (
    <Card title="Table bookings" action={<Link to="/reservations" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Book a table</Link>}>
      {!reservations?.length && <p className="text-muted-foreground">No bookings yet.</p>}
      <ul className="space-y-2">
        {reservations?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-muted p-3">
            <span><b>{r.reserved_date}</b> at {r.reserved_time.slice(0, 5)} · {r.guests} guests</span>
            <span className="flex items-center gap-3">
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold">{r.status === "pending" ? "Awaiting confirmation" : statusLabel[r.status] ?? r.status}</span>
              {["pending", "confirmed"].includes(r.status) && (
                <button className="text-sm text-destructive" onClick={async () => {
                  if (!confirm("Cancel this booking?")) return;
                  const { error } = await supabase.rpc("cancel_my_reservation", { _id: r.id });
                  if (error) toast.error(errMsg(error)); else { toast.success("Booking cancelled"); refetch(); }
                }}>Cancel</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
