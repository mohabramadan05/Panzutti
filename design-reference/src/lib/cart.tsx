import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type CartOption = { id: string; group: string; name: string; price_delta: number };
export type CartLine = {
  key: string;
  product_id: string;
  slug: string;
  name: string;
  image_url: string | null;
  base_price: number;
  options: CartOption[];
  quantity: number;
  notes?: string;
};

export type Fulfillment = "delivery" | "pickup" | "dine_in";

type Ctx = {
  lines: CartLine[];
  /** How the customer wants this order (chosen on Order Now), kept for the whole visit. */
  fulfillment: Fulfillment | null;
  setFulfillment: (f: Fulfillment) => void;
  /** Delivery area picked in the cart, reused at checkout. */
  zoneId: string;
  setZoneId: (id: string) => void;
  count: number;
  subtotal: number;
  add: (l: Omit<CartLine, "key">) => void;
  update: (key: string, patch: Partial<CartLine>) => void;
  remove: (key: string) => void;
  /** Swap a line for an edited version (new options, quantity or notes). */
  replace: (key: string, l: Omit<CartLine, "key">) => void;
  clear: () => void;
};
const CartCtx = createContext<Ctx | null>(null);
const KEY = "panzutti-cart-v1";
const FUL_KEY = "pz-fulfillment";
const ZONE_KEY = "pz-zone";
const isFul = (v: unknown): v is Fulfillment => v === "delivery" || v === "pickup" || v === "dine_in";
const sigOf = (l: Omit<CartLine, "key">) => l.product_id + ":" + l.options.map((o) => o.id).sort().join(",") + ":" + (l.notes ?? "");
const merge = (prev: CartLine[], l: Omit<CartLine, "key">) => {
  const sig = sigOf(l);
  const ex = prev.find((p) => p.key === sig);
  if (ex) return prev.map((p) => (p.key === sig ? { ...p, quantity: Math.min(50, p.quantity + l.quantity) } : p));
  return [...prev, { ...l, key: sig }];
};

export const lineUnit = (l: CartLine) => l.base_price + l.options.reduce((s, o) => s + Number(o.price_delta), 0);

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [fulfillment, setFul] = useState<Fulfillment | null>(null);
  const [zoneId, setZone] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setLines(JSON.parse(localStorage.getItem(KEY) || "[]"));
      const f = localStorage.getItem(FUL_KEY);
      if (isFul(f)) setFul(f);
      setZone(localStorage.getItem(ZONE_KEY) || "");
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch {}
  }, [lines, ready]);
  // Keep tabs in step: adding in one tab shows up in another.
  useEffect(() => {
    const on = (e: StorageEvent) => {
      try {
        if (e.key === KEY) setLines(JSON.parse(e.newValue || "[]"));
        if (e.key === FUL_KEY && isFul(e.newValue)) setFul(e.newValue);
        if (e.key === ZONE_KEY) setZone(e.newValue || "");
      } catch {}
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);
  const setFulfillment = (f: Fulfillment) => {
    setFul(f);
    try { localStorage.setItem(FUL_KEY, f); } catch {}
  };
  const setZoneId = (id: string) => {
    setZone(id);
    try { localStorage.setItem(ZONE_KEY, id); } catch {}
  };

  const value: Ctx = {
    lines,
    fulfillment,
    setFulfillment,
    zoneId,
    setZoneId,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: lines.reduce((s, l) => s + lineUnit(l) * l.quantity, 0),
    add: (l) => setLines((prev) => merge(prev, l)),
    replace: (key, l) =>
      setLines((prev) => {
        const i = prev.findIndex((p) => p.key === key);
        const rest = prev.filter((p) => p.key !== key);
        const sig = sigOf(l);
        if (rest.some((p) => p.key === sig) || i < 0) return merge(rest, l);
        const next = [...rest];
        next.splice(i, 0, { ...l, key: sig });
        return next;
      }),
    update: (key, patch) => setLines((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p))),
    remove: (key) => setLines((prev) => prev.filter((p) => p.key !== key)),
    clear: () => setLines([]),
  };
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const c = useContext(CartCtx);
  if (!c) throw new Error("useCart outside provider");
  return c;
}

export const cartPayload = (lines: CartLine[]) =>
  lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, option_ids: l.options.map((o) => o.id), notes: l.notes }));
