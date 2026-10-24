import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { articlesQuery } from "@/lib/data";
import { Mascot, PageShell } from "@/components/brand";
import spread from "@/assets/table-spread.jpg.asset.json";

export const Route = createFileRoute("/journal/")({
  head: () => ({
    meta: [
      { title: "PANZUTTI Journal — Stories from the oven" },
      { name: "description", content: "News, recipes, launches and stories from the PANZUTTI kitchen in Heliopolis." },
      { property: "og:title", content: "PANZUTTI Journal" },
      { property: "og:description", content: "Stories from the PANZUTTI kitchen." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Journal,
});

function Journal() {
  const { data, isLoading } = useQuery(articlesQuery);
  return (
    <PageShell kicker="Journal" title="Stories from the oven">
      {isLoading ? <p>Loading…</p> : !data?.length ? (
        <div className="flex flex-col items-center rounded-3xl bg-card p-10 text-center">
          <Mascot pose="thinking" className="mb-4 h-36 w-28" />
          <p className="text-lg font-bold">Our first stories are still in the oven.</p>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {data.map((a, i) => (
            <Link key={a.id} to="/journal/$slug" params={{ slug: a.slug }} className={`group ${i === 0 ? "md:col-span-2" : ""}`}>
              <img src={a.cover_url || spread.url} alt="" className="aspect-[16/10] w-full rounded-3xl object-cover" />
              <p className="mt-4 text-xs font-bold uppercase tracking-widest text-brand-red">{a.category} {a.published_at && `· ${new Date(a.published_at).toLocaleDateString()}`}</p>
              <h2 className="mt-1 text-2xl text-primary group-hover:underline">{a.title}</h2>
              {a.excerpt && <p className="mt-2 text-muted-foreground">{a.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
