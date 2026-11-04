import type { Branch } from "./data";

type Point = { lat: number; lng: number };

export type DeliveryQuote = {
  /** false until the branch has a location (or before the v8 SQL): fixed branch.delivery_fee */
  byDistance: boolean;
  /** piasters; 0 while needsPin */
  fee: number;
  km: number | null;
  needsPin: boolean;
  tooFar: boolean;
};

/** Straight-line km between two points. Same formula as public.distance_km (v8 SQL). */
export function distanceKm(a: Point, b: Point) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** Display estimate, same rule as place_order, which sets the real fee: base + per_km × every started km beyond the included ones. */
export function quoteDelivery(branch: Branch, pin: Point | null): DeliveryQuote {
  if (branch.latitude == null || branch.longitude == null) {
    return { byDistance: false, fee: branch.delivery_fee, km: null, needsPin: false, tooFar: false };
  }
  if (!pin) return { byDistance: true, fee: 0, km: null, needsPin: true, tooFar: false };
  const km = distanceKm({ lat: Number(branch.latitude), lng: Number(branch.longitude) }, pin);
  const billable = Math.ceil(Math.max(km - Number(branch.delivery_included_km ?? 0), 0));
  return {
    byDistance: true,
    fee: branch.delivery_fee + billable * Number(branch.delivery_per_km ?? 0),
    km,
    needsPin: false,
    tooFar: branch.delivery_max_km != null && km > Number(branch.delivery_max_km),
  };
}
