import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/journal/$slug")({
  head: ({ params }) => {
    const t = params.slug.replace(/-/g, " ");
    return {
      meta: [
        { title: `${t} — PANZUTTI Journal` },
        { name: "description", content: `Read "${t}" on the PANZUTTI Journal.` },
        { property: "og:title", content: `${t} — PANZUTTI Journal` },
        { property: "og:description", content: "A story from the PANZUTTI kitchen." },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: Article,
});

function Article() {
  const { slug } = Route.useParams();
  const { data: a, isLoading } = useQuery({
    queryKey: ["article", slug],
    queryFn: async () => (await supabase.from("articles").select("*").eq("slug", slug).eq("status", "published").maybeSingle()).data,
  });
  if (isLoading) return <p className="p-10">Loading…</p>;
  if (!a) return <div className="p-10 text-center"><h1 className="text-4xl text-primary">Story not found</h1><Link to="/journal" className="mt-4 inline-block underline">Back to the Journal</Link></div>;
  return (
    <article className="mx-auto max-w-3xl px-4 pb-28 pt-10">
      <Link to="/journal" className="text-sm font-bold text-brand-red">← Journal</Link>
      <p className="mt-6 text-xs font-bold uppercase tracking-widest text-brand-red">{a.category}</p>
      <h1 className="mt-2 text-4xl text-primary md:text-6xl">{a.title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{a.author && `${a.author} · `}{a.published_at && new Date(a.published_at).toLocaleDateString()}</p>
      {a.cover_url && <img src={a.cover_url} alt="" className="mt-8 aspect-[16/9] w-full rounded-3xl object-cover" />}
      <div className="mt-8 space-y-5 text-lg leading-relaxed">
        {a.body.split(/\n{2,}/).map((para, i) => <p key={i} className="whitespace-pre-line">{para}</p>)}
      </div>
    </article>
  );
}
