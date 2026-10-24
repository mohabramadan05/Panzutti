import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Bike, ShoppingBag, UtensilsCrossed, LocateFixed, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCart, cartPayload, lineUnit } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { zonesQuery, tiersQuery, settingsQuery } from "@/lib/data";
import { egp, errMsg, fmtDayTime, fmtTime, newRequestId, rememberOrder, type Fulfillment } from "@/lib/format";
import { PageShell } from "@/components/brand";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/checkout")({
  ssr: false,
  validateSearch: z.object({
    reservation: z.string().optional(),
    type: z.enum(["delivery", "pickup", "dine_in"]).optional(),
  }),
  head: () => ({
    meta: [
      { title: "Checkout — PANZUTTI" },
      { name: "description", content: "Choose delivery, pickup or dine-in and place your PANZUTTI order. Cash only." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Checkout — PANZUTTI" },
      { property: "og:description", content: "Place your PANZUTTI order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Checkout,
});

type Quote = {
  subtotal: number; promo_discount: number; reward_discount: number; delivery_fee: number; total: number; points_balance: number; points_to_earn: number;
  prep_minutes: number; ready_at: string; delivery_minutes: number | null; dispatch_buffer_minutes: number; delivery_at: string | null;
};
type Slots = { prep_minutes: number; slot_minutes: number; earliest: string | null; slots: string[] };

type SavedDetails = { customer_name: string; phone: string; address: string; zone_id: string; delivery_notes: string };
const DETAILS_KEY = "pz-checkout-details";
const loadDetails = (): SavedDetails | null => {
  try { return JSON.parse(localStorage.getItem(DETAILS_KEY) || "null"); } catch { return null; }
};
const saveDetails = (d: SavedDetails) => {
  try { localStorage.setItem(DETAILS_KEY, JSON.stringify(d)); } catch {}
};

const addressText = (a: { address_line: string; building: string | null; floor: string | null; apartment: string | null }) =>
  [a.address_line, a.building && `Bldg ${a.building}`, a.floor && `Floor ${a.floor}`, a.apartment && `Apt ${a.apartment}`].filter(Boolean).join(", ");

function Checkout() {
  const { reservation, type } = Route.useSearch();
  const { lines, clear, fulfillment, setFulfillment, zoneId, setZoneId } = useCart();
  const { session } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: zones } = useQuery(zonesQuery);
  const { data: tiers } = useQuery({ ...tiersQuery, enabled: !!session });
  const { data: settings } = useQuery(settingsQuery);
  const { data: profile } = useQuery({
    queryKey: ["profile", session?.user.id],
    enabled: !!session,
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", session!.user.id).maybeSingle()).data,
  });
  const { data: addresses } = useQuery({
    queryKey: ["addresses", session?.user.id],
    enabled: !!session,
    queryFn: async () => (await supabase.from("addresses").select("*").order("is_default", { ascending: false })).data ?? [],
  });
  const ord = settings?.ordering ?? {};
  const timing = settings?.timing ?? {};
  const loc = settings?.location ?? {};
  const closed = timing.temporarily_closed === true || timing.orders_enabled === false;

  // The ordering type chosen on Order Now / the menu carries through to here.
  useEffect(() => {
    if (reservation) setFulfillment("dine_in");
    else if (type) setFulfillment(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation, type]);
  const ful: Fulfillment = reservation ? "dine_in" : fulfillment ?? type ?? "delivery";
  const setFul = (k: Fulfillment) => setFulfillment(k);

  const [f, setF] = useState({ customer_name: "", phone: "", address: "", delivery_notes: "", table_number: "", promo: "", reward: "", notes: "" });
  const [pickupAt, setPickupAt] = useState(""); // "" = earliest available
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [promoApplied, setPromoApplied] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [qErr, setQErr] = useState("");
  const [busy, setBusy] = useState(false);
  // Which saved address is used ("new" = typing a new one; it is saved to the account after ordering).
  const [addrChoice, setAddrChoice] = useState<string>("");
  // One id per checkout attempt: a double-click or a retry after a network hiccup returns the same order instead of a duplicate.
  const requestId = useRef<string>(newRequestId());

  useEffect(() => {
    if (profile) setF((x) => ({ ...x, customer_name: x.customer_name || profile.full_name || "", phone: x.phone || profile.phone || "" }));
  }, [profile]);
  useEffect(() => {
    if (!addresses || addrChoice) return;
    const d = addresses[0];
    if (d) pickSaved(d);
    else setAddrChoice("new");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses]);
  // Guests: details from the last order on this device fill in automatically.
  useEffect(() => {
    if (session) return;
    const saved = loadDetails();
    if (!saved) return;
    setF((x) => ({ ...x, customer_name: x.customer_name || saved.customer_name || "", phone: x.phone || saved.phone || "", address: x.address || saved.address || "", delivery_notes: x.delivery_notes || saved.delivery_notes || "" }));
    if (!zoneId && saved.zone_id) setZoneId(saved.zone_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function pickSaved(a: { id: string; address_line: string; building: string | null; floor: string | null; apartment: string | null; zone_id: string | null; notes?: string | null }) {
    setAddrChoice(a.id);
    setF((x) => ({ ...x, address: addressText(a), delivery_notes: x.delivery_notes || a.notes || "" }));
    if (a.zone_id) setZoneId(a.zone_id);
  }
  function pickNew() {
    setAddrChoice("new");
    setF((x) => ({ ...x, address: "" }));
  }

  const items = useMemo(() => cartPayload(lines), [lines]);

  // Pickup times come from the server: kitchen time, minimum notice, opening hours and slot capacity.
  const { data: slots } = useQuery({
    queryKey: ["pickup-slots", items],
    enabled: ful === "pickup" && items.length > 0,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pickup_slots", { _items: items });
      if (error) throw error;
      return data as unknown as Slots;
    },
  });
  useEffect(() => {
    if (pickupAt && slots && !slots.slots.includes(pickupAt)) setPickupAt("");
  }, [slots, pickupAt]);
  const pickupTime = ful === "pickup" ? pickupAt || slots?.earliest || "" : "";

  const payload = () => ({
    request_id: requestId.current,
    fulfillment: ful,
    items,
    zone_id: ful === "delivery" ? zoneId : "",
    address: f.address,
    delivery_notes: f.delivery_notes,
    lat: ful === "delivery" && coords ? String(coords.lat) : "",
    lng: ful === "delivery" && coords ? String(coords.lng) : "",
    customer_name: f.customer_name,
    phone: f.phone,
    scheduled_for: pickupTime,
    reservation_id: ful === "dine_in" ? reservation ?? "" : "",
    table_number: f.table_number,
    promo_code: promoApplied,
    reward_tier_id: f.reward,
    payment_method: "cash",
    notes: f.notes,
  });

  useEffect(() => {
    if (!lines.length) return;
    let live = true;
    const t = setTimeout(async () => {
      const { data, error } = await supabase.rpc("quote_order", { _p: payload() });
      if (!live) return;
      if (error) { setQErr(error.message); setQuote(null); }
      else { setQErr(""); setQuote(data as unknown as Quote); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, ful, zoneId, promoApplied, f.reward, pickupTime]);

  if (!lines.length)
    return (
      <PageShell title="Checkout">
        <p className="rounded-3xl bg-card p-8 text-center">Your cart is empty. <Link to="/menu" className="font-bold underline">Browse the menu</Link></p>
      </PageShell>
    );

  const missing = [
    !f.customer_name.trim() && "your name",
    f.phone.replace(/\D/g, "").length < 8 && "a mobile number",
    ful === "delivery" && !zoneId && "your area",
    ful === "delivery" && !f.address.trim() && "your address",
    ful === "pickup" && !pickupTime && "a pickup time",
  ].filter(Boolean) as string[];

  const place = async () => {
    if (busy) return;
    if (missing.length) return toast.error(`Please add ${missing.join(", ")}.`);
    setBusy(true);
    const { data, error } = await supabase.rpc("place_order", { _p: payload() });
    if (error) {
      setBusy(false);
      return toast.error(errMsg(error));
    }
    const r = data as { id: string; order_number: string; tracking_token: string };
    await rememberCustomer();
    rememberOrder({ token: r.tracking_token, number: r.order_number, at: new Date().toISOString() });
    clear();
    try { sessionStorage.removeItem("pz-reservation"); } catch {}
    navigate({ to: "/track/$token", params: { token: r.tracking_token }, search: { placed: true }, replace: true });
  };

  // Save name, phone and a new delivery address so next time nothing needs typing again.
  const rememberCustomer = async () => {
    const name = f.customer_name.trim(), phone = f.phone.trim(), address = f.address.trim();
    saveDetails({ customer_name: name, phone, address: ful === "delivery" ? address : loadDetails()?.address ?? "", zone_id: ful === "delivery" ? zoneId : loadDetails()?.zone_id ?? "", delivery_notes: f.delivery_notes.trim() });
    if (!session) return;
    try {
      const uid = session.user.id;
      const patch: { full_name?: string; phone?: string } = {};
      if (name && name !== (profile?.full_name ?? "")) patch.full_name = name;
      if (phone && phone !== (profile?.phone ?? "")) patch.phone = phone;
      if (Object.keys(patch).length) await supabase.from("profiles").update(patch).eq("id", uid);
      const known = (addresses ?? []).some((a) => addressText(a).trim().toLowerCase() === address.toLowerCase());
      if (ful === "delivery" && address && !known) {
        const n = addresses?.length ?? 0;
        await supabase.from("addresses").insert({
          user_id: uid,
          label: n === 0 ? "Home" : `Address ${n + 1}`,
          address_line: address,
          zone_id: zoneId || null,
          notes: f.delivery_notes.trim() || null,
          is_default: n === 0,
        });
      }
      qc.invalidateQueries({ queryKey: ["addresses", uid] });
      qc.invalidateQueries({ queryKey: ["profile", uid] });
    } catch {
      // Saving details is a convenience; the order itself is already placed.
    }
  };

  const locate = () => {
    if (!navigator.geolocation) return toast.error("Your browser can't share location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setCoords({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) }); setLocating(false); },
      () => { setLocating(false); toast.error("We couldn't get your location. You can still type your address."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const opts = (
    [
      { k: "delivery", l: "Delivery", icon: Bike, on: ord.delivery_enabled !== false && !reservation },
      { k: "pickup", l: "Pickup", icon: ShoppingBag, on: ord.pickup_enabled !== false && !reservation },
      { k: "dine_in", l: "Dine-in", icon: UtensilsCrossed, on: ord.dine_in_enabled !== false || !!reservation },
    ] as const
  ).filter((o) => o.on);

  const slotsByDay = (slots?.slots ?? []).reduce<Record<string, string[]>>((acc, s) => {
    const day = fmtDayTime(s).split(",")[0];
    (acc[day] ||= []).push(s);
    return acc;
  }, {});

  return (
    <PageShell title="Checkout">
      {closed && (
        <p className="mb-6 rounded-2xl bg-destructive/10 p-4 font-bold text-destructive">
          {timing.temporarily_closed ? timing.closed_message || "We're temporarily closed. Please check back soon." : "Online ordering is paused right now."}
        </p>
      )}
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-2">
            {opts.map((o) => (
              <button key={o.k} onClick={() => setFul(o.k)} className={`flex flex-col items-center gap-1 rounded-2xl py-4 font-extrabold ring-1 ${ful === o.k ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border"}`}>
                <o.icon className="h-5 w-5" /> {o.l}
              </button>
            ))}
          </div>
          {reservation && <button className="text-sm underline" onClick={() => { try { sessionStorage.removeItem("pz-reservation"); } catch {} navigate({ to: "/checkout", search: {} }); setFul("delivery"); }}>Not a table pre-order? Switch to delivery or pickup</button>}
          {opts.length === 0 && <p className="rounded-2xl bg-card p-4">Online ordering is paused right now.</p>}

          <section className="space-y-4 rounded-3xl bg-card p-6 ring-1 ring-border">
            <h2 className="text-xl text-primary">Your details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="co-name">Name</Label><Input id="co-name" autoComplete="name" value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} /></div>
              <div><Label htmlFor="co-phone">Mobile</Label><Input id="co-phone" type="tel" autoComplete="tel" placeholder="01x xxxx xxxx" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            </div>
            {!session && <p className="text-sm text-muted-foreground">No account needed. <Link to="/auth" className="font-bold underline">Sign in</Link> to earn PANZUTTI Club points.</p>}
          </section>

          {ful === "delivery" && (
            <section className="space-y-4 rounded-3xl bg-card p-6 ring-1 ring-border">
              <h2 className="text-xl text-primary">Delivery address</h2>
              {zones && zones.length === 0 && <p className="text-sm text-destructive">Delivery areas haven't been set up yet — please choose pickup for now.</p>}
              <div>
                <Label htmlFor="co-zone">Area</Label>
                <select id="co-zone" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                  <option value="">Choose your area</option>
                  {zones?.map((z) => <option key={z.id} value={z.id}>{z.name} — {egp(z.fee)}{Number(z.min_order) > 0 ? ` · min ${egp(z.min_order)}` : ""}</option>)}
                </select>
              </div>
              {addresses && addresses.length > 0 && (
                <div role="radiogroup" aria-label="Saved addresses" className="space-y-2">
                  {addresses.map((a) => (
                    <label key={a.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-1 ${addrChoice === a.id ? "bg-primary/5 ring-2 ring-primary" : "ring-border"}`}>
                      <input type="radio" name="addr" className="mt-1" checked={addrChoice === a.id} onChange={() => pickSaved(a)} />
                      <span className="text-sm"><b className="block">{a.label}</b>{addressText(a)}{zones?.find((z) => z.id === a.zone_id) && <span className="block text-muted-foreground">{zones.find((z) => z.id === a.zone_id)!.name}</span>}</span>
                    </label>
                  ))}
                  <label className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 ring-1 ${addrChoice === "new" ? "bg-primary/5 ring-2 ring-primary" : "ring-border"}`}>
                    <input type="radio" name="addr" checked={addrChoice === "new"} onChange={pickNew} />
                    <span className="text-sm font-bold">+ Deliver to a new address</span>
                  </label>
                </div>
              )}
              {(addrChoice === "new" || !addresses?.length) && (
                <div>
                  <Label htmlFor="co-addr">Street, building, floor, apartment</Label>
                  <Textarea id="co-addr" autoComplete="street-address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
                  <p className="mt-0.5 text-xs text-muted-foreground">{session ? "We'll save it to your account for next time." : "We'll remember it on this device for next time."}</p>
                </div>
              )}
              <div><Label htmlFor="co-dn">Directions for the driver (optional)</Label><Input id="co-dn" placeholder="Landmark, gate, ring the bell…" maxLength={200} value={f.delivery_notes} onChange={(e) => setF({ ...f, delivery_notes: e.target.value })} /></div>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={locate} disabled={locating} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ring-1 ring-border disabled:opacity-50">
                  <LocateFixed className="h-4 w-4" /> {locating ? "Getting location…" : coords ? "Location pinned — update" : "Share my exact location (optional)"}
                </button>
                {coords && (
                  <>
                    <a className="text-sm underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`}>Check pin on Google Maps</a>
                    <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setCoords(null)}>Remove</button>
                  </>
                )}
              </div>
            </section>
          )}

          {ful === "pickup" && (
            <section className="space-y-3 rounded-3xl bg-card p-6 ring-1 ring-border">
              <h2 className="text-xl text-primary">Pickup time</h2>
              <p>Collect from <b>{loc.address}</b></p>
              {!slots ? (
                <p className="text-sm text-muted-foreground">Finding available times…</p>
              ) : slots.slots.length === 0 ? (
                <p className="text-sm text-destructive">No pickup times are available right now. Please try delivery or call us.</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Your order takes about {slots.prep_minutes} min to prepare. The earliest pickup is <b>{fmtDayTime(slots.earliest)}</b>.</p>
                  <select aria-label="Pickup time" className="w-full rounded-md border border-input bg-background px-3 py-2" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)}>
                    <option value="">As soon as possible — {fmtDayTime(slots.earliest)}</option>
                    {Object.entries(slotsByDay).map(([day, list]) => (
                      <optgroup key={day} label={day}>
                        {list.map((s) => <option key={s} value={s}>{fmtTime(s)}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </>
              )}
            </section>
          )}

          {ful === "dine_in" && (
            <section className="space-y-3 rounded-3xl bg-card p-6 ring-1 ring-border">
              <h2 className="text-xl text-primary">{reservation ? "Table pre-order" : "Dine-in"}</h2>
              {reservation ? (
                <p>Your food will be prepared for your reservation time. If your reservation is not confirmed, the pre-order is cancelled too.</p>
              ) : (
                <>
                  <p>Order from your table at <b>{loc.address || "PANZUTTI"}</b>. We'll start as soon as the order is confirmed.</p>
                  <div className="max-w-xs"><Label htmlFor="co-table">Table number (optional)</Label><Input id="co-table" maxLength={10} value={f.table_number} onChange={(e) => setF({ ...f, table_number: e.target.value })} /></div>
                </>
              )}
            </section>
          )}

          <section className="space-y-4 rounded-3xl bg-card p-6 ring-1 ring-border">
            <h2 className="text-xl text-primary">Savings</h2>
            <div className="flex gap-2">
              <Input placeholder="Promo code" value={f.promo} onChange={(e) => setF({ ...f, promo: e.target.value })} />
              {promoApplied ? (
                <button className="rounded-full px-4 font-bold ring-1 ring-border" onClick={() => { setPromoApplied(""); setF({ ...f, promo: "" }); }}>Remove</button>
              ) : (
                <button className="rounded-full bg-accent px-4 font-bold" onClick={() => setPromoApplied(f.promo.trim())}>Apply</button>
              )}
            </div>
            {session && (
              <div>
                <p className="mb-2 font-bold">PANZUTTI Club reward {quote && <span className="font-normal text-muted-foreground">· you have {quote.points_balance.toLocaleString()} pts</span>}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setF({ ...f, reward: "" })} className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${!f.reward ? "bg-primary text-primary-foreground" : "ring-border"}`}>None</button>
                  {tiers?.map((t) => {
                    const ok = (quote?.points_balance ?? 0) >= t.points;
                    return (
                      <button key={t.id} disabled={!ok} onClick={() => setF({ ...f, reward: t.id })} className={`rounded-full px-4 py-2 text-sm font-bold ring-1 disabled:opacity-40 ${f.reward === t.id ? "bg-primary text-primary-foreground" : "ring-border"}`}>
                        {t.points.toLocaleString()} pts → {egp(t.discount)} off
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-card p-6 ring-1 ring-border">
            <h2 className="text-xl text-primary">Payment</h2>
            <p className="mt-2 font-bold">Cash — {ful === "delivery" ? "pay the driver when your order arrives" : "pay at the restaurant"}</p>
            <p className="text-sm text-muted-foreground">Online card payment is coming soon.</p>
            <Label htmlFor="co-notes" className="mt-4 block">Order notes (optional)</Label>
            <Textarea id="co-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={300} placeholder="Allergies or anything the kitchen should know" />
          </section>
        </div>

        <aside className="h-fit space-y-2 rounded-3xl bg-primary p-6 text-primary-foreground lg:sticky lg:top-24">
          <h2 className="mb-4 text-2xl">Review</h2>
          {lines.map((l) => (
            <div key={l.key} className="text-sm">
              <div className="flex justify-between gap-2"><span>{l.quantity}× {l.name}</span><span>{egp(lineUnit(l) * l.quantity)}</span></div>
              {l.options.length > 0 && <p className="opacity-70">{l.options.map((o) => o.name).join(" · ")}</p>}
              {l.notes && <p className="italic opacity-70">“{l.notes}”</p>}
            </div>
          ))}
          <hr className="my-3 border-primary-foreground/20" />
          {quote ? (
            <>
              <Row l="Subtotal" v={egp(quote.subtotal)} />
              {quote.promo_discount > 0 && <Row l="Promo" v={`− ${egp(quote.promo_discount)}`} />}
              {quote.reward_discount > 0 && <Row l="Club reward" v={`− ${egp(quote.reward_discount)}`} />}
              {ful === "delivery" && <Row l="Delivery fee" v={egp(quote.delivery_fee)} />}
              <div className="flex justify-between pt-2 text-2xl font-extrabold"><span>Total</span><span>{egp(quote.total)}</span></div>
              <p className="text-sm opacity-80">Cash · {ful === "delivery" ? "on delivery" : "at the restaurant"}</p>

              <div className="mt-3 space-y-1 rounded-2xl bg-primary-foreground/10 p-3 text-sm">
                <p className="flex items-center gap-2 font-bold"><Clock className="h-4 w-4" /> Timing</p>
                {ful === "delivery" ? (
                  <>
                    <Row l="Kitchen" v={`~${quote.prep_minutes} min`} />
                    <Row l="Dispatch" v={`~${quote.dispatch_buffer_minutes} min`} />
                    <Row l="Delivery" v={`~${quote.delivery_minutes ?? 0} min`} />
                    <p className="pt-1 font-extrabold text-brand-yellow">Arrives around {fmtTime(quote.delivery_at)}</p>
                  </>
                ) : ful === "pickup" ? (
                  <p className="font-extrabold text-brand-yellow">Ready for pickup {fmtDayTime(quote.ready_at)}</p>
                ) : (
                  <p className="font-extrabold text-brand-yellow">Ready around {fmtTime(quote.ready_at)} (~{quote.prep_minutes} min)</p>
                )}
                <p className="text-xs opacity-70">Estimates; the restaurant confirms and you'll see any change on your tracking page.</p>
              </div>

              {session && quote.points_to_earn > 0 && <p className="text-sm text-brand-yellow">You'll earn {quote.points_to_earn.toLocaleString()} points when this order is completed.</p>}
            </>
          ) : (
            <p className="text-sm text-brand-yellow">{qErr || "Calculating…"}</p>
          )}
          <button disabled={busy || !quote || opts.length === 0 || closed} onClick={place} className="mt-4 w-full rounded-full bg-brand-yellow py-4 font-extrabold text-foreground disabled:opacity-50">
            {busy ? "Confirming…" : quote ? `Confirm order · ${egp(quote.total)}` : "Confirm order"}
          </button>
          {missing.length > 0 && quote && <p className="text-center text-xs opacity-80">Still needed: {missing.join(", ")}</p>}
        </aside>
      </div>

      {/* Phones: total and confirm always within reach */}
      <div className="h-20 lg:hidden" />
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <button disabled={busy || !quote || opts.length === 0 || closed} onClick={place} className="flex w-full items-center justify-between rounded-full bg-brand-red px-5 py-3.5 font-extrabold text-brand-cream disabled:opacity-50">
          <span>{busy ? "Confirming…" : "Confirm order"}</span>
          <span>{quote ? egp(quote.total) : qErr ? "—" : "…"}</span>
        </button>
        {missing.length > 0 && quote && <p className="mt-1 text-center text-xs text-muted-foreground">Still needed: {missing.join(", ")}</p>}
      </div>
    </PageShell>
  );
}

const Row = ({ l, v }: { l: string; v: string }) => <div className="flex justify-between"><span className="opacity-80">{l}</span><span className="font-bold">{v}</span></div>;
