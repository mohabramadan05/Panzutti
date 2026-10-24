"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bike, CalendarDays, ShoppingBag, X } from "lucide-react";
import { Mascot } from "./brand";
import type { Dictionary, Locale } from "@/lib/i18n";
import { useCart, type OrderType } from "@/lib/cart";
import { cn } from "@/lib/utils";

const DELAY_MS = 900;

/**
 * Welcome on the home page, shown every time the home page is opened: the Panzutti character waves
 * next to a greeting and the ways to eat with us. Delivery/pickup set the cart's order type and open
 * the menu; "Reserve a table" opens /reserve.
 */
export function WelcomePopup({ locale, t }: { locale: Locale; t: Dictionary["welcome"] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const { setType } = useCart();
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => setOpen(true), DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  const close = () => {
    ref.current?.close();
    setOpen(false);
  };

  const choose = (type: OrderType) => {
    setType(type);
    close();
    router.push(type === "reservation" ? `/${locale}/reserve` : `/${locale}/menu`);
  };

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => e.target === e.currentTarget && close()}
      aria-labelledby="welcome-title"
      className="m-auto w-[min(94vw,760px)] overflow-visible bg-transparent p-0 backdrop:bg-foreground/60 backdrop:backdrop-blur-sm"
    >
      <div className="relative grid animate-pop-in overflow-hidden rounded-[2rem] bg-brand-cream shadow-2xl md:grid-cols-[1.25fr_1fr]">
        {/* warm glow + dots, like the home hero */}
        <div aria-hidden className="grain pointer-events-none absolute inset-0 opacity-60" />
        <div aria-hidden className="pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full bg-brand-yellow/50 blur-3xl" />

        <div className="relative order-2 p-6 md:order-1 md:p-9">
          <p className={cn("text-3xl text-brand-red", locale === "ar" ? "font-arabic" : "font-script")}>{t.kicker}</p>
          <h2 id="welcome-title" className="mt-1 text-4xl text-primary md:text-5xl">
            {t.title}
          </h2>
          <p className="mt-4 text-foreground/80">{t.body}</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap [&>button]:whitespace-nowrap">
            <button
              type="button"
              onClick={() => choose("delivery")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-red px-5 py-3.5 font-extrabold text-brand-cream shadow-lg shadow-brand-red/25 transition hover:-translate-y-0.5 hover:brightness-110"
            >
              <Bike className="h-5 w-5" aria-hidden /> {t.delivery}
            </button>
            <button
              type="button"
              onClick={() => choose("pickup")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 font-extrabold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:brightness-110"
            >
              <ShoppingBag className="h-5 w-5" aria-hidden /> {t.pickup}
            </button>
            <button
              type="button"
              onClick={() => choose("reservation")}
              className="inline-flex items-center justify-center gap-2 rounded-full border-2 border-primary bg-card px-5 py-3 font-extrabold text-primary transition hover:-translate-y-0.5 hover:bg-primary hover:text-primary-foreground"
            >
              <CalendarDays className="h-5 w-5" aria-hidden /> {t.reserve}
            </button>
          </div>
          <button type="button" onClick={close} className="mt-4 text-sm font-bold text-foreground/60 underline-offset-4 hover:text-primary hover:underline">
            {t.browse}
          </button>
        </div>

        {/* The character waves at the greeting: mirrored so he always faces the text, in EN and AR */}
        <div className="relative order-1 flex h-52 items-end justify-center overflow-hidden md:order-2 md:h-auto md:min-h-[420px]">
          <div aria-hidden className="absolute bottom-0 h-40 w-40 rounded-full bg-brand-yellow md:bottom-10 md:h-64 md:w-64" />
          <div className="relative mt-6 h-[150%] self-start animate-slide-in md:mt-0 md:h-full md:max-h-[440px] md:self-end md:py-6">
            <Mascot pose="welcome" point="start" eager className="h-full animate-float drop-shadow-xl" />
          </div>
        </div>

        <button
          type="button"
          autoFocus
          onClick={close}
          aria-label={t.close}
          className="absolute end-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-card text-primary shadow ring-1 ring-border transition hover:bg-brand-red hover:text-brand-cream"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </dialog>
  );
}
