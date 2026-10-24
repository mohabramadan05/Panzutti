import Image from "next/image";
import Link from "next/link";
import { ImageOff, Sparkles } from "lucide-react";
import { AddToCartButton } from "./add-to-cart-button";
import type { MenuItem } from "@/lib/data";
import type { Dictionary, Locale } from "@/lib/i18n";
import { egp } from "@/lib/format";

export function ProductCard({ item, locale, t }: { item: MenuItem; locale: Locale; t: Dictionary["bestsellers"] }) {
  const name = locale === "ar" ? item.name_ar : item.name_en;
  const desc = locale === "ar" ? item.description_ar ?? item.description_en : item.description_en;
  const href = `/${locale}/menu/${item.slug}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[1.75rem] bg-card shadow-sm ring-1 ring-border/70 transition duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10">
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden bg-muted" tabIndex={-1} aria-hidden>
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt=""
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
          </div>
        )}
        {item.is_signature && (
          <span className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-brand-yellow px-3 py-1 text-xs font-extrabold text-foreground shadow">
            <Sparkles className="h-3 w-3" aria-hidden /> {t.signature}
          </span>
        )}
        {item.is_sold_out && (
          <span className="absolute end-3 top-3 rounded-full bg-foreground px-3 py-1 text-xs font-bold text-background">{t.soldOut}</span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl text-primary">
          <Link href={href} className="after:absolute after:inset-0">{name}</Link>
        </h3>
        {desc && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{desc}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="text-lg font-extrabold text-primary">{egp(item.price, locale)}</span>
          <AddToCartButton
            product={{ id: item.id, slug: item.slug, name_en: item.name_en, name_ar: item.name_ar, price: item.price, image_url: item.image_url }}
            defaultAddons={(item.addon_groups ?? []).flatMap((g) =>
              g.addons
                .filter((a) => a.is_default && !a.is_sold_out)
                .slice(0, g.max_select)
                .map((a) => ({ id: a.id, group_id: g.id, name_en: a.name_en, name_ar: a.name_ar, price: a.price, quantity: 1 })),
            )}
            needsChoice={(item.addon_groups ?? []).some((g) => g.min_select > 0)}
            soldOut={item.is_sold_out}
            locale={locale}
            labels={{ add: t.add, added: t.added, choose: t.choose, name }}
          />
        </div>
      </div>
    </article>
  );
}
