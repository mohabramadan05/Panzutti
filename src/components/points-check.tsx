"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Gift, Loader2, ShoppingBag, Star } from "lucide-react";
import { Mascot } from "./brand";
import type { MascotPose } from "@/lib/brand";
import type { Dictionary, Locale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { egp, normalizePhone } from "@/lib/format";
import { cn } from "@/lib/utils";

const CUSTOMER_KEY = "panzutti-customer-v1"; // same key as checkout, to prefill the phone

/** get_loyalty() from the v5 SQL */
type Loyalty = { enabled: boolean; points?: number; points_per_order?: number; redeem_points?: number; redeem_value?: number };
type State = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; data: Loyalty };

// Stars that burst out from behind the character when the points arrive (angle in degrees, distance in px)
const BURST = Array.from({ length: 12 }, (_, i) => ({ angle: i * 30 + (i % 2 ? 12 : 0), dist: 110 + (i % 3) * 28, size: 14 + (i % 4) * 5 }));

function CountUp({ to, reduce }: { to: number; reduce: boolean }) {
  const [n, setN] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) return setN(to);
    const c = animate(0, to, { duration: Math.min(0.6 + to / 400, 2), ease: "easeOut", onUpdate: (v) => setN(Math.round(v)) });
    return () => c.stop();
  }, [to, reduce]);
  return <>{n.toLocaleString("en")}</>;
}

