export const egp = (n: number | string | null | undefined) =>
  `EGP ${Number(n ?? 0).toLocaleString("en-EG", { maximumFractionDigits: 2 })}`;

export const statusLabel: Record<string, string> = {
  pending: "Received",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  driver_assigned: "Delivery assigned",
  picked_up: "Driver picked up",
  out_for_delivery: "On the way",
  delivered: "Delivered",
  collected: "Collected",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  rejected: "Rejected",
  no_show: "No-show",
};

export const fulfillmentLabel: Record<string, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  dine_in: "Dine-in",
};

/** The steps a customer sees for each order type, in order. */
export const orderSteps: Record<string, { s: string; l: string }[]> = {
  delivery: [
    { s: "pending", l: "Order received" },
    { s: "confirmed", l: "Confirmed" },
    { s: "preparing", l: "Preparing" },
    { s: "ready", l: "Ready for dispatch" },
    { s: "driver_assigned", l: "Delivery person assigned" },
    { s: "picked_up", l: "Picked up by driver" },
    { s: "out_for_delivery", l: "On the way" },
    { s: "delivered", l: "Delivered" },
    { s: "completed", l: "Completed" },
  ],
  pickup: [
    { s: "pending", l: "Order received" },
    { s: "confirmed", l: "Confirmed" },
    { s: "preparing", l: "Preparing" },
    { s: "ready", l: "Ready for pickup" },
    { s: "collected", l: "Collected" },
    { s: "completed", l: "Completed" },
  ],
  dine_in: [
    { s: "pending", l: "Order received" },
    { s: "confirmed", l: "Confirmed" },
    { s: "preparing", l: "Preparing" },
    { s: "ready", l: "Ready to enjoy" },
    { s: "completed", l: "Completed" },
  ],
};

/** Status label that reads right for the order type (e.g. "Ready for pickup"). */
export function stepLabel(fulfillment: string, status: string) {
  return orderSteps[fulfillment]?.find((x) => x.s === status)?.l ?? statusLabel[status] ?? status;
}

const TZ = "Africa/Cairo";
export const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-EG", { hour: "numeric", minute: "2-digit", timeZone: TZ }) : "";
export const fmtDayTime = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: TZ });
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 864e5);
  const label = day(d) === day(today) ? "Today" : day(d) === day(tomorrow) ? "Tomorrow" : d.toLocaleDateString("en-EG", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
  return `${label}, ${fmtTime(iso)}`;
};
export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }) : "";

/** Google Maps link from coordinates, a saved link, or an address. */
export function mapsLink(o: { lat?: number | string | null; lng?: number | string | null; map_url?: string | null; address?: string | null }) {
  if (o.lat && o.lng) return `https://www.google.com/maps/search/?api=1&query=${o.lat},${o.lng}`;
  if (o.map_url) return o.map_url;
  if (o.address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}`;
  return "";
}

export const telLink = (phone?: string | null) => (phone ? `tel:${phone.replace(/[^0-9+]/g, "")}` : "");

export function errMsg(e: unknown) {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return "Something went wrong";
}

export function slugify(s: string) {
  return s.toLowerCase().trim().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function newRequestId() {
  try {
    return crypto.randomUUID();
  } catch {
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
    );
  }
}

/** Guests find their recent orders through tracking links saved on this device. */
export type RecentOrder = { token: string; number: string; at: string };
const RECENT = "pz-recent-orders";
export function rememberOrder(o: RecentOrder) {
  try {
    const list: RecentOrder[] = JSON.parse(localStorage.getItem(RECENT) || "[]");
    localStorage.setItem(RECENT, JSON.stringify([o, ...list.filter((x) => x.token !== o.token)].slice(0, 5)));
  } catch {}
}
export function recentOrders(): RecentOrder[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) || "[]");
  } catch {
    return [];
  }
}

export type { Fulfillment } from "@/lib/cart";
