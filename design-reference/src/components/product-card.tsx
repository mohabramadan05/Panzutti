import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { egp } from "@/lib/format";
import { RatingBadge } from "@/lib/reviews";
import { useCart } from "@/lib/cart";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shown when a product has no photo yet — never a stand-in food picture. */
export function PhotoPlaceholder({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground", className)}>
      <ImageOff className="h-6 w-6" />
      <span className="text-[10px] font-bold uppercase tracking-widest">Photo soon</span>
    </div>
  );
}

type P = { id: string; slug: string; name: string; description: string | null; price: number; image_url: string | null; is_available: boolean; option_groups?: { id: string }[]; short_description?: string | null; is_bestseller?: boolean; name_ar?: string | null };

export function ProductCard({ p }: { p: P }) {
  const { add } = useCart();
  const customizable = (p.option_groups?.length ?? 0) > 0;
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border/60 transition hover:-translate-y-0.5 hover:shadow-lg">
      <Link to="/menu/$slug" params={{ slug: p.slug }} className="relative block aspect-[4/3] overflow-hidden bg-muted">
        {p.image_url ? (
          <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <PhotoPlaceholder className="h-full w-full" />
        )}
        {!p.is_available && <span className="absolute left-3 top-3 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">Sold out</span>}
        {p.is_available && p.is_bestseller && <span className="absolute left-3 top-3 rounded-full bg-brand-yellow px-3 py-1 text-xs font-extrabold text-foreground">Bestseller</span>}
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link to="/menu/$slug" params={{ slug: p.slug }}><h3 className="text-lg text-primary">{p.name}</h3></Link>
        <RatingBadge productId={p.id} />
        {(p.short_description || p.description) && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.short_description || p.description}</p>}
        <div className="mt-auto pt-3">
          <span className="text-lg font-extrabold text-primary">{egp(p.price)}</span>
          {customizable ? (
            <Link to="/menu/$slug" params={{ slug: p.slug }} className="mt-3 block rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-primary-foreground">Add to Cart</Link>
          ) : (
            <button
              disabled={!p.is_available}
              onClick={() => {
                add({ product_id: p.id, slug: p.slug, name: p.name, image_url: p.image_url, base_price: Number(p.price), options: [], quantity: 1 });
                toast.success(`${p.name} added to your cart`);
              }}
              className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {p.is_available ? "Add to Cart" : "Sold out"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductRow({ p }: { p: P }) {
  const { add } = useCart();
  const customizable = (p.option_groups?.length ?? 0) > 0;
  return (
    <article className="flex items-center gap-4 rounded-3xl bg-card p-3 ring-1 ring-border/60">
      <Link to="/menu/$slug" params={{ slug: p.slug }} className="h-24 w-28 shrink-0 overflow-hidden rounded-2xl bg-muted sm:h-28 sm:w-36">
        {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" /> : <PhotoPlaceholder className="h-full w-full" />}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to="/menu/$slug" params={{ slug: p.slug }}><h3 className="text-lg text-primary">{p.name}</h3></Link>
        <RatingBadge productId={p.id} />
        {p.is_bestseller && <span className="mr-2 rounded-full bg-brand-yellow px-2 py-0.5 text-[10px] font-extrabold">Bestseller</span>}
        {(p.short_description || p.description) && <p className="line-clamp-2 text-sm text-muted-foreground">{p.short_description || p.description}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-extrabold text-primary">{egp(p.price)}</span>
          {customizable ? (
            <Link to="/menu/$slug" params={{ slug: p.slug }} className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">Add to Cart +</Link>
          ) : (
            <button disabled={!p.is_available} onClick={() => { add({ product_id: p.id, slug: p.slug, name: p.name, image_url: p.image_url, base_price: Number(p.price), options: [], quantity: 1 }); toast.success(`${p.name} added`); }}
              className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40">{p.is_available ? "Add to Cart +" : "Sold out"}</button>
          )}
        </div>
      </div>
    </article>
  );
}
