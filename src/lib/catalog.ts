import type { MenuCategory } from "./data";

/**
 * Compact view of what can be ordered right now, passed from server pages to the cart/checkout
 * so stale cart lines (price changed, sold out, removed from the menu) are caught before ordering.
 */
export type Catalog = Record<string, { price: number; sold: boolean; addons: Record<string, { price: number; sold: boolean }> }>;

export const buildCatalog = (categories: MenuCategory[]): Catalog =>
  Object.fromEntries(
    categories.flatMap((c) =>
      c.items.map((i) => [
        i.id,
        {
          price: i.price,
          sold: i.is_sold_out,
          addons: Object.fromEntries((i.addon_groups ?? []).flatMap((g) => g.addons.map((a) => [a.id, { price: a.price, sold: a.is_sold_out }]))),
        },
      ]),
    ),
  );
