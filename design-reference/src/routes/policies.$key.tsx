import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { settingsQuery } from "@/lib/data";
import { PageShell } from "@/components/brand";

const titles: Record<string, string> = { terms: "Terms & conditions", privacy: "Privacy policy", delivery: "Delivery policy", refunds: "Cancellations & refunds", loyalty: "PANZUTTI Club terms" };

export const Route = createFileRoute("/policies/$key")({
  head: ({ params }) => ({
    meta: [
      { title: `${titles[params.key] ?? "Policy"} — PANZUTTI` },
      { name: "description", content: `${titles[params.key] ?? "Policy"} for PANZUTTI customers.` },
      { property: "og:title", content: `${titles[params.key] ?? "Policy"} — PANZUTTI` },
      { property: "og:description", content: "PANZUTTI customer policies." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => {
    const { key } = Route.useParams();
    const { data } = useQuery(settingsQuery);
    const body: string = data?.policies?.[key] ?? "";
    return (
      <PageShell title={titles[key] ?? "Policy"}>
        {body ? <div className="max-w-3xl whitespace-pre-line text-lg leading-relaxed">{body}</div> : <p className="text-muted-foreground">This policy hasn't been published yet.</p>}
      </PageShell>
    );
  },
});
