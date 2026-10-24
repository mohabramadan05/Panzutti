import type { Locale } from "./i18n";

/** Prices are stored in piasters (1 EGP = 100). */
export function egp(piasters: number, locale: Locale) {
  const value = (piasters ?? 0) / 100;
  const n = new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-EG", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
  return locale === "ar" ? `${n} ج.م` : `EGP ${n}`;
}

/** "02:00:00" -> "2:00 AM" / "٢:٠٠ ص" */
export function timeLabel(t: string, locale: Locale) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return d.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
}

export const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

/** Same rules as the DB's normalize_phone(): 01xxxxxxxxx → +201xxxxxxxxx, 00… → +…; null if invalid. */
export function normalizePhone(input: string) {
  let d = input.replace(/[^0-9+]/g, "");
  if (d.startsWith("00")) d = `+${d.slice(2)}`;
  if (/^0[0-9]{10}$/.test(d)) d = `+20${d.slice(1)}`;
  else if (!d.startsWith("+")) d = `+${d}`;
  return /^\+[0-9]{8,15}$/.test(d) ? d : null;
}
