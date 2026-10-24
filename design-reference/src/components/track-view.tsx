import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Clock, MapPin, Phone, Bike, Store, UtensilsCrossed, Link2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { OrderReview } from "@/components/order-review";
import { egp, fmtDateTime, fmtDayTime, fmtTime, fulfillmentLabel, mapsLink, orderSteps, stepLabel, telLink } from "@/lib/format";

export type TrackedOrder = {
  id: string;
  order_number: string;
  fulfillment: "delivery" | "pickup" | "dine_in";
  status: string;
  created_at: string;
  customer_name: string;
  scheduled_for: string | null;
  table_number: string | null;
  prep_minutes: number | null;
  estimated_ready_at: string | null;
  estimated_delivery_at: string | null;
  estimate_note: string | null;
  address: string | null;
  delivery_notes: string | null;
  cancel_reason: string | null;
  notes: string | null;
  subtotal: number;
  promo_code: string | null;
  promo_discount: number;
  reward_discount: number;
  points_redeemed: number;
  points_awarded: number;
  delivery_fee: number;
  total: number;
  payment_method: string;
  payment_status: string;
  items: { id: string; name: string; quantity: number; unit_price: number; line_total: number; options: { name: string }[] | null; notes: string | null }[];
  history: { status: string; at: string; note: string | null }[];
  driver: { name: string; phone: string } | null;
  restaurant: { address?: string; phone?: string; map_url?: string; lat?: string; lng?: string };
};

const POLL_MS = 10_000;
const FINISHED = ["completed", "cancelled", "refunded"];

export function useTrackedOrder(token: string | undefined) {
  return useQuery({
    queryKey: ["track", token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_tracked_order", { _token: token! });
      if (error) throw error;
      return (data ?? null) as unknown as TrackedOrder | null;
    },
    // Live updates without a manual refresh: re-check the real order every few seconds until it's finished.
    refetchInterval: (q) => (q.state.data && FINISHED.includes(q.state.data.status) ? false : POLL_MS),
    refetchOnWindowFocus: true,
  });
}

