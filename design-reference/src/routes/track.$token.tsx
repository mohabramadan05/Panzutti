import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { Mascot, PageShell } from "@/components/brand";
import { TrackView } from "@/components/track-view";

export const Route = createFileRoute("/track/$token")({
  validateSearch: z.object({ placed: z.boolean().optional() }),
  head: () => ({
    meta: [
      { title: "Track your order — PANZUTTI" },
      { name: "description", content: "Follow your PANZUTTI order live, from the oven to you." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Track your order — PANZUTTI" },
      { property: "og:description", content: "Live order status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Track,
});

function Track() {
  const { token } = Route.useParams();
  const { placed } = Route.useSearch();
  const valid = /^[0-9a-f-]{36}$/i.test(token);
  return (
    <PageShell kicker={placed ? "Thank you" : "Order tracking"} title={placed ? "Order received!" : "Your order"}>
      {placed && (
        <div className="mb-8 flex items-center gap-6 rounded-3xl bg-brand-yellow p-6">
          <Mascot pose="thumbs-up" className="h-28 w-24 shrink-0" label="Mascot" />
          <div>
            <p className="text-lg font-bold">We've got your order. The restaurant will confirm it shortly — every step shows up here as it happens.</p>
            <p className="mt-1 text-sm">Keep this page or copy the tracking link below to check back any time.</p>
          </div>
        </div>
      )}
      {valid ? <TrackView token={token} /> : <p className="rounded-3xl bg-card p-8 text-center">This tracking link isn't valid.</p>}
      <Link to="/menu" className="mt-8 inline-block font-bold text-primary underline">Back to the menu</Link>
    </PageShell>
  );
}
