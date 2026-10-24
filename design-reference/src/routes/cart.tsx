import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, Trash2, Pencil } from "lucide-react";
import { useCart, lineUnit } from "@/lib/cart";
import { zonesQuery } from "@/lib/data";
import { egp } from "@/lib/format";
import { Mascot, PageShell } from "@/components/brand";
import { PhotoPlaceholder } from "@/components/product-card";
import { OrderTypeBar, FUL_OPTIONS } from "@/components/order-bar";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your cart — PANZUTTI" },
      { name: "description", content: "Review your PANZUTTI order before checkout." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Your cart — PANZUTTI" },
      { property: "og:description", content: "Review your PANZUTTI order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const { lines, update, remove, subtotal, fulfillment, zoneId, setZoneId } = useCart();
  const { data: zones } = useQuery(zonesQuery);
  const zone = zones?.find((z) => z.id === zoneId);
  const typeLabel = FUL_OPTIONS.find((o) => o.k === fulfillment)?.l;
  const fee = fulfillment === "delivery" && zone ? Number(zone.fee) : 0;
  const belowMin = fulfillment === "delivery" && zone && subtotal < Number(zone.min_order);

  if (!lines.length)
    return (
      <PageShell title="Your cart">
        <OrderTypeBar className="mb-6" />
        <div className="flex flex-col items-center rounded-3xl bg-card p-10 text-center">
          <Mascot pose="empty" className="mb-6 h-44 w-36" label="Mascot · empty cart" />
          <p className="text-xl font-bold">Your cart is hungry.</p>
          <p className="mt-1 text-muted-foreground">Add a panuozzo or two to get started.</p>
          <Link to="/menu" className="mt-6 rounded-full bg-primary px-7 py-3 font-extrabold text-primary-foreground">Browse the menu</Link>
        </div>
      </PageShell>
    );

  return (
    <PageShell title="Your cart">
      <OrderTypeBar className="mb-6" />
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div>
          <ul className="space-y-4">
            {lines.map((l) => {
              const unit = lineUnit(l);
              return (
                <li key={l.key} className="flex gap-4 rounded-3xl bg-card p-4 ring-1 ring-border">
                  <Link to="/menu/$slug" params={{ slug: l.slug }} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl">
                    {l.image_url ? <img src={l.image_url} alt={l.name} className="h-full w-full object-cover" /> : <PhotoPlaceholder className="h-full w-full" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <Link to="/menu/$slug" params={{ slug: l.slug }} className="font-display text-lg text-primary">{l.name}</Link>
                      <button onClick={() => remove(l.key)} aria-label={`Remove ${l.name}`} className="p-1"><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
                    </div>
                    {l.options.length > 0 && (
                      <ul className="text-sm text-muted-foreground">
                        {l.options.map((o) => (
                          <li key={o.id}>{o.group}: {o.name}{Number(o.price_delta) > 0 && ` (+${egp(o.price_delta)})`}</li>
                        ))}
                      </ul>
                    )}
                    {l.notes && <p className="text-sm italic text-muted-foreground">“{l.notes}”</p>}
                    <Link to="/menu/$slug" params={{ slug: l.slug }} search={{ edit: l.key }} className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-brand-red">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center rounded-full ring-1 ring-border">
                        <button className="p-2" onClick={() => (l.quantity > 1 ? update(l.key, { quantity: l.quantity - 1 }) : remove(l.key))} aria-label="One less"><Minus className="h-3 w-3" /></button>
                        <span className="w-6 text-center text-sm font-bold">{l.quantity}</span>
                        <button className="p-2" onClick={() => update(l.key, { quantity: Math.min(50, l.quantity + 1) })} aria-label="One more"><Plus className="h-3 w-3" /></button>
                      </div>
                      <div className="text-right">
                        <span className="block text-xs text-muted-foreground">{egp(unit)} each</span>
                        <span className="font-extrabold">{egp(unit * l.quantity)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link to="/menu" className="mt-4 inline-block font-bold text-primary underline">+ Add more from the menu</Link>
        </div>

        <aside className="h-fit space-y-2 rounded-3xl bg-primary p-6 text-primary-foreground lg:sticky lg:top-24">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-yellow">Your order: {typeLabel ?? "choose above"}</p>
          <div className="flex justify-between"><span className="opacity-80">Subtotal</span><span className="font-bold">{egp(subtotal)}</span></div>

          {fulfillment === "delivery" && (
            <div className="space-y-1">
              <label htmlFor="cart-zone" className="text-sm opacity-80">Delivery area</label>
              {zones && zones.length === 0 ? (
                <p className="text-sm text-brand-yellow">Delivery areas haven't been set up yet — please choose pickup or dine-in.</p>
              ) : (
                <select id="cart-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="w-full rounded-md bg-primary-foreground px-3 py-2 text-sm text-foreground">
                  <option value="">Choose your area</option>
                  {zones?.map((z) => <option key={z.id} value={z.id}>{z.name} — {egp(z.fee)}</option>)}
                </select>
              )}
              <div className="flex justify-between"><span className="opacity-80">Delivery fee</span><span className="font-bold">{zone ? egp(fee) : "—"}</span></div>
              {belowMin && <p className="text-sm text-brand-yellow">Minimum order for {zone!.name} is {egp(zone!.min_order)}.</p>}
            </div>
          )}

          <div className="flex justify-between border-t border-primary-foreground/20 pt-3 text-2xl font-extrabold"><span>Estimated total</span><span>{egp(subtotal + fee)}</span></div>
          <p className="text-xs opacity-80">Cash only. Prices, promo codes and Club rewards are confirmed at checkout.</p>

          {fulfillment ? (
            <Link
              to="/checkout"
              search={{ type: fulfillment, reservation: typeof window !== "undefined" ? sessionStorage.getItem("pz-reservation") ?? undefined : undefined }}
              className="mt-4 block rounded-full bg-brand-yellow py-4 text-center font-extrabold text-foreground"
            >
              Proceed to Checkout
            </Link>
          ) : (
            <p className="mt-4 rounded-2xl bg-primary-foreground/10 p-3 text-center text-sm font-bold">Choose Delivery, Pickup or Dine-in above to continue.</p>
          )}
        </aside>
      </div>

      {/* Phones: total and next step always within reach */}
      {fulfillment && (
        <>
          <div className="h-20 lg:hidden" />
          <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
            <Link
              to="/checkout"
              search={{ type: fulfillment, reservation: typeof window !== "undefined" ? sessionStorage.getItem("pz-reservation") ?? undefined : undefined }}
              className="flex w-full items-center justify-between rounded-full bg-brand-red px-5 py-3.5 font-extrabold text-brand-cream"
            >
              <span>Proceed to Checkout</span><span>{egp(subtotal + fee)}</span>
            </Link>
          </div>
        </>
      )}
    </PageShell>
  );
}
