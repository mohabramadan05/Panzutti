"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { OrderStatus } from "./order-status";
import type { Dictionary, Locale } from "@/lib/i18n";
import { readLastOrder } from "@/lib/last-order";
import { supabase } from "@/lib/supabase";
import { egp, normalizePhone } from "@/lib/format";
import { cn } from "@/lib/utils";

type Found = {
  order_number: number;
  status: keyof Dictionary["order"]["statuses"];
  type: "pickup" | "delivery";
  payment_method: "cash" | "instapay";
  payment_status: "paid" | "unpaid";
  total: number;
  created_at: string;
  is_reservation?: boolean; // v4
  scheduled_for?: string | null;
};

const CUSTOMER_KEY = "panzutti-customer-v1"; // same key the checkout uses

/**
 * Phone number only → find_orders_by_phone (recent orders + upcoming reservations, no names/addresses/items).
 * One order → its live status straight away (track_order); several → the list, tap one for its status.
 * The phone stays in component state only — never in the URL.
 */
export function TrackOrder({ locale, t, tOrder }: { locale: Locale; t: Dictionary["track"]; tOrder: Dictionary["order"] }) {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Found[] | null>(null);
  const [selected, setSelected] = useState<{ number: number; phone: string } | null>(null);
  const [searchedPhone, setSearchedPhone] = useState("");
  const Chevron = locale === "ar" ? ChevronLeft : ChevronRight;

  // Returning customers: prefill the phone they ordered with on this device
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CUSTOMER_KEY) ?? "null") as { phone?: string } | null;
      const last = readLastOrder();
      const p = saved?.phone || last?.phone?.replace(/^\+20/, "0");
      if (p) setPhone(p);
    } catch {
      // nothing saved
    }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const p = normalizePhone(phone);
    if (!p) return setError(t.phoneInvalid);
    if (!supabase) return;
    setBusy(true);
    const { data, error: err } = await supabase.rpc("find_orders_by_phone", { p_phone: p });
    setBusy(false);
    if (err) return setError(err.message);
    const found = (data ?? []) as Found[];
    setSearchedPhone(p);
    setResults(found);
    if (found.length === 1) setSelected({ number: found[0].order_number, phone: p });
  };

  if (selected)
    return (
      <OrderStatus
        locale={locale}
        t={tOrder}
        orderNumber={selected.number}
        phone={selected.phone}
        onBack={() => {
          setSelected(null);
          if ((results?.length ?? 0) <= 1) setResults(null);
        }}
        backLabel={(results?.length ?? 0) > 1 ? t.allOrders : t.find}
      />
    );

  const time = (iso: string) =>
    new Date(iso).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" });

  return (
    <div className="mx-auto max-w-2xl">
      <form onSubmit={submit} noValidate className="space-y-4 rounded-[2rem] bg-card p-6 ring-1 ring-border md:p-8">
        <p className="text-muted-foreground">{t.subtitle}</p>
        <div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">{t.phone}</span>
            <input
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setError("");
              }}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="01012345678"
              aria-invalid={!!error}
              className={cn(
                "h-12 w-full rounded-2xl bg-background px-4 ring-1 outline-none focus:ring-2 focus:ring-primary",
                error ? "ring-2 ring-brand-red" : "ring-border",
              )}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm font-bold text-brand-red">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-extrabold text-primary-foreground transition hover:brightness-110 disabled:opacity-50 sm:w-auto"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
          {busy ? t.searching : t.find}
        </button>
      </form>

      {results && (
        <section className="mt-8" aria-live="polite">
          <h2 className="text-2xl text-primary">{t.recent.replace("{n}", String(results.length))}</h2>
          {results.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-card px-5 py-4 text-muted-foreground ring-1 ring-border">{t.none}</p>
          ) : (
            <ul className="mt-4 divide-y divide-border overflow-hidden rounded-[2rem] bg-card ring-1 ring-border">
              {results.map((o) => {
                const awaitingPayment = o.payment_method === "instapay" && o.payment_status === "unpaid" && o.status !== "cancelled" && o.status !== "completed";
                return (
                  <li key={o.order_number}>
                    <button
                      type="button"
                      onClick={() => setSelected({ number: o.order_number, phone: searchedPhone })}
                      className="flex w-full items-center gap-4 px-5 py-4 text-start transition hover:bg-muted/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-xl text-primary">#{o.order_number}</span>
                          {o.is_reservation && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-yellow px-2.5 py-0.5 text-xs font-extrabold text-foreground">
                              <CalendarDays className="h-3 w-3" aria-hidden /> {t.reservation}
                            </span>
                          )}
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-0.5 text-xs font-bold",
                              o.status === "cancelled" ? "bg-muted text-muted-foreground" : o.status === "completed" ? "bg-primary/10 text-primary" : "bg-brand-red/10 text-brand-red",
                            )}
                          >
                            {tOrder.statuses[o.status]}
                          </span>
                          {awaitingPayment ? (
                            <span className="rounded-full bg-brand-red px-2.5 py-0.5 text-xs font-extrabold text-brand-cream">{t.payNow}</span>
                          ) : (
                            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">
                              {o.payment_method === "cash" ? t.cash : o.payment_status === "paid" ? tOrder.paid : tOrder.unpaid}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {time(o.is_reservation && o.scheduled_for ? o.scheduled_for : o.created_at)} · {egp(o.total, locale)}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-extrabold text-primary">
                        {t.view} <Chevron className="h-4 w-4" aria-hidden />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t.privacy}</p>
        </section>
      )}
    </div>
  );
}
