"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Fades/slides every `[data-reveal]` element in as it scrolls into view (styles in globals.css).
 * Mounted once in the locale layout; re-scans after each client navigation. Does nothing when the
 * user prefers reduced motion, so content is never hidden for them (or without JS).
 */
export function ScrollReveal() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-shown", "");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    const scan = () => document.querySelectorAll("[data-reveal]:not([data-shown])").forEach((el) => io.observe(el));
    scan();
    root.classList.add("reveal-ready");
    // Content that appears later (client components, "show more") gets observed too
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  return null;
}
