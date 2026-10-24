/**
 * Table reservations: time slots inside the branch hours, and Cairo wall-clock → UTC.
 * place_order (v4) checks again: 15 minutes – 30 days ahead, branch open at that time.
 */
import type { Branch } from "./data";

export const SLOT_MINUTES = 30;
export const MAX_DAYS_AHEAD = 29; // server allows 30 days; one day of margin for late slots
export const MAX_GUESTS = 30;
const LEAD_MINUTES = 30; // a little more than the server's 15 so a slow form never fails

/** What the guest picked. `slot` = minutes after midnight of `date`; ≥ 1440 means after midnight (next calendar day). */
export type ReservationPick = { date: string; slot: number; guests: number };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h % 24) * 60 + m;
};

/** Minutes offset of `tz` from UTC at instant `ts` (e.g. +180 for Cairo in summer). */
function tzOffset(ts: number, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ts));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((asUtc - Math.floor(ts / 60000) * 60000) / 60000);
}

/** "2026-10-30" + slot minutes in the branch's timezone → Date (UTC instant). */
export function slotToDate(date: string, slot: number, tz: string) {
  const [y, m, d] = date.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d) + slot * 60000;
  let ts = wall - tzOffset(wall, tz) * 60000;
  const again = tzOffset(ts, tz); // DST edge: re-check with the real instant
  ts = wall - again * 60000;
  return new Date(ts);
}

/** Today's date ("YYYY-MM-DD") in the branch timezone, plus `addDays`. */
export function localDate(tz: string, addDays = 0, now = Date.now()) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  if (!addDays) return d;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day + addDays)).toISOString().slice(0, 10);
}

/** Bookable slots for one day: opening time → one hour before closing (closing after midnight is handled). */
export function slotsFor(date: string, branch: Pick<Branch, "opens_at" | "closes_at" | "timezone">, now = Date.now()) {
  const open = toMin(branch.opens_at);
  let close = toMin(branch.closes_at);
  if (close <= open) close += 1440; // closes after midnight
  const out: number[] = [];
  for (let s = Math.ceil(open / SLOT_MINUTES) * SLOT_MINUTES; s <= close - 60; s += SLOT_MINUTES) {
    if (slotToDate(date, s, branch.timezone).getTime() >= now + LEAD_MINUTES * 60000) out.push(s);
  }
  return out;
}

/** "7:30 PM" / "٧:٣٠ م" for a slot. */
export function slotLabel(slot: number, locale: "en" | "ar") {
  const m = slot % 1440;
  return new Date(Date.UTC(2000, 0, 1, Math.floor(m / 60), m % 60)).toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** "Fri 30 Oct" style label for a date string. */
export function dateLabel(date: string, locale: "en" | "ar") {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Is a saved pick still bookable? */
export function isPickValid(p: ReservationPick | null, branch: Pick<Branch, "opens_at" | "closes_at" | "timezone">) {
  if (!p || p.guests < 1 || p.guests > MAX_GUESTS) return false;
  if (p.date < localDate(branch.timezone) || p.date > localDate(branch.timezone, MAX_DAYS_AHEAD)) return false;
  return slotsFor(p.date, branch).includes(p.slot);
}
