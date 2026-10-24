import { queryOptions, useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Published product-review averages for every product (delivery ratings are never included). */
export const ratingsQuery = queryOptions({
  queryKey: ["product-ratings"],
  staleTime: 15_000,
  refetchOnWindowFocus: true,
  queryFn: async () => {
    const { data, error } = await supabase.rpc("product_ratings");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.product_id, { avg: Number(r.avg_rating), count: r.review_count }])) as Record<string, { avg: number; count: number }>;
  },
});

export function useProductRating(productId: string) {
  const { data } = useQuery(ratingsQuery);
  return data?.[productId];
}

export const REVIEW_KINDS: Record<string, string> = {
  product: "Product",
  delivery: "Delivery service",
  delivery_time: "Delivery time",
  pickup_service: "Pickup service",
  prep_time: "Preparation time",
  dining_experience: "Dining experience",
};

/** Service questions for each way of ordering (product ratings are always asked per item). */
export const SERVICE_KINDS: Record<string, string[]> = {
  delivery: ["delivery", "delivery_time"],
  pickup: ["pickup_service", "prep_time"],
  dine_in: ["dining_experience", "prep_time"],
};

export const SERVICE_QUESTION: Record<string, { title: string; q: string }> = {
  delivery: { title: "Rate the delivery service", q: "How was the delivery experience?" },
  delivery_time: { title: "Rate delivery time", q: "Did your order arrive in a good time?" },
  pickup_service: { title: "Rate the pickup service", q: "How easy and smooth was collecting your order?" },
  prep_time: { title: "Rate preparation time", q: "How long did it take for your order to be ready?" },
  dining_experience: { title: "Rate the dining experience", q: "How were the service and your time with us?" },
};

/** Read-only stars, e.g. 4.5 → four full and one half-faded. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-4 w-4", value >= i - 0.25 ? "fill-brand-yellow text-brand-yellow" : value >= i - 0.75 ? "fill-brand-yellow/50 text-brand-yellow" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

/** "★ 4.7 (128)" for product cards; nothing until the first published review. */
export function RatingBadge({ productId, className }: { productId: string; className?: string }) {
  const r = useProductRating(productId);
  if (!r || !r.count) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-bold", className)} aria-label={`Rated ${r.avg} out of 5 from ${r.count} reviews`}>
      <Star className="h-4 w-4 fill-brand-yellow text-brand-yellow" />
      {r.avg.toFixed(1)} <span className="font-normal text-muted-foreground">({r.count})</span>
    </span>
  );
}

/** Tap-to-rate stars. */
export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} star${i > 1 ? "s" : ""}`}
          onClick={() => onChange(i)}
          className="rounded p-0.5 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Star className={cn("h-8 w-8", value >= i ? "fill-brand-yellow text-brand-yellow" : "text-muted-foreground/40")} />
        </button>
      ))}
    </div>
  );
}
