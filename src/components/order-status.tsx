"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, Copy, Loader2, Phone, RefreshCw, Search, Upload, XCircle } from "lucide-react";
import { Mascot } from "./brand";
import { DeliveryScene } from "./delivery-scene";
import type { Dictionary, Locale } from "@/lib/i18n";
import { readLastOrder, type LastOrder } from "@/lib/last-order";
import { supabase } from "@/lib/supabase";
import { egp, telHref } from "@/lib/format";
import { cn } from "@/lib/utils";

type Status = keyof Dictionary["order"]["statuses"];

type Tracked = {
  order_id: string;
  order_number: number;
  status: Status;
  type: "pickup" | "delivery";
  is_reservation?: boolean; // v4
  party_size?: number | null;
  scheduled_for?: string | null;
  payment_method: "cash" | "instapay";
  payment_status: "paid" | "unpaid";
  instapay_address: string | null;
  payment_proof: { status: "pending" | "approved" | "rejected"; note: string | null } | null;
  subtotal: number;
  discount_total: number;
  delivery_fee: number;
  tax_total?: number;
  service_total?: number;
  total: number;
  branch: { name_en: string; name_ar: string; phone: string };
  items: { name: string; quantity: number; line_total: number; addons: { name: string; quantity: number }[] }[];
};

const FLOW = {
  pickup: ["pending", "confirmed", "preparing", "ready", "completed"],
  reservation: ["pending", "confirmed", "preparing", "ready", "completed"],
  delivery: ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "completed"],
} as const;

const MAX_PROOF_BYTES = 5 * 1024 * 1024;
const POLL_MS = 30_000;

/** Confirmation page: the order this device just placed (from localStorage). */
export function OrderConfirmation({ locale, t, orderNumber }: { locale: Locale; t: Dictionary["order"]; orderNumber: number | null }) {
  const [placed, setPlaced] = useState<LastOrder | null | undefined>(undefined); // undefined = not read yet

  useEffect(() => {
    const last = readLastOrder();
    setPlaced(last && (orderNumber == null || last.order_number === orderNumber) ? last : null);
  }, [orderNumber]);

  if (placed === undefined) return <div className="h-64 animate-pulse rounded-3xl bg-muted" aria-busy />;
  if (!placed)
    return (
      <div className="flex flex-col items-center rounded-[2rem] bg-card px-6 py-14 text-center ring-1 ring-border">
        <Mascot pose="curious" className="h-56 animate-float" />
        <p className="mt-4 text-lg text-muted-foreground">{t.missing}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href={`/${locale}/track`} className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground">
            <Search className="h-4 w-4" aria-hidden /> {t.track}
          </Link>
          <Link href={`/${locale}/menu`} className="rounded-full border-2 border-primary px-6 py-3 font-extrabold text-primary">{t.orderMore}</Link>
        </div>
      </div>
    );
  return <OrderStatus locale={locale} t={t} orderNumber={placed.order_number} phone={placed.phone} placed={placed} />;
}

/**
 * Live status, totals and InstaPay payment for one order, looked up with track_order(number, phone).
 * `placed` (what place_order returned on this device) fills the page until track_order answers.
 */
