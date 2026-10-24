import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Mascot, PageShell } from "@/components/brand";
import { OrderView } from "@/components/order-view";

export const Route = createFileRoute("/_authenticated/order-confirmation")({
  validateSearch: z.object({ id: z.string() }),
  head: () => ({
    meta: [
      { title: "Order received — PANZUTTI" },
      { name: "description", content: "Your PANZUTTI order has been received." },
      { property: "og:title", content: "Order received — PANZUTTI" },
      { property: "og:description", content: "Thanks for ordering from PANZUTTI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Confirm,
});

function Confirm() {
  const { id } = Route.useSearch();
  return (
    <PageShell kicker="Thank you" title="Order received!">
      <div className="mb-8 flex items-center gap-6 rounded-3xl bg-brand-yellow p-6">
        <Mascot pose="thumbs-up" className="h-28 w-24 shrink-0" label="Mascot" />
        <p className="text-lg font-bold">We've got your order. The restaurant will confirm it shortly — you can follow every step right here.</p>
      </div>
      <OrderView id={id} />
      <Link to="/orders" className="mt-8 inline-block font-bold text-primary underline">All my orders</Link>
    </PageShell>
  );
}
