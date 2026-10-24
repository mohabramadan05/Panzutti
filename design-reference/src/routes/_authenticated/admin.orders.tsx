import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Phone, MapPin, Clock, Bike, Link2, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { egp, errMsg, fmtDateTime, fmtDayTime, fmtTime, fulfillmentLabel, mapsLink, stepLabel, telLink } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";

type Status = Database["public"]["Enums"]["order_status"];
type Driver = Database["public"]["Tables"]["drivers"]["Row"];

export const Route = createFileRoute("/_authenticated/admin/orders")({ component: AdminOrders });

const SELECT = "*, order_items(*), order_status_history(status,created_at,note), drivers!orders_driver_id_fkey(id,full_name,phone)";

const fetchOrders = async () => {
  const { data, error } = await supabase.from("orders").select(SELECT).order("created_at", { ascending: false }).limit(300);
  if (error) throw error;
  return data ?? [];
};
type Order = Awaited<ReturnType<typeof fetchOrders>>[number];

const TABS: { k: string; l: string; match: (o: Order) => boolean }[] = [
  { k: "all", l: "All", match: () => true },
  { k: "new", l: "New", match: (o) => o.status === "pending" },
  { k: "confirmed", l: "Confirmed", match: (o) => o.status === "confirmed" },
  { k: "preparing", l: "Preparing", match: (o) => o.status === "preparing" },
  { k: "ready_pickup", l: "Ready for Pickup", match: (o) => o.status === "ready" && o.fulfillment !== "delivery" },
  { k: "ready_dispatch", l: "Ready for Dispatch", match: (o) => o.fulfillment === "delivery" && (o.status === "ready" || o.status === "driver_assigned") },
  { k: "out", l: "Out for Delivery", match: (o) => o.status === "picked_up" || o.status === "out_for_delivery" },
  { k: "completed", l: "Completed", match: (o) => ["delivered", "collected", "completed"].includes(o.status) },
  { k: "cancelled", l: "Cancelled", match: (o) => o.status === "cancelled" || o.status === "refunded" },
];

const FINAL = ["completed", "cancelled", "refunded"];

/** Next step button for each state (the database re-checks every move). */
function nextAction(o: Order): { status: Status; label: string } | null {
  switch (o.status) {
    case "pending": return { status: "confirmed", label: "Confirm order" };
    case "confirmed": return { status: "preparing", label: "Start preparing" };
    case "preparing": return { status: "ready", label: o.fulfillment === "delivery" ? "Ready for dispatch" : o.fulfillment === "pickup" ? "Ready for pickup" : "Ready to serve" };
    case "ready": return o.fulfillment === "pickup" ? { status: "collected", label: "Mark collected" } : o.fulfillment === "dine_in" ? { status: "completed", label: "Served — complete" } : null;
    case "driver_assigned": return { status: "picked_up", label: "Driver picked up" };
    case "picked_up": return { status: "out_for_delivery", label: "Out for delivery" };
    case "out_for_delivery": return { status: "delivered", label: "Mark delivered" };
    case "delivered":
    case "collected": return { status: "completed", label: "Complete" };
    default: return null;
  }
}

type Action =
  | { kind: "status"; o: Order; status: Status; label: string }
  | { kind: "cancel"; o: Order; reject: boolean }
  | { kind: "estimate"; o: Order }
  | { kind: "driver"; o: Order };

