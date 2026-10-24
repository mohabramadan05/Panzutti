/**
 * The order this device just placed, kept in localStorage so the confirmation page survives a
 * reload and InstaPay customers can come back to upload their screenshot. The phone number is
 * needed by track_order / submit_payment_proof (guests prove ownership with it); it never goes in a URL.
 */

export type PlacedOrder = {
  order_id: string;
  order_number: number;
  status: string;
  payment_method: "cash" | "instapay";
  instapay_address: string | null;
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  total: number;
};

export type LastOrder = PlacedOrder & { phone: string; name: string; type: "pickup" | "delivery"; placed_at: string };

const KEY = "panzutti-last-order-v1";

export function saveLastOrder(order: Omit<LastOrder, "placed_at">) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...order, placed_at: new Date().toISOString() }));
  } catch {
    // storage blocked: the confirmation page falls back to "order not found on this device"
  }
}

export function readLastOrder(): LastOrder | null {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "null") as LastOrder | null;
  } catch {
    return null;
  }
}
