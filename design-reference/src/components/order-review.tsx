import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { errMsg } from "@/lib/format";
import { SERVICE_KINDS, SERVICE_QUESTION, StarInput } from "@/lib/reviews";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoPlaceholder } from "@/components/product-card";

type State = {
  eligible: boolean;
  fulfillment: "delivery" | "pickup" | "dine_in";
  service_kinds?: string[];
  products: { product_id: string; name: string; image_url: string | null }[];
  reviews: { kind: string; product_id: string | null; rating: number; title: string | null; body: string | null; status: string }[];
};
type Draft = { rating: number; title: string; body: string };
const keyOf = (kind: string, pid?: string | null) => `${kind}:${pid ?? ""}`;
const empty: Draft = { rating: 0, title: "", body: "" };

/** "Leave a review" once the order is completed. Access is the order's private tracking link. */
export function OrderReview({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data: st, isLoading, error, refetch } = useQuery({
    queryKey: ["order-review", token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("order_review_state", { _token: token });
      if (error) throw error;
      return data as unknown as State | null;
    },
  });
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!st) return;
    const d: Record<string, Draft> = {};
    for (const r of st.reviews) d[keyOf(r.kind, r.product_id)] = { rating: r.rating, title: r.title ?? "", body: r.body ?? "" };
    setDrafts(d);
  }, [st]);

  if (isLoading) return null;
  if (error || !st || !st.eligible) return null;

  const serviceKinds = st.service_kinds ?? SERVICE_KINDS[st.fulfillment] ?? [];
  const serviceLabel = st.fulfillment === "delivery" ? "the delivery and the delivery time" : st.fulfillment === "pickup" ? "the pickup and how long it took" : "the dining experience and how long it took";
  const already = st.reviews.length > 0;
  const get = (k: string) => drafts[k] ?? empty;
  const set = (k: string, patch: Partial<Draft>) => setDrafts((x) => ({ ...x, [k]: { ...get(k), ...patch } }));

  const submit = async () => {
    const items = Object.entries(drafts)
      .filter(([, d]) => d.rating > 0)
      .map(([k, d]) => {
        const [kind, pid] = k.split(":");
        return { kind, product_id: pid || undefined, rating: d.rating, title: d.title.trim(), body: d.body.trim() };
      });
    if (!items.length) return toast.error("Tap the stars to rate at least one thing.");
    setBusy(true);
    const { data, error } = await supabase.rpc("submit_order_reviews", { _token: token, _reviews: items });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    const status = (data as { status?: string } | null)?.status;
    toast.success(status === "pending" ? "Thanks! Your review will appear once it's approved." : "Thanks for your review!");
    setDone(true);
    refetch();
    qc.invalidateQueries({ queryKey: ["product-ratings"] });
    qc.invalidateQueries({ queryKey: ["review-summary"] });
    qc.invalidateQueries({ queryKey: ["product-reviews"] });
  };

  const Block = ({ k, q, title }: { k: string; q: string; title?: string }) => (
    <div className="space-y-2 rounded-2xl bg-background p-4 ring-1 ring-border">
      {title && <p className="font-bold">{title}</p>}
      <p className="text-sm text-muted-foreground">{q}</p>
      <StarInput label={q} value={get(k).rating} onChange={(v) => set(k, { rating: v })} />
      {get(k).rating > 0 && (
        <>
          {k.startsWith("product") && <Input placeholder="Title (optional)" maxLength={120} value={get(k).title} onChange={(e) => set(k, { title: e.target.value })} />}
          <Textarea placeholder="Tell us more (optional)" maxLength={2000} value={get(k).body} onChange={(e) => set(k, { body: e.target.value })} />
        </>
      )}
    </div>
  );

  return (
    <section id="review" className="space-y-4 rounded-3xl bg-card p-6 ring-1 ring-border">
      <div>
        <h3 className="text-xl text-primary">{already ? "Your review" : "Leave a review"}</h3>
        <p className="text-sm text-muted-foreground">Rate each item, {serviceLabel}. Rate as much or as little as you like — you can come back and update it.</p>
      </div>
      {done && (
        <p className="flex items-center gap-2 rounded-2xl bg-primary/10 p-3 font-bold text-primary"><CheckCircle2 className="h-5 w-5" /> Review saved — thank you!</p>
      )}

      {st.products.length > 0 && <h4 className="font-bold">Rate the food</h4>}
      {st.products.map((p) => (
        <div key={p.product_id} className="flex gap-3">
          {p.image_url ? <img src={p.image_url} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" /> : <PhotoPlaceholder className="h-16 w-16 shrink-0 rounded-xl" />}
          <div className="flex-1">{Block({ k: keyOf("product", p.product_id), title: p.name, q: "How was the food?" })}</div>
        </div>
      ))}

      {serviceKinds.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {serviceKinds.map((k) => (
            <div key={k}>{Block({ k: keyOf(k), title: SERVICE_QUESTION[k]?.title, q: SERVICE_QUESTION[k]?.q ?? "" })}</div>
          ))}
        </div>
      )}

      <button disabled={busy} onClick={submit} className="w-full rounded-full bg-brand-red py-3.5 font-extrabold text-brand-cream disabled:opacity-50">
        {busy ? "Saving…" : already ? "Update review" : "Submit review"}
      </button>
    </section>
  );
}