function AdminOrders() {
  const [tab, setTab] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const { data, refetch } = useQuery({ queryKey: ["admin-orders"], queryFn: fetchOrders, refetchInterval: 20_000 });
  const { data: drivers } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: async () => (await supabase.from("drivers").select("*").order("is_active", { ascending: false }).order("full_name")).data ?? [],
  });

  useEffect(() => {
    const ch = supabase.channel("admin-orders").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => refetch()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  // Heads-up when a new order lands.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const pending = data.filter((o) => o.status === "pending");
    if (seen.current) for (const o of pending) if (!seen.current.has(o.id)) toast.info(`New ${fulfillmentLabel[o.fulfillment].toLowerCase()} order ${o.order_number}`, { duration: 8000 });
    seen.current = new Set(data.map((o) => o.id));
  }, [data]);

  const current = TABS.find((t) => t.k === tab) ?? TABS[0];
  const list = (data ?? []).filter(current.match);
  const busyDrivers = new Set((data ?? []).filter((o) => o.driver_id && ["driver_assigned", "picked_up", "out_for_delivery"].includes(o.status)).map((o) => o.driver_id!));

  return (
    <div>
      <h1 className="text-3xl text-primary md:text-4xl">Orders</h1>
      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0">
        {TABS.map((t) => {
          const n = (data ?? []).filter(t.match).length;
          return (
            <button key={t.k} onClick={() => setTab(t.k)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${tab === t.k ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}>
              {t.l} {t.k !== "all" && n > 0 && <span className={`ml-1 rounded-full px-1.5 text-xs ${t.k === "new" ? "bg-brand-red text-brand-cream" : "bg-muted text-foreground"}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-3">
        {!list.length && <p className="text-muted-foreground">No orders here.</p>}
        {list.map((o) => (
          <OrderCard key={o.id} o={o} open={openId === o.id} onToggle={() => setOpenId(openId === o.id ? null : o.id)} onAction={setAction} />
        ))}
      </div>

      <Dialog open={!!action} onOpenChange={(v) => !v && setAction(null)}>
        <DialogContent className="max-w-md">
          {action && <ActionForm a={action} drivers={drivers ?? []} busyDrivers={busyDrivers} onDone={() => { setAction(null); refetch(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderCard({ o, open, onToggle, onAction }: { o: Order; open: boolean; onToggle: () => void; onAction: (a: Action) => void }) {
  const next = nextAction(o);
  const finished = FINAL.includes(o.status);
  const canDriver = o.fulfillment === "delivery" && ["confirmed", "preparing", "ready", "driver_assigned", "picked_up", "out_for_delivery"].includes(o.status);
  const canAdjust = !["completed", "cancelled", "refunded", "delivered", "collected"].includes(o.status);
  const map = o.fulfillment === "delivery" ? mapsLink({ lat: o.lat, lng: o.lng, address: o.address }) : "";
  const eta = o.fulfillment === "delivery" ? o.estimated_delivery_at : o.fulfillment === "pickup" ? o.scheduled_for ?? o.estimated_ready_at : o.estimated_ready_at;
  const late = !finished && eta && new Date(eta).getTime() < Date.now();
  const history = [...(o.order_status_history ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/track/${o.tracking_token}`); toast.success("Tracking link copied"); } catch { toast.error("Couldn't copy"); }
  };

  return (
    <div className={`rounded-2xl bg-card p-4 ring-1 ${o.status === "pending" ? "ring-2 ring-brand-red" : "ring-border"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button onClick={onToggle} className="min-w-0 text-left">
          <p className="flex flex-wrap items-center gap-2 font-display text-lg text-primary">
            {o.order_number}
            <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-bold text-foreground">{fulfillmentLabel[o.fulfillment]}{o.table_number ? ` · Table ${o.table_number}` : ""}</span>
            <span className={`rounded-full px-2 py-0.5 font-sans text-xs font-bold ${o.status === "cancelled" ? "bg-destructive/10 text-destructive" : o.status === "pending" ? "bg-brand-red text-brand-cream" : "bg-brand-yellow text-foreground"}`}>{stepLabel(o.fulfillment, o.status)}</span>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </p>
          <p className="text-sm text-muted-foreground">{fmtDateTime(o.created_at)} · {o.customer_name} · {o.order_items.reduce((s, i) => s + i.quantity, 0)} items</p>
          {eta && !finished && (
            <p className={`mt-1 flex items-center gap-1 text-sm font-bold ${late ? "text-destructive" : ""}`}>
              <Clock className="h-3.5 w-3.5" />
              {o.fulfillment === "delivery" ? `Arrive ~${fmtTime(eta)} · kitchen ~${fmtTime(o.estimated_ready_at)}` : o.fulfillment === "pickup" ? `Pickup ${fmtDayTime(eta)}` : `Ready ~${fmtTime(eta)}`}
              {late && " · running late"}
            </p>
          )}
          {o.drivers && <p className="mt-1 flex items-center gap-1 text-sm"><Bike className="h-3.5 w-3.5" /> {o.drivers.full_name}</p>}
        </button>
        <div className="flex flex-col items-end gap-2">
          <b className="text-lg">{egp(o.total)}</b>
          <a href={telLink(o.phone)} className="inline-flex items-center gap-1 text-sm font-bold"><Phone className="h-3.5 w-3.5" /> {o.phone}</a>
        </div>
      </div>

      {!finished && (
        <div className="mt-3 flex flex-wrap gap-2">
          {next && <button onClick={() => onAction({ kind: "status", o, status: next.status, label: next.label })} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">{next.label}</button>}
          {canDriver && <button onClick={() => onAction({ kind: "driver", o })} className={`rounded-full px-4 py-2 text-sm font-bold ${o.status === "ready" && !o.driver_id ? "bg-primary text-primary-foreground" : "ring-1 ring-border"}`}>{o.driver_id ? "Change driver" : "Assign driver"}</button>}
          {canAdjust && <button onClick={() => onAction({ kind: "estimate", o })} className="rounded-full px-4 py-2 text-sm font-bold ring-1 ring-border">Adjust time</button>}
          <button onClick={() => onAction({ kind: "cancel", o, reject: o.status === "pending" })} className="rounded-full px-4 py-2 text-sm font-bold text-destructive ring-1 ring-destructive/40">{o.status === "pending" ? "Reject" : "Cancel"}</button>
        </div>
      )}

      {open && (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm md:grid-cols-2">
          <div className="space-y-2">
            <ul className="space-y-1">
              {o.order_items.map((i) => (
                <li key={i.id}>
                  <b>{i.quantity}×</b> {i.product_name} — {egp(i.line_total)}
                  {Array.isArray(i.options) && i.options.length > 0 && <span className="block text-muted-foreground">{(i.options as { name: string }[]).map((x) => x.name).join(", ")}</span>}
                  {i.notes && <i className="block">“{i.notes}”</i>}
                </li>
              ))}
            </ul>
            <div className="space-y-0.5 border-t border-border pt-2">
              <p>Subtotal {egp(o.subtotal)}{Number(o.promo_discount) > 0 && ` · promo ${o.promo_code} −${egp(o.promo_discount)}`}{Number(o.reward_discount) > 0 && ` · reward −${egp(o.reward_discount)}`}</p>
              {o.fulfillment === "delivery" && <p>Delivery fee {egp(o.delivery_fee)}</p>}
              <p><b>Total {egp(o.total)}</b> · {o.payment_method === "cash" ? "Cash" : o.payment_method} · {o.payment_status}</p>
            </div>
            {o.notes && <p className="rounded-xl bg-brand-yellow/40 p-2"><b>Customer note:</b> {o.notes}</p>}
          </div>
          <div className="space-y-2">
            {o.fulfillment === "delivery" && (
              <div>
                <p><b>Address:</b> {o.address}</p>
                {o.delivery_notes && <p><b>Directions:</b> {o.delivery_notes}</p>}
                {map && <a href={map} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-bold underline"><MapPin className="h-3.5 w-3.5" /> {o.lat && o.lng ? "Customer's pin on Google Maps" : "Search address on Google Maps"}</a>}
              </div>
            )}
            {o.scheduled_for && <p><b>Pickup time:</b> {fmtDayTime(o.scheduled_for)}</p>}
            {o.prep_minutes != null && <p><b>Kitchen estimate:</b> {o.prep_minutes} min · ready ~{fmtTime(o.estimated_ready_at)}</p>}
            {o.estimate_note && <p><b>Time note:</b> {o.estimate_note}</p>}
            {o.drivers && <p><b>Driver:</b> {o.drivers.full_name} · <a className="underline" href={telLink(o.drivers.phone)}>{o.drivers.phone}</a></p>}
            {o.cancel_reason && <p className="text-destructive"><b>Cancel reason:</b> {o.cancel_reason}</p>}
            <div>
              <p className="font-bold">History</p>
              <ol className="mt-1 space-y-0.5">
                {history.map((h, i) => (
                  <li key={i}><span className="text-muted-foreground">{fmtTime(h.created_at)}</span> · {stepLabel(o.fulfillment, h.status)}{h.note ? ` — ${h.note}` : ""}</li>
                ))}
              </ol>
            </div>
            <button onClick={copyLink} className="inline-flex items-center gap-1 font-bold text-primary"><Link2 className="h-3.5 w-3.5" /> Copy customer tracking link</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionForm({ a, drivers, busyDrivers, onDone }: { a: Action; drivers: Driver[]; busyDrivers: Set<string>; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(10);
  const [driverId, setDriverId] = useState(a.kind === "driver" ? a.o.driver_id ?? "" : "");
  const [busy, setBusy] = useState(false);
  const o = a.o;

  const run = async () => {
    setBusy(true);
    let error: unknown = null;
    if (a.kind === "status") {
      ({ error } = await supabase.rpc("admin_update_order_status", { _order: o.id, _status: a.status, _note: reason.trim() || undefined }));
    } else if (a.kind === "cancel") {
      if (!reason.trim()) { setBusy(false); return toast.error("Please give a reason — the customer will see it."); }
      ({ error } = await supabase.rpc("admin_update_order_status", { _order: o.id, _status: "cancelled", _note: reason.trim() }));
    } else if (a.kind === "estimate") {
      if (!reason.trim()) { setBusy(false); return toast.error("Please give a reason — the customer will see it."); }
      if (!minutes || Math.abs(minutes) > 240) { setBusy(false); return toast.error("Adjust by 1 to 240 minutes."); }
      ({ error } = await supabase.rpc("admin_adjust_estimate", { _order: o.id, _minutes: minutes, _reason: reason.trim() }));
    } else {
      if (!driverId) { setBusy(false); return toast.error("Choose a delivery person."); }
      ({ error } = await supabase.rpc("admin_assign_driver", { _order: o.id, _driver: driverId, _reason: reason.trim() || undefined }));
    }
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Updated");
    onDone();
  };

  const title =
    a.kind === "status" ? `${a.label}?` : a.kind === "cancel" ? (a.reject ? "Reject this order?" : "Cancel this order?") : a.kind === "estimate" ? "Adjust estimated time" : o.driver_id ? "Change delivery person" : "Assign delivery person";
  const available = drivers.filter((d) => d.is_active);

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Order {o.order_number} · {o.customer_name} · {fulfillmentLabel[o.fulfillment]}</DialogDescription>
      </DialogHeader>

      {a.kind === "status" && (
        <>
          <p className="text-sm">The customer's tracking page will show <b>{stepLabel(o.fulfillment, a.status)}</b> straight away.</p>
          <div><Label>Note for the customer (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></div>
        </>
      )}
      {a.kind === "cancel" && (
        <>
          <p className="text-sm text-destructive">This can't be undone. The customer sees the reason on their tracking page.</p>
          <div><Label>Reason (required)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder={a.reject ? "e.g. Out of an ingredient, outside delivery area" : "e.g. Customer asked to cancel"} /></div>
        </>
      )}
      {a.kind === "estimate" && (
        <>
          <div className="flex flex-wrap gap-2">
            {[-10, -5, 5, 10, 15, 20, 30].map((m) => (
              <button key={m} type="button" onClick={() => setMinutes(m)} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${minutes === m ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}>{m > 0 ? `+${m}` : m} min</button>
            ))}
          </div>
          <div className="max-w-[10rem]"><Label>Minutes (+ later, − sooner)</Label><Input type="number" value={minutes} onChange={(e) => setMinutes(Math.round(+e.target.value || 0))} /></div>
          <p className="text-sm text-muted-foreground">
            Now: ready ~{fmtTime(o.estimated_ready_at)}{o.estimated_delivery_at && ` · arrive ~${fmtTime(o.estimated_delivery_at)}`}. New: ready ~{fmtTime(o.estimated_ready_at ? new Date(new Date(o.estimated_ready_at).getTime() + minutes * 60000).toISOString() : null)}
            {o.estimated_delivery_at && ` · arrive ~${fmtTime(new Date(new Date(o.estimated_delivery_at).getTime() + minutes * 60000).toISOString())}`}
          </p>
          <div><Label>Reason (customer sees this)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Busy kitchen, heavy traffic" /></div>
        </>
      )}
      {a.kind === "driver" && (
        <>
          {!available.length ? (
            <p className="text-sm text-destructive">No active delivery staff. Add someone under Delivery staff first.</p>
          ) : (
            <div className="space-y-2">
              {available
                .sort((x, y) => Number(busyDrivers.has(x.id)) - Number(busyDrivers.has(y.id)) || Number(y.is_available) - Number(x.is_available))
                .map((d) => (
                  <label key={d.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl p-3 ring-1 ${driverId === d.id ? "ring-2 ring-primary" : "ring-border"}`}>
                    <span className="flex items-center gap-3">
                      <input type="radio" name="driver" checked={driverId === d.id} onChange={() => setDriverId(d.id)} />
                      <span><b>{d.full_name}</b><span className="block text-xs text-muted-foreground">{d.phone}</span></span>
                    </span>
                    <span className="text-xs font-bold">{busyDrivers.has(d.id) ? "On a delivery" : d.is_available ? "Available" : "Off shift"}</span>
                  </label>
                ))}
            </div>
          )}
          {o.driver_id && <div><Label>Reason for change (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></div>}
          {o.status === "ready" && <p className="text-sm text-muted-foreground">The order moves to “Delivery person assigned” and the customer sees their name and number.</p>}
        </>
      )}

      <div className="flex gap-2">
        <button disabled={busy} onClick={run} className={`flex-1 rounded-full py-3 font-bold disabled:opacity-50 ${a.kind === "cancel" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
          {busy ? "Saving…" : a.kind === "cancel" ? (a.reject ? "Reject order" : "Cancel order") : "Confirm"}
        </button>
      </div>
    </div>
  );
}