export function OrderStatus({
  locale,
  t,
  orderNumber,
  phone,
  placed,
  onBack,
  backLabel,
}: {
  locale: Locale;
  t: Dictionary["order"];
  orderNumber: number;
  phone: string;
  placed?: LastOrder | null;
  onBack?: () => void;
  backLabel?: string;
}) {
  const [order, setOrder] = useState<Tracked | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [reference, setReference] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;

  const refresh = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase.rpc("track_order", { p_order_number: orderNumber, p_phone: phone });
    if (data) {
      setOrder(data as Tracked);
      setError("");
    } else if (err) setError(err.message);
    setCheckedAt(new Date());
    setLoading(false);
  }, [orderNumber, phone]);

  useEffect(() => {
    setOrder(null);
    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const backButton = onBack && (
    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-foreground/70 hover:text-primary">
      <Back className="h-4 w-4" aria-hidden /> {backLabel}
    </button>
  );

  if (!order && !placed) {
    if (!error) return <div className="h-64 animate-pulse rounded-3xl bg-muted" aria-busy />;
    return (
      <div className="space-y-4">
        {backButton}
        <p role="alert" className="rounded-2xl bg-brand-red/10 px-4 py-3 font-bold text-brand-red">{error}</p>
      </div>
    );
  }

  // Until track_order answers, show what place_order returned
  const o = order;
  const type = o ? (o.is_reservation ? "reservation" : o.type) : (placed?.type ?? "pickup");
  const isReservation = type === "reservation";
  const status: Status = o?.status ?? "pending";
  const flow: readonly Status[] = FLOW[type];
  const stepIndex = flow.indexOf(status);
  const total = o?.total ?? placed?.total ?? 0;
  const subtotal = o?.subtotal ?? placed?.subtotal ?? 0;
  const discount = o?.discount_total ?? placed?.discount_total ?? 0;
  const deliveryFee = o?.delivery_fee ?? placed?.delivery_fee ?? 0;
  const tax = o?.tax_total ?? placed?.tax_total ?? 0;
  const service = o?.service_total ?? placed?.service_total ?? 0;
  const when = o?.scheduled_for ?? placed?.scheduled_for ?? null;
  const guests = o?.party_size ?? placed?.party_size ?? null;
  const whenLabel = when
    ? new Date(when).toLocaleString(locale === "ar" ? "ar-EG" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" })
    : "";
  const orderId = o?.order_id ?? placed?.order_id;
  const isInstapay = (o?.payment_method ?? placed?.payment_method) === "instapay";
  const paid = o?.payment_status === "paid";
  const proof = o?.payment_proof ?? null;
  const awaitingPayment = isInstapay && !paid && status !== "cancelled" && status !== "completed";
  const needsProof = awaitingPayment && (!proof || proof.status === "rejected");
  const instapayAddress = o?.instapay_address ?? placed?.instapay_address ?? null;
  const branchPhone = o?.branch.phone;

  const upload = async () => {
    if (!file || !supabase || !orderId) return;
    if (file.size > MAX_PROOF_BYTES) return setUploadError(t.fileTooBig);
    setUploading(true);
    setUploadError("");
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${orderId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("payment-proofs").upload(path, file, { contentType: file.type || undefined });
    const res = up.error
      ? up
      : await supabase.rpc("submit_payment_proof", {
          p_order_id: orderId,
          p_phone: phone,
          p_file_path: path,
          p_reference: reference.trim() || null,
        });
    setUploading(false);
    if (res.error) return setUploadError(res.error.message);
    setFile(null);
    setReference("");
    refresh();
  };

  const paymentCard = (
    <section className={cn("rounded-[2rem] bg-card p-6 ring-1", awaitingPayment ? "ring-2 ring-brand-red" : "ring-border")}>
      {!isInstapay ? (
        <p className="font-bold">{(type === "delivery" ? t.cashDelivery : isReservation ? t.cashReservation : t.cashPickup).replace("{amount}", egp(total, locale))}</p>
      ) : paid ? (
        <p className="flex items-center gap-2 font-bold text-primary">
          <CheckCircle2 className="h-5 w-5" aria-hidden /> {t.paid}
        </p>
      ) : status === "cancelled" || status === "completed" ? (
        <p className="font-bold text-muted-foreground">{t.unpaid}</p>
      ) : (
        <div>
          <h2 className="text-2xl text-primary">{t.payTitle}</h2>
          {instapayAddress && (
            <div className="mt-4 rounded-2xl bg-brand-yellow/30 p-4">
              <p className="text-sm">{t.send.replace("{amount}", egp(total, locale))}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <code dir="ltr" className="break-all text-lg font-extrabold">{instapayAddress}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(instapayAddress).then(() => setCopied(true), () => {});
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-3 py-1.5 text-sm font-bold ring-1 ring-border"
                >
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? t.copied : t.copy}
                </button>
              </div>
            </div>
          )}

          {proof?.status === "pending" && <p className="mt-4 rounded-2xl bg-primary/10 px-4 py-3 font-bold text-primary">{t.uploaded}</p>}
          {proof?.status === "rejected" && proof.note && <p className="mt-4 rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">{proof.note}</p>}

          {needsProof && (
            <div className="mt-5 space-y-3">
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-primary/30 bg-background p-4 hover:border-primary">
                <Upload className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{file ? file.name : t.upload}</span>
                  <span className="block text-xs text-muted-foreground">{t.fileHint}</span>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setUploadError("");
                  }}
                />
              </label>
              <label className="block">
                <span className="sr-only">{t.reference}</span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value.slice(0, 60))}
                  placeholder={t.reference}
                  dir="ltr"
                  className="h-11 w-full rounded-full bg-background px-4 text-sm ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                />
              </label>
              {uploadError && <p role="alert" className="text-sm font-bold text-brand-red">{uploadError}</p>}
              <button
                type="button"
                onClick={upload}
                disabled={!file || uploading || !orderId}
                className="inline-flex items-center gap-2 rounded-full bg-brand-red px-6 py-3 font-extrabold text-brand-cream disabled:opacity-40"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                {uploading ? t.uploading : t.upload}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      {backButton}
      <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-[2rem] bg-primary p-6 text-primary-foreground md:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-brand-yellow">{t.number.replace("{n}", String(orderNumber))}</p>
            <h2 className="mt-2 text-4xl md:text-5xl">{placed && status !== "cancelled" ? (isReservation ? t.reserved : t.placed) : t.statuses[status]}</h2>
            {isReservation && whenLabel && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand-yellow px-4 py-1.5 font-extrabold text-foreground">
                <CalendarDays className="h-4 w-4" aria-hidden /> {t.tableFor.replace("{n}", String(guests ?? "")).replace("{when}", whenLabel)}
              </p>
            )}
            {placed && <p className="mt-3 max-w-sm opacity-90">{t.thanks.replace("{name}", placed.name.split(" ")[0])}</p>}
            {/* Animated illustration that follows the live status (polled every 30 s) */}
            <DeliveryScene type={type === "delivery" ? "delivery" : "pickup"} status={status} t={t.scene} />
          </section>

          {/* Unpaid InstaPay: payment comes first so the upload box is the first thing customers see */}
          {awaitingPayment && paymentCard}

          <section className="rounded-[2rem] bg-card p-6 ring-1 ring-border">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl text-primary">{t.statusTitle}</h2>
              <button type="button" onClick={refresh} disabled={loading} className="inline-flex items-center gap-1.5 text-sm font-bold text-primary disabled:opacity-50">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden /> {t.refresh}
              </button>
            </div>
            {status === "cancelled" ? (
              <p className="mt-4 flex items-center gap-2 font-bold text-brand-red">
                <XCircle className="h-5 w-5" aria-hidden /> {t.statuses.cancelled}
              </p>
            ) : (
              <ol className="mt-5 space-y-0" aria-live="polite">
                {flow.map((st, i) => {
                  const done = i < stepIndex || status === "completed";
                  const current = i === stepIndex && status !== "completed";
                  return (
                    <li key={st} className="relative flex gap-3 pb-5 last:pb-0">
                      {i < flow.length - 1 && <span aria-hidden className={cn("absolute start-[11px] top-6 h-full w-0.5", done ? "bg-primary" : "bg-border")} />}
                      <span
                        className={cn(
                          "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                          done ? "border-primary bg-primary text-primary-foreground" : current ? "border-brand-red bg-brand-red/10" : "border-border bg-background",
                        )}
                      >
                        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : current && <span className="h-2 w-2 animate-pulse rounded-full bg-brand-red" />}
                      </span>
                      <span className={cn("font-bold", current ? "text-brand-red" : done ? "text-primary" : "text-muted-foreground")}>{t.statuses[st]}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            {checkedAt && (
              <p className="mt-4 text-xs text-muted-foreground">
                {t.updated.replace("{time}", checkedAt.toLocaleTimeString(locale === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit" }))}
              </p>
            )}
          </section>

          {!awaitingPayment && paymentCard}
        </div>

        <aside className="rounded-[2rem] bg-card p-6 ring-1 ring-border lg:sticky lg:top-24">
          <h2 className="text-2xl text-primary">{t.items}</h2>
          {o ? (
            <ul className="mt-4 space-y-3 text-sm">
              {o.items.map((it, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-bold">{it.quantity}× {it.name}</span>
                    {it.addons.length > 0 && <span className="block text-muted-foreground">{it.addons.map((a) => a.name).join(" · ")}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">{egp(it.line_total, locale)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 h-16 animate-pulse rounded-2xl bg-muted" />
          )}
          <dl className="mt-5 space-y-2 border-t border-dashed border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t.subtotal}</dt>
              <dd className="tabular-nums">{egp(subtotal, locale)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-primary">
                <dt>{t.discount}</dt>
                <dd className="tabular-nums">−{egp(discount, locale)}</dd>
              </div>
            )}
            {deliveryFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.deliveryFee}</dt>
                <dd className="tabular-nums">{egp(deliveryFee, locale)}</dd>
              </div>
            )}
            {service > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.service}</dt>
                <dd className="tabular-nums">{egp(service, locale)}</dd>
              </div>
            )}
            {tax > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t.vat}</dt>
                <dd className="tabular-nums">{egp(tax, locale)}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg">
              <dt className="font-display text-primary">{t.total}</dt>
              <dd className="font-extrabold tabular-nums text-primary">{egp(total, locale)}</dd>
            </div>
          </dl>
          <p className="mt-5 rounded-2xl bg-muted px-4 py-3 text-xs text-muted-foreground">{t.keep}</p>
          {branchPhone && (
            <a href={telHref(branchPhone)} className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">
              <Phone className="h-4 w-4" aria-hidden />
              <span>{t.call.replace("{phone}", "")}</span>
              <span dir="ltr">{branchPhone.replace("+20", "0")}</span>
            </a>
          )}
          <Link href={`/${locale}/menu`} className="mt-6 flex justify-center rounded-full border-2 border-primary py-3 font-extrabold text-primary transition hover:bg-primary hover:text-primary-foreground">
            {t.orderMore}
          </Link>
        </aside>
      </div>
    </div>
  );
}
