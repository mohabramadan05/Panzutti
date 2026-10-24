import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { uploadMedia } from "@/lib/data";
import { egp, errMsg, slugify } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];
export const Route = createFileRoute("/_authenticated/admin/menu")({ component: AdminMenu });

function AdminMenu() {
  const qc = useQueryClient();
  const { data: cats, refetch: refCats } = useQuery({ queryKey: ["admin-cats"], queryFn: async () => (await supabase.from("categories").select("*").order("sort_order")).data ?? [] });
  const { data: products, refetch } = useQuery({ queryKey: ["admin-products"], queryFn: async () => (await supabase.from("products").select("*").order("sort_order")).data ?? [] });
  const [edit, setEdit] = useState<Partial<Product> | null>(null);
  const [newCat, setNewCat] = useState("");
  const invalidate = () => { refetch(); refCats(); qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["categories"] }); };

  const quick = async (id: string, patch: Partial<Product>) => {
    if (patch.is_published && Number(products?.find((p) => p.id === id)?.price) <= 0) return toast.error("Set a price before publishing");
    const { error } = await supabase.from("products").update(patch).eq("id", id);
    if (error) toast.error(errMsg(error)); else invalidate();
  };

  const duplicate = async (p: Product) => {
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = p;
    const slug = `${p.slug}-copy-${Date.now().toString(36).slice(-4)}`;
    const { data: np, error } = await supabase.from("products").insert({ ...rest, name: `${p.name} (copy)`, slug, is_published: false }).select("id").single();
    if (error || !np) return toast.error(errMsg(error));
    const { data: groups } = await supabase.from("option_groups").select("*, options(*)").eq("product_id", p.id);
    for (const g of groups ?? []) {
      const { data: ng } = await supabase.from("option_groups").insert({ product_id: np.id, name: g.name, is_required: g.is_required, min_select: g.min_select, max_select: g.max_select, sort_order: g.sort_order }).select("id").single();
      if (ng && g.options.length) await supabase.from("options").insert(g.options.map((o) => ({ group_id: ng.id, name: o.name, price_delta: o.price_delta, is_available: o.is_available, sort_order: o.sort_order })));
    }
    toast.success("Duplicated — it's unpublished until you check it");
    invalidate();
  };
  const remove = async (p: Product) => {
    if (!confirm(`Delete “${p.name}” permanently? Past orders keep their own copy of the name and price.`)) return;
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) toast.error(`Couldn't delete: ${errMsg(error)}. You can unpublish it instead.`); else { toast.success("Deleted"); invalidate(); }
  };

  return (
    <div>
      <h1 className="text-3xl text-primary md:text-4xl">Menu</h1>
      <section className="mt-6 rounded-3xl bg-card p-5 ring-1 ring-border">
        <h2 className="text-xl text-primary">Categories</h2>
        <div className="mt-3 space-y-2">
          {cats?.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <Input className="min-w-0 flex-1 sm:w-56 sm:flex-none" defaultValue={c.name} onBlur={async (e) => { if (e.target.value !== c.name) { await supabase.from("categories").update({ name: e.target.value }).eq("id", c.id); invalidate(); } }} />
              <Input className="w-20" type="number" defaultValue={c.sort_order} onBlur={async (e) => { await supabase.from("categories").update({ sort_order: +e.target.value }).eq("id", c.id); invalidate(); }} />
              <label className="flex items-center gap-2 text-sm"><Switch checked={c.is_visible} onCheckedChange={async (v) => { await supabase.from("categories").update({ is_visible: v }).eq("id", c.id); invalidate(); }} /> Visible</label>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input className="min-w-0 flex-1 sm:w-56 sm:flex-none" placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="rounded-full bg-primary px-4 font-bold text-primary-foreground" onClick={async () => {
              if (!newCat.trim()) return;
              const { error } = await supabase.from("categories").insert({ name: newCat.trim(), slug: slugify(newCat), sort_order: (cats?.length ?? 0) + 1 });
              if (error) toast.error(errMsg(error)); else { setNewCat(""); invalidate(); }
            }}>Add</button>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl text-primary">Products</h2>
          <button className="rounded-full bg-brand-red px-5 py-2 font-bold text-brand-cream" onClick={() => setEdit({ name: "", price: 0, prep_minutes: 10, category_id: cats?.[0]?.id, is_available: true, is_published: false, gallery: [] })}>New product</button>
        </div>
        {/* Phones: one card per product */}
        <ul className="mt-3 space-y-3 md:hidden">
          {products?.map((p) => (
            <li key={p.id} className="rounded-2xl bg-card p-3 ring-1 ring-border">
              <div className="flex items-center gap-3">
                {p.image_url ? <img src={p.image_url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" /> : <span className="h-14 w-14 shrink-0 rounded-xl bg-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{cats?.find((c) => c.id === p.category_id)?.name}</p>
                  <p className="text-sm font-bold">{Number(p.price) > 0 ? egp(p.price) : <span className="text-destructive">No price</span>}</p>
                </div>
                <label className="flex flex-col items-center gap-1 text-[10px] font-bold">Prep
                  <Input className="h-8 w-14 text-center" type="number" min={0} max={240} defaultValue={p.prep_minutes} onBlur={(e) => { const v = Math.min(240, Math.max(0, Math.round(+e.target.value || 0))); if (v !== p.prep_minutes) quick(p.id, { prep_minutes: v }); }} />
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold">
                <label className="flex items-center gap-2"><Switch checked={p.is_published} onCheckedChange={(v) => quick(p.id, { is_published: v })} />Published</label>
                <label className="flex items-center gap-2"><Switch checked={p.is_available} onCheckedChange={(v) => quick(p.id, { is_available: v })} />Available</label>
                <label className="flex items-center gap-2"><Switch checked={p.is_featured} onCheckedChange={(v) => quick(p.id, { is_featured: v })} />Featured</label>
                <label className="flex items-center gap-2"><Switch checked={p.is_bestseller} onCheckedChange={(v) => quick(p.id, { is_bestseller: v })} />Bestseller</label>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-sm font-bold">
                <button className="rounded-full bg-primary py-2 text-primary-foreground" onClick={() => setEdit(p)}>Edit</button>
                <button className="rounded-full py-2 ring-1 ring-border" onClick={() => duplicate(p)}>Duplicate</button>
                <button className="rounded-full py-2 text-destructive ring-1 ring-destructive/40" onClick={() => remove(p)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-3 hidden overflow-x-auto rounded-3xl bg-card ring-1 ring-border md:block">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th className="p-3">Product</th><th>Category</th><th>Price</th><th title="Preparation minutes">Prep</th><th>Published</th><th>Available</th><th>Featured</th><th>Bestseller</th><th></th></tr></thead>
            <tbody>
              {products?.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="flex items-center gap-2 p-3">{p.image_url ? <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="h-10 w-10 rounded-lg bg-muted" />}<b>{p.name}</b></td>
                  <td>{cats?.find((c) => c.id === p.category_id)?.name}</td>
                  <td>{Number(p.price) > 0 ? egp(p.price) : <span className="text-destructive">No price</span>}</td>
                  <td><Input className="h-8 w-16" type="number" min={0} max={240} defaultValue={p.prep_minutes} onBlur={(e) => { const v = Math.min(240, Math.max(0, Math.round(+e.target.value || 0))); if (v !== p.prep_minutes) quick(p.id, { prep_minutes: v }); }} /></td>
                  <td><Switch checked={p.is_published} onCheckedChange={(v) => quick(p.id, { is_published: v })} /></td>
                  <td><Switch checked={p.is_available} onCheckedChange={(v) => quick(p.id, { is_available: v })} /></td>
                  <td><Switch checked={p.is_featured} onCheckedChange={(v) => quick(p.id, { is_featured: v })} /></td>
                  <td><Switch checked={p.is_bestseller} onCheckedChange={(v) => quick(p.id, { is_bestseller: v })} /></td>
                  <td className="whitespace-nowrap pr-3">
                    <button className="font-bold underline" onClick={() => setEdit(p)}>Edit</button>
                    <button className="ml-3 text-muted-foreground underline" onClick={() => duplicate(p)}>Duplicate</button>
                    <button className="ml-3 text-destructive underline" onClick={() => remove(p)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
          {edit && <ProductForm p={edit} cats={cats ?? []} onDone={() => { setEdit(null); invalidate(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductForm({ p, cats, onDone }: { p: Partial<Product>; cats: { id: string; name: string }[]; onDone: () => void }) {
  const [f, setF] = useState<Partial<Product>>(p);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name?.trim()) return toast.error("Name is required");
    if (f.is_published && Number(f.price) <= 0) return toast.error("Set a price before publishing");
    setBusy(true);
    const row = { name: f.name.trim(), name_ar: f.name_ar?.trim() || null, short_description: f.short_description?.trim() || null, prep_minutes: Math.min(240, Math.max(0, Math.round(Number(f.prep_minutes ?? 10)))), is_bestseller: f.is_bestseller ?? false, slug: f.slug || slugify(f.name), description: f.description || null, ingredients: f.ingredients || null, allergens: f.allergens || null, prep_notes: f.prep_notes || null, price: Number(f.price) || 0, category_id: f.category_id || null, image_url: f.image_url || null, gallery: f.gallery ?? [], is_available: f.is_available ?? true, is_published: f.is_published ?? false, is_featured: f.is_featured ?? false, sort_order: Number(f.sort_order) || 0 };
    const { error } = f.id ? await supabase.from("products").update(row).eq("id", f.id) : await supabase.from("products").insert(row);
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    toast.success("Saved"); onDone();
  };
  const upload = async (file?: File, gallery = false) => {
    if (!file) return;
    const t = toast.loading("Uploading photo…");
    try {
      const url = await uploadMedia(file, "products");
      const patch = gallery ? { gallery: [...(f.gallery ?? []), url] } : { image_url: url };
      setF((x) => ({ ...x, ...patch }));
      if (f.id) {
        const { error } = await supabase.from("products").update(patch).eq("id", f.id);
        if (error) throw error;
        toast.success("Photo saved — it now shows on the website", { id: t });
      } else toast.success("Photo added — press Save product to keep it", { id: t });
    } catch (e) { toast.error(errMsg(e), { id: t }); }
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Name (English)</Label><Input value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><Label>Name (Arabic)</Label><Input dir="rtl" value={f.name_ar ?? ""} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></div>
        <div><Label>Price (EGP)</Label><Input type="number" min={0} value={f.price ?? 0} onChange={(e) => setF({ ...f, price: +e.target.value })} /></div>
        <div><Label>Category</Label>
          <select className="w-full rounded-md border border-input bg-background px-3 py-2" value={f.category_id ?? ""} onChange={(e) => setF({ ...f, category_id: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        <div><Label>Sort order</Label><Input type="number" value={f.sort_order ?? 0} onChange={(e) => setF({ ...f, sort_order: +e.target.value })} /></div>
        <div><Label>Preparation time (minutes)</Label><Input type="number" min={0} max={240} value={f.prep_minutes ?? 10} onChange={(e) => setF({ ...f, prep_minutes: +e.target.value })} /><p className="mt-0.5 text-xs text-muted-foreground">Used to estimate when orders are ready.</p></div>
      </div>
      <div><Label>Short description</Label><Input maxLength={140} value={f.short_description ?? ""} onChange={(e) => setF({ ...f, short_description: e.target.value })} /></div>
      <div><Label>Full description</Label><Textarea value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label>Ingredients</Label><Textarea value={f.ingredients ?? ""} onChange={(e) => setF({ ...f, ingredients: e.target.value })} /></div>
        <div><Label>Allergens (verified only)</Label><Textarea value={f.allergens ?? ""} onChange={(e) => setF({ ...f, allergens: e.target.value })} /></div>
      </div>
      <div><Label>Preparation notes</Label><Input value={f.prep_notes ?? ""} onChange={(e) => setF({ ...f, prep_notes: e.target.value })} /></div>
      <div>
        <Label>Main photo <span className="font-normal text-muted-foreground">(up to 50 MB)</span></Label>
        <div className="mt-1 flex items-center gap-3">{f.image_url && <img src={f.image_url} alt="" className="h-16 w-16 rounded-lg object-cover" />}<input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0])} /></div>
      </div>
      <div>
        <Label>Gallery <span className="font-normal text-muted-foreground">(up to 50 MB each)</span></Label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {f.gallery?.map((g) => <button key={g} onClick={() => setF({ ...f, gallery: f.gallery!.filter((x) => x !== g) })} title="Remove"><img src={g} alt="" className="h-14 w-14 rounded-lg object-cover" /></button>)}
          <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0], true)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2"><Switch checked={!!f.is_published} onCheckedChange={(v) => setF({ ...f, is_published: v })} />Published</label>
        <label className="flex items-center gap-2"><Switch checked={f.is_available ?? true} onCheckedChange={(v) => setF({ ...f, is_available: v })} />Available</label>
        <label className="flex items-center gap-2"><Switch checked={!!f.is_featured} onCheckedChange={(v) => setF({ ...f, is_featured: v })} />Featured</label>
        <label className="flex items-center gap-2"><Switch checked={!!f.is_bestseller} onCheckedChange={(v) => setF({ ...f, is_bestseller: v })} />Bestseller</label>
      </div>
      <button disabled={busy} onClick={save} className="w-full rounded-full bg-primary py-3 font-bold text-primary-foreground">{busy ? "Saving…" : "Save product"}</button>
      {f.id && <OptionsEditor productId={f.id} />}
    </div>
  );
}

function OptionsEditor({ productId }: { productId: string }) {
  const { data: groups, refetch } = useQuery({ queryKey: ["admin-groups", productId], queryFn: async () => (await supabase.from("option_groups").select("*, options(*)").eq("product_id", productId).order("sort_order")).data ?? [] });
  const [g, setG] = useState({ name: "", is_required: false, min_select: 0, max_select: 1 });
  const run = async (p: PromiseLike<{ error: unknown }>) => { const { error } = await p; if (error) toast.error(errMsg(error)); refetch(); };
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-lg text-primary">Choices & extras</h3>
      {groups?.map((gr) => (
        <div key={gr.id} className="rounded-2xl bg-muted p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b>{gr.name} <span className="text-xs font-normal">({gr.is_required ? "required" : "optional"}, choose {gr.min_select}–{gr.max_select})</span></b>
            <button className="text-sm text-destructive" onClick={() => run(supabase.from("option_groups").delete().eq("id", gr.id))}>Delete group</button>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {[...gr.options].sort((a, b) => a.sort_order - b.sort_order).map((o) => (
              <li key={o.id} className="flex items-center gap-2">
                <span className="flex-1">{o.name}</span>
                <Input className="h-8 w-24" type="number" defaultValue={o.price_delta} onBlur={(e) => run(supabase.from("options").update({ price_delta: +e.target.value }).eq("id", o.id))} />
                <Switch checked={o.is_available} onCheckedChange={(v) => run(supabase.from("options").update({ is_available: v }).eq("id", o.id))} />
                <button className="text-destructive" onClick={() => run(supabase.from("options").delete().eq("id", o.id))}>×</button>
              </li>
            ))}
          </ul>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); const n = String(fd.get("n") || "").trim(); if (!n) return; run(supabase.from("options").insert({ group_id: gr.id, name: n, price_delta: Number(fd.get("p") || 0), sort_order: gr.options.length + 1 })); e.currentTarget.reset(); }}>
            <Input name="n" placeholder="Option name" className="h-8" /><Input name="p" type="number" placeholder="+EGP" className="h-8 w-24" /><button className="rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground">Add</button>
          </form>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-44" placeholder="New group (e.g. Size)" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} />
        <label className="flex items-center gap-1 text-sm"><Switch checked={g.is_required} onCheckedChange={(v) => setG({ ...g, is_required: v })} />Required</label>
        <Input className="w-20" type="number" min={0} value={g.min_select} onChange={(e) => setG({ ...g, min_select: Math.max(0, +e.target.value) })} title="Min choices" placeholder="Min" />
        <Input className="w-20" type="number" min={1} value={g.max_select} onChange={(e) => setG({ ...g, max_select: Math.max(1, +e.target.value) })} title="Max choices" placeholder="Max" />
        <button className="rounded-full bg-accent px-4 py-2 text-sm font-bold" onClick={() => { if (!g.name.trim()) return; run(supabase.from("option_groups").insert({ product_id: productId, name: g.name.trim(), is_required: g.is_required || g.min_select > 0, min_select: g.is_required ? Math.max(1, g.min_select) : g.min_select, max_select: Math.max(g.max_select, g.min_select, 1), sort_order: (groups?.length ?? 0) + 1 })); setG({ name: "", is_required: false, min_select: 0, max_select: 1 }); }}>Add group</button>
      </div>
    </div>
  );
}
