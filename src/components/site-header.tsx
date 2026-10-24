"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X, ShoppingBag, ShoppingCart, Globe } from "lucide-react";
import { Logo } from "./brand";
import { useCart } from "@/lib/cart";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary["nav"] }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { count } = useCart();
  const other = locale === "en" ? "ar" : "en";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const links = [
    { href: `/${locale}/menu`, label: t.menu },
    { href: `/${locale}/reserve`, label: t.reserve },
    { href: `/${locale}#story`, label: t.about },
    { href: `/${locale}/family`, label: t.family },
    { href: `/${locale}#visit`, label: t.visit },
    { href: `/${locale}/track`, label: t.track },
  ];

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-300",
        scrolled ? "bg-brand-cream/90 shadow-[0_1px_0_var(--color-border)] backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:h-20">
        <Link href={`/${locale}`} aria-label="Panzutti home" className="shrink-0">
          <Logo className="h-10 md:h-12" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-full px-2.5 py-2 text-sm font-bold text-foreground/80 transition hover:bg-muted hover:text-primary xl:px-4">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href={`/${other}`}
            hrefLang={other}
            className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold text-foreground/80 hover:bg-muted sm:inline-flex"
          >
            <Globe className="h-4 w-4" aria-hidden />
            <span className={other === "ar" ? "font-arabic text-base" : ""}>{t.language}</span>
          </Link>
          <Link
            href={`/${locale}/cart`}
            aria-label={count ? `${t.cart} (${count})` : t.cart}
            className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-primary transition hover:bg-muted"
          >
            <ShoppingCart className="h-5 w-5" aria-hidden />
            {count > 0 && (
              <span className="absolute -end-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-red px-1 text-[11px] font-extrabold text-brand-cream">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
          <Link
            href={`/${locale}/menu`}
            className="hidden items-center gap-2 rounded-full bg-brand-red px-4 sm:inline-flex py-2.5 text-sm font-extrabold text-brand-cream shadow-lg shadow-brand-red/25 transition hover:brightness-110"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden />
            {t.order}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-primary hover:bg-muted lg:hidden"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        id="mobile-menu"
        hidden={!open}
        className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto bg-brand-cream px-4 pb-10 pt-4 lg:hidden"
      >
        <nav aria-label="Mobile" className="flex flex-col">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="border-b border-border py-4 font-display text-3xl text-primary"
            >
              {l.label}
            </Link>
          ))}
          <Link href={`/${locale}/careers`} onClick={() => setOpen(false)} className="border-b border-border py-4 font-display text-3xl text-primary">
            {t.careers}
          </Link>
          <Link href={`/${other}`} hrefLang={other} className="mt-6 inline-flex items-center gap-2 font-bold text-foreground/80">
            <Globe className="h-5 w-5" aria-hidden /> {t.language}
          </Link>
        </nav>
      </div>
    </header>
  );
}