export function PointsCheck({ locale, t }: { locale: Locale; t: Dictionary["points"] }) {
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const reduce = !!useReducedMotion();
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CUSTOMER_KEY) ?? "null") as { phone?: string } | null;
      if (saved?.phone) setPhone(saved.phone);
    } catch {
      // nothing saved / storage blocked
    }
  }, []);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = normalizePhone(phone);
    if (!p) return setState({ kind: "error", message: t.phoneInvalid });
    if (!supabase) return setState({ kind: "error", message: t.generic });
    setState({ kind: "loading" });
    const { data, error } = await supabase.rpc("get_loyalty", { p_phone: p });
    if (error || !data) return setState({ kind: "error", message: t.generic });
    setState({ kind: "done", data: data as Loyalty });
  };

  const d = state.kind === "done" ? state.data : null;
  const points = d?.points ?? 0;
  const per = d?.redeem_points ?? 0;
  const value = d?.redeem_value ?? 0;
  const blocks = per > 0 ? Math.floor(points / per) : 0;
  const toNext = per > 0 ? per - (points % per) : 0;
  const progress = per > 0 ? (points % per) / per : 0;

  // the character reacts to what he finds
  const pose: MascotPose =
    state.kind === "loading" ? "curious" : !d ? "discover" : !d.enabled ? "sitting" : blocks > 0 ? "panuozzoExcited" : points > 0 ? "proud" : "hungry";
  const bubble =
    state.kind === "loading" ? t.bubbleLoading : !d ? t.bubbleIdle : !d.enabled ? t.bubbleOff : blocks > 0 ? t.bubbleRich : points > 0 ? t.bubbleSome : t.bubbleNone;
  const celebrate = !!d?.enabled && points > 0;

  return (
    <div className="grid items-center gap-10 md:grid-cols-2">
      {/* stage: the character, his speech bubble and the star burst */}
      <div className="relative mx-auto flex h-[22rem] w-full max-w-sm items-end justify-center md:h-[28rem]">
        <div className="absolute inset-x-6 bottom-0 h-1/2 rounded-full bg-brand-yellow/50 blur-2xl" aria-hidden />

        <AnimatePresence>
          {celebrate &&
            !reduce &&
            BURST.map((s, i) => {
              const rad = (s.angle * Math.PI) / 180;
              return (
                <motion.span
                  key={`${state.kind}-${i}`}
                  className="absolute bottom-1/2 start-1/2 text-brand-yellow drop-shadow"
                  initial={{ x: 0, y: 0, scale: 0, opacity: 0, rotate: 0 }}
                  animate={{
                    x: Math.cos(rad) * s.dist,
                    y: Math.sin(rad) * s.dist * 0.8,
                    scale: [0, 1.2, 1],
                    opacity: [0, 1, 1, 0.85],
                    rotate: 180,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.1, delay: 0.35 + i * 0.03, ease: "easeOut" }}
                  aria-hidden
                >
                  <Star className="fill-brand-yellow stroke-brand-red" style={{ width: s.size, height: s.size }} />
                </motion.span>
              );
            })}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={pose}
            className="relative z-10"
            initial={reduce ? { opacity: 0 } : { y: 60, opacity: 0, scale: 0.85 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 30, opacity: 0, scale: 0.9 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 18 }}
          >
            <motion.div
              animate={
                reduce ? undefined : state.kind === "loading" ? { rotate: [-4, 4, -4] } : celebrate ? { y: [0, -18, 0] } : { y: [0, -8, 0] }
              }
              transition={{ duration: state.kind === "loading" ? 0.6 : celebrate ? 0.9 : 3, repeat: Infinity, ease: "easeInOut" }}
            >
              <Mascot pose={pose} point="end" eager className="h-72 drop-shadow-xl md:h-96" />
            </motion.div>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.p
            key={bubble}
            className="absolute end-0 top-2 z-20 max-w-44 rounded-3xl rounded-es-md bg-card px-4 py-3 text-sm font-bold shadow-lg ring-1 ring-border"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.8 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 20, delay: 0.15 }}
          >
            {bubble}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* form + result card */}
      <div className="space-y-5">
        <form onSubmit={check} className="rounded-[2rem] bg-card p-6 ring-1 ring-border">
          <label htmlFor="points-phone" className="mb-1.5 block text-sm font-bold">{t.phone}</label>
          <div className="flex gap-2">
            <input
              id="points-phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (state.kind === "error") setState({ kind: "idle" });
              }}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="01012345678"
              className="h-12 min-w-0 flex-1 rounded-2xl bg-background px-4 ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="submit"
              disabled={state.kind === "loading" || !phone.trim()}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-primary px-5 font-extrabold text-primary-foreground transition hover:bg-brand-red disabled:opacity-50"
            >
              {state.kind === "loading" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Star className="h-4 w-4" aria-hidden />}
              {t.check}
            </button>
          </div>
          {state.kind === "error" && <p role="alert" className="mt-2 text-sm font-bold text-brand-red">{state.message}</p>}
        </form>

        <div aria-live="polite">
          {d?.enabled && (
            <motion.div
              key={points}
              className="rounded-[2rem] bg-primary p-6 text-primary-foreground shadow-xl shadow-primary/20"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.2 }}
            >
              <p className="text-sm font-bold uppercase tracking-widest text-brand-yellow">{t.yourPoints}</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-6xl tabular-nums">
                  <CountUp to={points} reduce={reduce} />
                </span>
                <span className="text-lg font-bold text-primary-foreground/80">{t.pointsWord}</span>
              </p>

              {per > 0 && value > 0 && (
                <>
                  <div className="mt-5 h-3 overflow-hidden rounded-full bg-primary-foreground/15" role="progressbar" aria-valuemin={0} aria-valuemax={per} aria-valuenow={points % per}>
                    <motion.div
                      className="h-full rounded-full bg-brand-yellow"
                      initial={{ width: reduce ? `${progress * 100}%` : "0%" }}
                      animate={{ width: `${progress * 100}%` }}
                      transition={{ duration: reduce ? 0 : 1.2, delay: reduce ? 0 : 0.5, ease: "easeOut" }}
                    />
                  </div>
                  <p className="mt-2 text-sm text-primary-foreground/85">
                    {t.toNext.replace("{points}", String(toNext)).replace("{amount}", egp(value, locale))}
                  </p>
                </>
              )}

              {blocks > 0 && (
                <p className="mt-4 flex items-center gap-2 rounded-2xl bg-brand-yellow px-4 py-3 font-extrabold text-foreground">
                  <Gift className="h-5 w-5 shrink-0" aria-hidden />
                  {t.canUse.replace("{amount}", egp(blocks * value, locale))}
                </p>
              )}

              <Link
                href={`/${locale}/menu`}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-red px-6 py-3 font-extrabold text-brand-cream transition hover:brightness-110"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden /> {t.order} <Arrow className="h-4 w-4" aria-hidden />
              </Link>
            </motion.div>
          )}
          {d && !d.enabled && <p className="rounded-[2rem] bg-card p-6 font-bold ring-1 ring-border">{t.off}</p>}
        </div>
      </div>
    </div>
  );
}

/** "How it works" steps, filled with the live rules when known. */
export function PointsHow({ t, className }: { t: Dictionary["points"]; className?: string }) {
  return (
    <ol className={cn("grid gap-4 md:grid-cols-3", className)}>
      {t.how.map((s, i) => (
        <li key={s.t} data-reveal className="rounded-3xl bg-card p-6 ring-1 ring-border">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-red font-display text-lg text-brand-cream">{i + 1}</span>
          <p className="mt-3 font-display text-xl text-primary">{s.t}</p>
          <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
        </li>
      ))}
    </ol>
  );
}
