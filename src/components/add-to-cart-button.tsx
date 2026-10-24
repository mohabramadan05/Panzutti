"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Plus, SlidersHorizontal } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { useCart, type CartAddon, type CartLine } from "@/lib/cart";
import { cn } from "@/lib/utils";

/**
 * Quick add from a product card. Items with a required choice (e.g. "Choose a side") open the
 * item page instead; everything else goes straight into the cart with its default add-ons.
 * Props are small fresh objects built by the card on purpose (see the dev-mode note in CLAUDE.md §4).
 */
export function AddToCartButton({
  product,
  defaultAddons,
  needsChoice,
  soldOut,
  locale,
  labels,
}: {
  product: CartLine["item"];
  defaultAddons: CartAddon[];
  needsChoice: boolean;
  soldOut: boolean;
  locale: Locale;
  labels: { add: string; added: string; choose: string; name: string };
}) {
  const { add } = useCart();
  const router = useRouter();
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!added) return;
    const id = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(id);
  }, [added]);

  const onClick = (e: React.MouseEvent) => {
    // The card behind is one big link: don't let this click open the item page
    e.preventDefault();
    e.stopPropagation();
    if (needsChoice) return router.push(`/${locale}/menu/${product.slug}`);
    add({ item: product, addons: defaultAddons, quantity: 1, note: "" });
    setAdded(true);
  };

  const Icon = added ? Check : needsChoice ? SlidersHorizontal : Plus;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soldOut}
      aria-label={`${needsChoice ? labels.choose : labels.add}: ${labels.name}`}
      className={cn(
        "relative z-10 inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-bold text-primary-foreground transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
        added ? "bg-brand-red" : "bg-primary hover:bg-brand-red",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span aria-live="polite">{added ? labels.added : needsChoice ? labels.choose : labels.add}</span>
    </button>
  );
}
