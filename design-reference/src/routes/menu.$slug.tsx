import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { productQuery } from "@/lib/data";
import { useCart, type CartOption } from "@/lib/cart";
import { egp } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PhotoPlaceholder } from "@/components/product-card";
import { ProductReviews } from "@/components/product-reviews";
import { RatingBadge } from "@/lib/reviews";

export const Route = createFileRoute("/menu/$slug")({
  validateSearch: z.object({ edit: z.string().optional() }),
  head: ({ params }) => {
    const name = params.slug.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ");
    return {
      meta: [
        { title: `${name} — PANZUTTI` },
        { name: "description", content: `${name}: a freshly made sourdough panuozzo from PANZUTTI, Heliopolis.` },
        { property: "og:title", content: `${name} — PANZUTTI` },
        { property: "og:description", content: `Order ${name} for delivery or pickup.` },
        { property: "og:type", content: "product" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { data: p, isLoading } = useQuery(productQuery(slug));
  const { add, replace, lines } = useCart();
  const { edit } = Route.useSearch();
  const editing = edit ? lines.find((l) => l.key === edit && l.slug === slug) : undefined;
  const navigate = useNavigate();
  const [sel, setSel] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);
  // Editing a cart item: start from what the customer already picked.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!editing || !p || prefilled.current) return;
    prefilled.current = true;
    const byGroup: Record<string, string[]> = {};
    for (const g of p.option_groups ?? []) {
      const ids = g.options.map((o) => o.id);
      byGroup[g.id] = editing.options.filter((o) => ids.includes(o.id)).map((o) => o.id);
    }
    setSel(byGroup);
    setQty(editing.quantity);
    setNotes(editing.notes ?? "");
  }, [editing, p]);

  const groups = useMemo(
    () => [...(p?.option_groups ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((g) => ({ ...g, options: [...g.options].filter((o) => o.is_available).sort((a, b) => a.sort_order - b.sort_order) })),
    [p],
  );
  const chosen: CartOption[] = groups.flatMap((g) => g.options.filter((o) => sel[g.id]?.includes(o.id)).map((o) => ({ id: o.id, group: g.name, name: o.name, price_delta: Number(o.price_delta) })));
  const missing = groups.filter((g) => g.is_required && (sel[g.id]?.length ?? 0) < Math.max(g.min_select, 1));
  const unit = Number(p?.price ?? 0) + chosen.reduce((s, o) => s + o.price_delta, 0);

  if (isLoading) return <div className="mx-auto max-w-5xl p-4"><Skeleton className="h-96 rounded-3xl" /></div>;
  if (!p)
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <h1 className="text-4xl text-primary">Not on the menu</h1>
        <Link to="/menu" className="mt-6 inline-block font-bold underline">Back to menu</Link>
      </div>
    );

  const toggle = (gid: string, oid: string, max: number) =>
    setSel((s) => {
      const cur = s[gid] ?? [];
      if (cur.includes(oid)) return { ...s, [gid]: cur.filter((x) => x !== oid) };
      if (max === 1) return { ...s, [gid]: [oid] };
      if (max > 0 && cur.length >= max) return s;
      return { ...s, [gid]: [...cur, oid] };
    });

  const submit = () => {
    setTried(true);
    if (missing.length) return toast.error(`Please choose ${missing.map((m) => m.name.toLowerCase()).join(" and ")}`);
    const line = { product_id: p.id, slug: p.slug, name: p.name, image_url: p.image_url, base_price: Number(p.price), options: chosen, quantity: qty, notes: notes.trim() || undefined };
    if (editing) {
      replace(editing.key, line);
      toast.success(`${p.name} updated`);
      navigate({ to: "/cart" });
      return;
    }
    add(line);
    toast.success(`${p.name} added`, { action: { label: "View cart", onClick: () => navigate({ to: "/cart" }) } });
    setQty(1);
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-40 pt-6 md:grid-cols-2 md:pb-16 md:pt-12">
      <div>
        {p.image_url ? <img src={p.image_url} alt={p.name} className="aspect-square w-full rounded-[2rem] object-cover" /> : <PhotoPlaceholder className="aspect-square w-full rounded-[2rem]" />}
        {p.gallery?.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-3">{p.gallery.map((g) => <img key={g} src={g} alt="" className="aspect-square rounded-xl object-cover" />)}</div>
        )}
      </div>
      <div>
        {editing ? (
          <Link to="/cart" className="text-sm font-bold text-brand-red">← Back to cart</Link>
        ) : (
          <Link to="/menu" className="text-sm font-bold text-brand-red">← {p.categories?.name ?? "Menu"}</Link>
        )}
        <h1 className="mt-3 text-5xl text-primary">{p.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-2xl font-extrabold">{egp(p.price)}</p><a href="#reviews"><RatingBadge productId={p.id} /></a></div>
        {p.description && <p className="mt-4 text-lg text-foreground/80">{p.description}</p>}
        {p.ingredients && <p className="mt-3 text-sm"><b>Ingredients:</b> {p.ingredients}</p>}
        {p.allergens && <p className="mt-1 text-sm"><b>Allergens:</b> {p.allergens}</p>}
        {p.prep_notes && <p className="mt-1 text-sm text-muted-foreground">{p.prep_notes}</p>}

        <div className="mt-8 space-y-6">
          {groups.map((g) => {
            const bad = tried && missing.some((m) => m.id === g.id);
            return (
              <fieldset key={g.id} className="min-w-0">
                <legend className="mb-2 font-extrabold">
                  {g.name}{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${g.is_required ? "bg-brand-red text-brand-cream" : "bg-muted"}`}>
                    {g.is_required ? "Required" : g.max_select > 1 ? `Optional · up to ${g.max_select}` : "Optional"}
                  </span>
                </legend>
                <div className={`rounded-2xl p-4 ring-1 ${bad ? "ring-destructive" : "ring-border"}`}>
                  <div className="flex flex-wrap gap-2">
                    {g.options.map((o) => {
                      const on = sel[g.id]?.includes(o.id);
                      return (
                        <button key={o.id} type="button" onClick={() => toggle(g.id, o.id, g.max_select)} aria-pressed={on}
                          className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${on ? "bg-primary text-primary-foreground ring-primary" : "bg-card ring-border"}`}>
                          {o.name}{Number(o.price_delta) > 0 && ` +${egp(o.price_delta)}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </fieldset>
            );
          })}
          <div>
            <label htmlFor="notes" className="font-extrabold">Special requests</label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="e.g. no pickles" className="mt-2 bg-card" />
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background/95 p-4 backdrop-blur md:static md:mt-8 md:border-0 md:bg-transparent md:p-0">
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="flex items-center rounded-full bg-card ring-1 ring-border">
              <button className="p-3" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Less"><Minus className="h-4 w-4" /></button>
              <span className="w-8 text-center font-bold">{qty}</span>
              <button className="p-3" onClick={() => setQty((q) => Math.min(50, q + 1))} aria-label="More"><Plus className="h-4 w-4" /></button>
            </div>
            <button disabled={!p.is_available} onClick={submit} className="flex-1 rounded-full bg-brand-red px-6 py-4 font-extrabold text-brand-cream disabled:opacity-40">
              {!p.is_available ? "Sold out" : editing ? `Update item · ${egp(unit * qty)}` : `Add to cart · ${egp(unit * qty)}`}
            </button>
          </div>
        </div>
      </div>
      <ProductReviews productId={p.id} />
    </div>
  );
}
