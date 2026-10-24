import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mascot, PageShell } from "@/components/brand";
import { egp, fulfillmentLabel, statusLabel } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/orders/")({
  head: () => ({
    meta: [
      { title: "My orders — PANZUTTI" },
      { name: "description", content: "Your PANZUTTI order history and live order status." },
      { property: "og:title", content: "My orders — PANZUTTI" },
      { property: "og:description", content: "Order history and status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Orders,
});

function Orders() {
  const { data, isLoading } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => (await supabase.from("orders").select("id,order_number,status,fulfillment,total,created_at").order("created_at", { ascending: false })).data ?? [],
  });
  return (
    <PageShell title="My orders">
      {isLoading ? <p>Loading…</p> : !data?.length ? (
        <div className="flex flex-col items-center rounded-3xl bg-card p-10 text-center">
          <Mascot pose="empty" className="mb-4 h-36 w-28" />
          <p className="text-lg font-bold">No orders yet.</p>
          <Link to="/menu" className="mt-4 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">Order your first panuozzo</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.map((o) => (
            <li key={o.id}>
              <Link to="/orders/$id" params={{ id: o.id }} className="flex items-center justify-between rounded-2xl bg-card p-5 ring-1 ring-border hover:ring-primary">
                <div>
                  <p className="font-display text-lg text-primary">{o.order_number}</p>
                  <p className="text-sm text-muted-foreground">{new Date(o.created_at).toLocaleString()} · {fulfillmentLabel[o.fulfillment]}</p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold">{egp(o.total)}</p>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold">{statusLabel[o.status]}</span>
                  {o.status === "completed" && <span className="mt-1 block text-xs font-bold text-brand-red">Leave a review →</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
