import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Stars } from "@/lib/reviews";

const PAGE = 5;
type Summary = { avg: number; count: number; dist: Record<string, number> };
type Sort = "recent" | "highest" | "lowest";

/** Published product reviews only — delivery and delivery-time ratings never appear here. */
export function ProductReviews({ productId }: { productId: string }) {
  const [sort, setSort] = useState<Sort>("recent");
  const summary = useQuery({
    queryKey: ["review-summary", productId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("product_review_summary", { _product: productId });
      if (error) throw error;
      return data as unknown as Summary;
    },
  });
  const list = useInfiniteQuery({
    queryKey: ["product-reviews", productId, sort],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase.rpc("product_reviews", { _product: productId, _sort: sort, _limit: PAGE, _offset: pageParam });
      if (error) throw error;
      return data ?? [];
    },
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });

  const s = summary.data;
  const reviews = list.data?.pages.flat() ?? [];

  return (
    <section id="reviews" className="md:col-span-2">
      <h2 className="text-3xl text-primary">Reviews</h2>
      {summary.isLoading ? (
        <p className="mt-4 text-muted-foreground">Loading reviews…</p>
      ) : summary.error ? (
        <p className="mt-4 text-muted-foreground">Reviews couldn't load right now.</p>
      ) : !s || s.count === 0 ? (
        <p className="mt-4 rounded-3xl bg-card p-6 ring-1 ring-border">No reviews yet — order it and be the first to review.</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-[260px_1fr]">
          <div className="h-fit rounded-3xl bg-card p-5 ring-1 ring-border">
            <p className="text-5xl font-extrabold text-primary">{Number(s.avg).toFixed(1)}</p>
            <Stars value={Number(s.avg)} className="mt-1" />
            <p className="mt-1 text-sm text-muted-foreground">{s.count} review{s.count === 1 ? "" : "s"}</p>
            <ul className="mt-4 space-y-1.5">
              {[5, 4, 3, 2, 1].map((n) => {
                const c = s.dist[String(n)] ?? 0;
                return (
                  <li key={n} className="flex items-center gap-2 text-sm">
                    <span className="w-8">{n}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-brand-yellow" style={{ width: `${s.count ? (c / s.count) * 100 : 0}%` }} /></span>
                    <span className="w-6 text-right text-muted-foreground">{c}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              {([["recent", "Most recent"], ["highest", "Highest rated"], ["lowest", "Lowest rated"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setSort(k)} className={`rounded-full px-3 py-1.5 text-sm font-bold ring-1 ${sort === k ? "bg-primary text-primary-foreground ring-primary" : "ring-border"}`}>{l}</button>
              ))}
            </div>
            {list.isLoading && <p className="text-muted-foreground">Loading…</p>}
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-2xl bg-card p-4 ring-1 ring-border">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-bold">
                      {r.display_name}
                      {r.verified && <span className="inline-flex items-center gap-0.5 text-xs font-bold text-primary"><BadgeCheck className="h-3.5 w-3.5" /> Verified order</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("en-EG", { day: "numeric", month: "short", year: "numeric" })}</span>
                  </div>
                  <Stars value={r.rating} className="mt-1" />
                  {r.title && <p className="mt-2 font-bold">{r.title}</p>}
                  {r.body && <p className="mt-1 whitespace-pre-line text-foreground/80">{r.body}</p>}
                </li>
              ))}
            </ul>
            {list.hasNextPage && (
              <button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} className="mt-4 rounded-full px-5 py-2 font-bold ring-1 ring-border disabled:opacity-50">
                {list.isFetchingNextPage ? "Loading…" : "Load more reviews"}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
