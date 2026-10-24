"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bike, ShoppingBag, X } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import { useCart, type OrderType } from "@/lib/cart";
import { cn } from "@/lib/utils";

const SEEN_KEY = "panzutti-welcome-seen-v1";
const DELAY_MS = 900;

/**
 * First-visit welcome on the home page: the Panzutti character points at a greeting and the two
 * ways to order. Choosing one sets the cart's order type and opens the menu. Shown once per
 * browser (localStorage); if storage is blocked it simply shows each visit.
 */
export function WelcomePopup({ locale, t }: { locale: Locale; t: Dictionary["welcome"] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const { setType } = useCart();
  const router = useRouter();

  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // storage blocked
    }
    if (seen) return;
    const id = window.setTimeout(() => setOpen(true), DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
  }, [open]);

  const close = () => {
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // not critical
    }
    ref.current?.close();
    setOpen(false);
  };

  const choose = (type: OrderType) => {
    setType(type);
    close();
    router.push(`/${locale}/menu`);
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
          </div>
          <button type="button" onClick={close} className="mt-4 text-sm font-bold text-foreground/60 underline-offset-4 hover:text-primary hover:underline">
            {t.browse}
          </button>
        </div>

        {/* The character points at the greeting: flipped in Arabic so he still points at the text */}
        <div className="relative order-1 flex h-52 items-end justify-center overflow-hidden md:order-2 md:h-auto md:min-h-[420px]">
          <Image
            src="/brand/character.webp"
            alt=""
            width={525}
            height={900}
            priority
            sizes="(min-width: 768px) 280px, 60vw"
            className="h-[150%] w-auto max-w-none animate-slide-in object-contain object-top drop-shadow-xl rtl:-scale-x-100 md:h-full md:max-h-[440px] md:object-bottom md:py-6"
          />
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
