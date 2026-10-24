import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/brand";
import { OrderView } from "@/components/order-view";

export const Route = createFileRoute("/_authenticated/orders/$id")({
  head: () => ({
    meta: [
      { title: "Order status — PANZUTTI" },
      { name: "description", content: "Track your PANZUTTI order." },
      { property: "og:title", content: "Order status — PANZUTTI" },
      { property: "og:description", content: "Track your order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => {
    const { id } = Route.useParams();
    return (
      <PageShell title="Order status">
        <Link to="/orders" className="mb-6 inline-block font-bold text-brand-red">← All orders</Link>
        <OrderView id={id} />
      </PageShell>
    );
  },
});
