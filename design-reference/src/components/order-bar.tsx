import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bike, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { useCart, type Fulfillment } from "@/lib/cart";
import { settingsQuery } from "@/lib/data";
import { egp } from "@/lib/format";

export const FUL_OPTIONS: { k: Fulfillment; l: string; icon: typeof Bike }[] = [
  { k: "delivery", l: "Delivery", icon: Bike },
  { k: "pickup", l: "Pickup", icon: ShoppingBag },
  { k: "dine_in", l: "Dine-in", icon: UtensilsCrossed },
];

/** "Your order: Delivery" with a quick switch, shown on the menu and in the cart. */
export function OrderTypeBar({ className = "" }: { className?: string }) {
  const { fulfillment, setFulfillment } = useCart();
  const { data: s } = useQuery(settingsQuery);
  const ord = s?.ordering ?? {};
  const enabled = (k: Fulfillment) =>
    k === "delivery" ? ord.delivery_enabled !== false : k === "pickup" ? ord.pickup_enabled !== false : ord.dine_in_enabled !== false;
  const timing = s?.timing ?? {};
  const closed = timing.temporarily_closed === true || timing.orders_enabled === false;
  if (closed)
    return (
      <p className={`rounded-2xl bg-destructive/10 p-4 font-bold text-destructive ${className}`}>
        {timing.temporarily_closed ? timing.closed_message || "We're temporarily closed. Please check back soon." : "Online ordering is paused right now."}
      </p>
    );
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-2xl bg-card p-2 ring-1 ring-border ${className}`}>
      <span className="px-2 text-sm font-bold">Your order:</span>
      {FUL_OPTIONS.filter((o) => enabled(o.k)).map((o) => {
        const on = fulfillment === o.k;
        return (
          <button
            key={o.k}
            type="button"
            aria-pressed={on}
            onClick={() => setFulfillment(o.k)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold ${on ? "bg-primary text-primary-foreground" : "ring-1 ring-border hover:bg-muted"}`}
          >
            <o.icon className="h-4 w-4" /> {o.l}
          </button>
        );
      })}
      {!fulfillment && <span className="px-1 text-xs text-muted-foreground">Pick one — you can change it any time</span>}
    </div>
  );
}

/** Sticky "View cart" bar that updates as soon as something is added. */
export function CartBar() {
  const { count, subtotal, fulfillment } = useCart();
  if (!count) return null;
  const label = FUL_OPTIONS.find((o) => o.k === fulfillment)?.l;
  return (
    <div className="fixed inset-x-0 bottom-16 z-30 px-4 pb-3 md:bottom-0 md:pb-5">
      <Link
        to="/cart"
        className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-full bg-primary px-5 py-3.5 font-extrabold text-primary-foreground shadow-xl shadow-primary/30"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-brand-yellow px-1.5 text-sm text-foreground">{count}</span>
          View cart{label ? ` · ${label}` : ""}
        </span>
        <span>{egp(subtotal)}</span>
      </Link>
    </div>
  );
}