export function TrackView({ token }: { token: string }) {
  const { data: o, isLoading, error, dataUpdatedAt } = useTrackedOrder(token);
  const [copied, setCopied] = useState(false);

  if (isLoading) return <p className="rounded-3xl bg-card p-8 text-center">Loading your order…</p>;
  if (error) return <p className="rounded-3xl bg-card p-8 text-center">We couldn't load this order right now. Please refresh in a moment.</p>;
  if (!o) return <p className="rounded-3xl bg-card p-8 text-center">We couldn't find this order. Please check the link you were given.</p>;

  const steps = orderSteps[o.fulfillment] ?? [];
  const stopped = o.status === "cancelled" || o.status === "refunded";
  const firstAt: Record<string, string> = {};
  for (const h of o.history) if (!firstAt[h.status]) firstAt[h.status] = h.at;
  const reached = new Set(o.history.map((h) => h.status));
  const idx = steps.findIndex((x) => x.s === o.status);
  const updates = o.history.filter((h) => h.note && !h.note.startsWith("Assigned to"));
  const live = !FINISHED.includes(o.status);
  const restaurantMap = mapsLink({ lat: o.restaurant.lat, lng: o.restaurant.lng, map_url: o.restaurant.map_url, address: o.restaurant.address });
  const kitchenDone = ["ready", "driver_assigned", "picked_up", "out_for_delivery", "delivered", "collected", "completed"].includes(o.status);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin + `/track/${token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        {/* Headline + estimate */}
        <section className="rounded-3xl bg-card p-6 ring-1 ring-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-brand-red">{fulfillmentLabel[o.fulfillment]}</p>
              <h2 className="mt-1 text-3xl text-primary">Order {o.order_number}</h2>
              <p className="text-sm text-muted-foreground">Placed {fmtDateTime(o.created_at)}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${stopped ? "bg-destructive/10 text-destructive" : "bg-brand-yellow text-foreground"}`}>
              {stopped ? "Cancelled" : stepLabel(o.fulfillment, o.status)}
            </span>
          </div>

          {!stopped && o.status !== "completed" && (
            <div className="mt-5 rounded-2xl bg-primary p-5 text-primary-foreground">
              {o.fulfillment === "delivery" && (
                <>
                  <p className="text-sm opacity-80">{o.status === "delivered" ? "Delivered" : "Estimated arrival"}</p>
                  <p className="text-3xl font-extrabold">{o.status === "delivered" ? fmtTime(firstAt.delivered) : `around ${fmtTime(o.estimated_delivery_at)}`}</p>
                  {o.status !== "delivered" && (
                    <p className="mt-1 text-sm opacity-80">
                      {kitchenDone ? "Food is ready" : `Kitchen ready around ${fmtTime(o.estimated_ready_at)}`} · then on its way to you
                    </p>
                  )}
                </>
              )}
              {o.fulfillment === "pickup" && (
                <>
                  <p className="text-sm opacity-80">{o.status === "ready" ? "Ready now — come and collect" : o.status === "collected" ? "Collected" : "Pickup time"}</p>
                  <p className="text-3xl font-extrabold">{fmtDayTime(o.scheduled_for ?? o.estimated_ready_at)}</p>
                  {o.status !== "ready" && o.status !== "collected" && o.estimated_ready_at && o.scheduled_for && fmtTime(o.estimated_ready_at) !== fmtTime(o.scheduled_for) && (
                    <p className="mt-1 text-sm opacity-80">Kitchen expects it ready around {fmtTime(o.estimated_ready_at)}</p>
                  )}
                </>
              )}
              {o.fulfillment === "dine_in" && (
                <>
                  <p className="text-sm opacity-80">{o.status === "ready" ? "Ready — enjoy!" : "Ready around"}</p>
                  <p className="text-3xl font-extrabold">{o.status === "ready" ? fmtTime(firstAt.ready) : fmtTime(o.estimated_ready_at)}</p>
                  {o.table_number && <p className="mt-1 text-sm opacity-80">Table {o.table_number}</p>}
                </>
              )}
              {o.estimate_note && <p className="mt-3 rounded-xl bg-primary-foreground/10 px-3 py-2 text-sm">Time updated: {o.estimate_note}</p>}
            </div>
          )}

          {stopped && (
            <div className="mt-5 flex gap-3 rounded-2xl bg-destructive/10 p-4 text-destructive">
              <XCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-bold">This order was cancelled.</p>
                {o.cancel_reason && <p className="text-sm">Reason: {o.cancel_reason}</p>}
                {o.restaurant.phone && <p className="text-sm">Questions? Call us on <a className="underline" href={telLink(o.restaurant.phone)}>{o.restaurant.phone}</a>.</p>}
              </div>
            </div>
          )}

          {/* Timeline */}
          <ol className="mt-6">
            {steps.map((st, i) => {
              const done = stopped ? reached.has(st.s) : i <= idx;
              const current = !stopped && i === idx && o.status !== "completed";
              if (stopped && !done) return null;
              return (
                <li key={st.s} className="relative flex gap-4 pb-5 last:pb-0">
                  {i < steps.length - 1 && <span className={`absolute left-[11px] top-6 h-full w-0.5 ${done && i < idx ? "bg-primary" : "bg-border"}`} />}
                  <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${done ? "bg-primary text-primary-foreground" : "bg-muted ring-1 ring-border"} ${current ? "ring-4 ring-brand-yellow" : ""}`}>
                    {done && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <div className="-mt-0.5 flex flex-1 flex-wrap justify-between gap-x-3">
                    <span className={done ? "font-bold" : "text-muted-foreground"}>{st.l}</span>
                    {firstAt[st.s] && <span className="text-sm text-muted-foreground">{fmtTime(firstAt[st.s])}</span>}
                  </div>
                </li>
              );
            })}
          </ol>

          {updates.length > 0 && (
            <div className="mt-5 space-y-1 border-t border-border pt-4 text-sm">
              {updates.map((h, i) => (
                <p key={i}><span className="text-muted-foreground">{fmtTime(h.at)}</span> · {h.note}</p>
              ))}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {live && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 animate-pulse rounded-full bg-primary" /> Live — this page updates by itself</span>}
            {dataUpdatedAt > 0 && <span>Last checked {new Date(dataUpdatedAt).toLocaleTimeString()}</span>}
            <button onClick={copy} className="inline-flex items-center gap-1 font-bold text-primary"><Link2 className="h-3.5 w-3.5" /> {copied ? "Link copied" : "Copy tracking link"}</button>
          </div>
        </section>

        {o.status === "completed" && <OrderReview token={token} />}

        {/* Delivery person */}
        {o.fulfillment === "delivery" && o.driver && (
          <section className="flex items-center justify-between gap-4 rounded-3xl bg-card p-6 ring-1 ring-border">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-yellow"><Bike className="h-6 w-6" /></span>
              <div>
                <p className="text-sm text-muted-foreground">Your delivery person</p>
                <p className="text-lg font-extrabold">{o.driver.name}</p>
                <p className="text-sm">{o.driver.phone}</p>
              </div>
            </div>
            <a href={telLink(o.driver.phone)} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground"><Phone className="h-4 w-4" /> Call</a>
          </section>
        )}

        {/* Where */}
        <section className="space-y-3 rounded-3xl bg-card p-6 ring-1 ring-border">
          {o.fulfillment === "delivery" ? (
            <>
              <h3 className="flex items-center gap-2 text-lg text-primary"><MapPin className="h-5 w-5" /> Delivering to</h3>
              <p>{o.address}</p>
              {o.delivery_notes && <p className="text-sm text-muted-foreground">Note for driver: {o.delivery_notes}</p>}
            </>
          ) : (
            <>
              <h3 className="flex items-center gap-2 text-lg text-primary">{o.fulfillment === "pickup" ? <Store className="h-5 w-5" /> : <UtensilsCrossed className="h-5 w-5" />} {o.fulfillment === "pickup" ? "Collect from" : "Find us at"}</h3>
              <p>{o.restaurant.address}</p>
            </>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {o.fulfillment !== "delivery" && restaurantMap && (
              <a href={restaurantMap} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><MapPin className="h-4 w-4" /> Open in Google Maps</a>
            )}
            {o.restaurant.phone && (
              <a href={telLink(o.restaurant.phone)} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ring-1 ring-border"><Phone className="h-4 w-4" /> Call PANZUTTI</a>
            )}
          </div>
        </section>
      </div>

      {/* Receipt */}
      <aside className="h-fit space-y-2 rounded-3xl bg-primary p-6 text-primary-foreground lg:sticky lg:top-24">
        <h3 className="mb-2 text-xl">Your order</h3>
        {o.items.map((i) => (
          <div key={i.id} className="text-sm">
            <div className="flex justify-between gap-2"><span>{i.quantity}× {i.name}</span><span>{egp(i.line_total)}</span></div>
            {Array.isArray(i.options) && i.options.length > 0 && <p className="opacity-70">{i.options.map((x) => x.name).join(" · ")}</p>}
            {i.notes && <p className="italic opacity-70">“{i.notes}”</p>}
          </div>
        ))}
        <hr className="border-primary-foreground/20" />
        <div className="flex justify-between text-sm"><span>Subtotal</span><span>{egp(o.subtotal)}</span></div>
        {Number(o.promo_discount) > 0 && <div className="flex justify-between text-sm"><span>Promo {o.promo_code}</span><span>− {egp(o.promo_discount)}</span></div>}
        {Number(o.reward_discount) > 0 && <div className="flex justify-between text-sm"><span>Club reward ({o.points_redeemed} pts)</span><span>− {egp(o.reward_discount)}</span></div>}
        {o.fulfillment === "delivery" && <div className="flex justify-between text-sm"><span>Delivery fee</span><span>{egp(o.delivery_fee)}</span></div>}
        <div className="flex justify-between text-xl font-extrabold"><span>Total</span><span>{egp(o.total)}</span></div>
        <p className="flex items-center gap-2 text-sm opacity-80"><Clock className="h-4 w-4" />
          {o.payment_method === "cash" ? (o.fulfillment === "delivery" ? "Cash on delivery" : "Pay cash at the restaurant") : "Card"} · {o.payment_status === "paid" ? "Paid" : "Not paid yet"}
        </p>
        {o.notes && <p className="text-sm opacity-80">Your note: {o.notes}</p>}
        {o.points_awarded > 0 && <p className="text-sm text-brand-yellow">+{o.points_awarded} Club points earned</p>}
      </aside>
    </div>
  );
}
