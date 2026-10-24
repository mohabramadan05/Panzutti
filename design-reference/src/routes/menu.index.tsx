import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Sandwich, Salad, CakeSlice, CupSoda, Drumstick, Coffee } from "lucide-react";
import { categoriesQuery, productsQuery } from "@/lib/data";
import { ProductRow } from "@/components/product-card";
import { OrderTypeBar, CartBar } from "@/components/order-bar";
import { useCart } from "@/lib/cart";
import { Skeleton } from "@/components/ui/skeleton";
import banner from "@/assets/chicken-parm.jpg.asset.json";

export const Route = createFileRoute("/menu/")({
  validateSearch: z.object({ type: z.enum(["delivery", "pickup", "dine_in"]).optional() }),
  head: () => ({
    meta: [
      { title: "Menu — PANZUTTI Panuozzo & More" },
      { name: "description", content: "Breakfast and lunch panuozzi, sides, salads, desserts and drinks. Order for delivery or pickup in Heliopolis." },
      { property: "og:title", content: "PANZUTTI Menu" },
      { property: "og:description", content: "Sourdough panuozzi, baked or fried, plus sides, salads and desserts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MenuPage,
});

const iconFor = (slug: string) =>
  slug.includes("breakfast") ? Coffee : slug.includes("panuozz") ? Sandwich : slug.includes("salad") ? Salad : slug.includes("dessert") ? CakeSlice : slug.includes("drink") ? CupSoda : Drumstick;

function MenuPage() {
  const { data: cats, isLoading: lc } = useQuery(categoriesQuery);
  const { data: products, isLoading: lp } = useQuery(productsQuery);
  const visible = (cats ?? []).filter((c) => (products ?? []).some((p) => p.category_id === c.id));
  const [active, setActive] = useState<string | null>(null);
  const { type } = Route.useSearch();
  const { setFulfillment } = useCart();
  // Arriving from Order Now (or a shared link) opens the menu in that mode.
  useEffect(() => {
    if (type) setFulfillment(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);
  const current = visible.find((c) => c.id === active) ?? visible[0];

  return (
    <div className="pb-44 md:pb-28">
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 md:grid-cols-2">
          <div className="py-10">
            <h1 className="text-5xl md:text-6xl">Our Menu</h1>
            <p className="mt-3 text-lg opacity-90">Fresh ingredients. Authentic flavors. Always.</p>
          </div>
          <img src={banner.url} alt="" className="hidden h-56 w-full rounded-l-[3rem] object-cover md:block" />
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <div className="-mt-6 flex gap-3 overflow-x-auto pb-2">
          {visible.map((c) => {
            const Icon = iconFor(c.slug);
            const on = current?.id === c.id;
            return (
              <button key={c.id} onClick={() => setActive(c.id)} className={`flex w-28 shrink-0 flex-col items-center gap-2 rounded-2xl p-4 text-xs font-bold shadow-sm ring-1 ${on ? "bg-card ring-2 ring-primary" : "bg-card ring-border"}`}>
                <Icon className="h-7 w-7 text-primary" />
                {c.name}
              </button>
            );
          })}
        </div>

        <OrderTypeBar className="mt-4" />

        {(lc || lp) && <div className="mt-8 space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>}
        {!lc && !lp && visible.length === 0 && (
          <p className="mt-8 rounded-3xl bg-card p-10 text-center text-muted-foreground">The menu is being prepared. Please check back soon.</p>
        )}
        {current && (
          <section className="mt-8">
            <h2 className="text-4xl text-primary">{current.name}</h2>
            {current.description && <p className="mt-1 text-muted-foreground">{current.description}</p>}
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {(products ?? []).filter((p) => p.category_id === current.id).map((p) => <ProductRow key={p.id} p={p} />)}
            </div>
          </section>
        )}
      </div>
      <CartBar />
    </div>
  );
}
