"use client";

/**
 * Browser-only cart (by design there is no cart table). Saved to localStorage so it survives
 * reloads; every read/write is wrapped because storage can be blocked (private mode, etc.).
 * Prices here are a snapshot for display only — `place_order` recomputes everything server-side.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Addon, AddonGroup, MenuItem } from "./data";
import type { Catalog } from "./catalog";

export type OrderType = "pickup" | "delivery";

export type CartAddon = Pick<Addon, "id" | "name_en" | "name_ar" | "price"> & { group_id: string; quantity: number };

export type CartLine = {
  /** Same item + same add-ons + same note = same line (quantities merge). */
  key: string;
  item: Pick<MenuItem, "id" | "slug" | "name_en" | "name_ar" | "price" | "image_url">;
  addons: CartAddon[];
  quantity: number;
  note: string;
};

type CartState = { lines: CartLine[]; type: OrderType };

type CartContextValue = CartState & {
  /** false until localStorage has been read (avoid flashing "empty cart") */
  ready: boolean;
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "key">) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  setType: (type: OrderType) => void;
};

export const MAX_LINE_QUANTITY = 50; // same limit as place_order
const STORAGE_KEY = "panzutti-cart-v1";
const CartContext = createContext<CartContextValue | null>(null);

export const addonsTotal = (addons: CartAddon[]) => addons.reduce((sum, a) => sum + a.price * a.quantity, 0);
export const lineTotal = (l: Pick<CartLine, "item" | "addons" | "quantity">) => (l.item.price + addonsTotal(l.addons)) * l.quantity;

const lineKey = (l: Omit<CartLine, "key">) =>
  [l.item.id, ...l.addons.map((a) => `${a.id}x${a.quantity}`).sort(), l.note.trim().toLowerCase()].join("|");

/** `p_items` for place_order */
export const toOrderItems = (lines: CartLine[]) =>
  lines.map((l) => ({
    menu_item_id: l.item.id,
    quantity: l.quantity,
    note: l.note.trim() || null,
    addons: l.addons.map((a) => ({ addon_id: a.id, quantity: a.quantity })),
  }));

/** Which add-on groups still need a choice. Mirrors the checks in place_order. */
export function missingGroups(groups: AddonGroup[], picked: Record<string, number>) {
  return groups.filter((g) => g.addons.filter((a) => (picked[a.id] ?? 0) > 0).length < g.min_select);
}

function read(): CartState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lines: [], type: "delivery" };
    const parsed = JSON.parse(raw) as Partial<CartState>;
    return {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
      type: parsed.type === "pickup" ? "pickup" : "delivery",
    };
  } catch {
    return { lines: [], type: "delivery" };
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CartState>({ lines: [], type: "delivery" });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(read());
    setReady(true);
    // Keep tabs in sync
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage full or blocked: the cart still works for this page view
    }
  }, [state, ready]);

  const add = useCallback((line: Omit<CartLine, "key">) => {
    const key = lineKey(line);
    setState((s) => {
      const existing = s.lines.find((l) => l.key === key);
      const lines = existing
        ? s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(l.quantity + line.quantity, MAX_LINE_QUANTITY) } : l))
        : [...s.lines, { ...line, key }];
      return { ...s, lines };
    });
  }, []);

  const setQuantity = useCallback((key: string, quantity: number) => {
    setState((s) => ({
      ...s,
      lines:
        quantity <= 0
          ? s.lines.filter((l) => l.key !== key)
          : s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(quantity, MAX_LINE_QUANTITY) } : l)),
    }));
  }, []);

  const remove = useCallback((key: string) => setState((s) => ({ ...s, lines: s.lines.filter((l) => l.key !== key) })), []);
  const clear = useCallback(() => setState((s) => ({ ...s, lines: [] })), []);
  const setType = useCallback((type: OrderType) => setState((s) => ({ ...s, type })), []);

  const value = useMemo<CartContextValue>(
    () => ({
      ...state,
      ready,
      count: state.lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: state.lines.reduce((n, l) => n + lineTotal(l), 0),
      add,
      setQuantity,
      remove,
      clear,
      setType,
    }),
    [state, ready, add, setQuantity, remove, clear, setType],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}

/** Re-price a line from the live catalog. `available: false` when the item or an add-on can't be ordered. */
export function freshen(line: CartLine, catalog: Catalog | null): CartLine & { available: boolean } {
  if (!catalog) return { ...line, available: true };
  const entry = catalog[line.item.id];
  if (!entry || entry.sold) return { ...line, available: false };
  let available = true;
  const addons = line.addons.map((a) => {
    const live = entry.addons[a.id];
    if (!live || live.sold) available = false;
    return live ? { ...a, price: live.price } : a;
  });
  return { ...line, item: { ...line.item, price: entry.price }, addons, available };
}
