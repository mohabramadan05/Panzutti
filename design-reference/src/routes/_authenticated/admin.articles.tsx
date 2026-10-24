import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/data";
import { errMsg, slugify } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { Database } from "@/integrations/supabase/types";

type A = Database["public"]["Tables"]["articles"]["Row"];
export const Route = createFileRoute("/_authenticated/admin/articles")({ component: Articles });

function Articles() {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({ queryKey: ["admin-articles"], queryFn: async () => (await supabase.from("articles").select("*").order("created_at", { ascending: false })).data ?? [] });
  const [e, setE] = useState<Partial<A> | null>(null);
  const save = async () => {
    if (!e?.title?.trim()) return toast.error("Title required");
    const publishing = e.status === "published";
    const row = { title: e.title.trim(), slug: e.slug || slugify(e.title), excerpt: e.excerpt || null, body: e.body ?? "", cover_url: e.cover_url || null, category: e.category || null, author: e.author || null, status: e.status ?? "draft", is_featured: !!e.is_featured, published_at: publishing ? e.published_at ?? new Date().toISOString() : e.published_at ?? null };
    const { error } = e.id ? await supabase.from("articles").update(row).eq("id", e.id) : await supabase.from("articles").insert(row);
    if (error) return toast.error(errMsg(error));
    toast.success("Saved"); setE(null); refetch(); qc.invalidateQueries({ queryKey: ["articles"] });
  };
  if (e)
    return (
      <div className="max-w-3xl space-y-3">
        <button className="text-sm font-bold" onClick={() => setE(null)}>← Back</button>
        <h1 className="text-3xl text-primary">{e.id ? "Edit article" : "New article"}</h1>
        <Input placeholder="Title" value={e.title ?? ""} onChange={(x) => setE({ ...e, title: x.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder="Category (e.g. Our Story)" value={e.category ?? ""} onChange={(x) => setE({ ...e, category: x.target.value })} />
          <Input placeholder="Author" value={e.author ?? ""} onChange={(x) => setE({ ...e, author: x.target.value })} />
        </div>
        <Textarea placeholder="Short excerpt" value={e.excerpt ?? ""} onChange={(x) => setE({ ...e, excerpt: x.target.value })} />
        <Textarea placeholder="Article text (blank line between paragraphs)" className="min-h-72" value={e.body ?? ""} onChange={(x) => setE({ ...e, body: x.target.value })} />
        <div className="flex items-center gap-3">{e.cover_url && <img src={e.cover_url} alt="" className="h-16 w-24 rounded-lg object-cover" />}
          <input type="file" accept="image/*" onChange={async (x) => { const f = x.target.files?.[0]; if (!f) return; try { setE({ ...e, cover_url: await uploadMedia(f, "articles") }); } catch (er) { toast.error(errMsg(er)); } }} /></div>
        <div className="flex gap-5 text-sm">
          <label className="flex items-center gap-2"><Switch checked={e.status === "published"} onCheckedChange={(v) => setE({ ...e, status: v ? "published" : "draft" })} />Published</label>
          <label className="flex items-center gap-2"><Switch checked={!!e.is_featured} onCheckedChange={(v) => setE({ ...e, is_featured: v })} />Show on homepage</label>
        </div>
        <button onClick={save} className="rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">Save</button>
      </div>
    );
  return (
    <div>
      <div className="flex items-center justify-between"><h1 className="text-3xl text-primary md:text-4xl">Articles</h1><button className="rounded-full bg-brand-red px-5 py-2 font-bold text-brand-cream" onClick={() => setE({ status: "draft" })}>New article</button></div>
      <div className="mt-6 space-y-2">
        {!data?.length && <p className="text-muted-foreground">No articles yet.</p>}
        {data?.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-2xl bg-card p-4 ring-1 ring-border">
            <div><b>{a.title}</b> <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs">{a.status}</span></div>
            <div className="flex gap-3 text-sm"><button className="font-bold underline" onClick={() => setE(a)}>Edit</button><button className="text-destructive" onClick={async () => { if (confirm("Delete article?")) { await supabase.from("articles").delete().eq("id", a.id); refetch(); } }}>Delete</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
