/**
 * Stock photos used by the /pizza "making of" page (Unsplash License: free for commercial use,
 * no attribution required, but we credit anyway). Hotlinked from images.unsplash.com as Unsplash
 * asks; `w` picks a size that stays sharp on 2x screens at the largest pizza size (560px).
 *
 * Each crop says which part of the photo to show: centre (cx, cy) as fractions of the photo's
 * width/height, and the visible diameter `d` as a fraction of the photo's width.
 * Swap any `id` + crop for Panzutti's own photos later — nothing else changes.
 */

export type PhotoCrop = {
  src: string;
  /** photo width / height */
  ar: number;
  cx: number;
  cy: number;
  d: number;
};

const unsplash = (id: string, w: number) => `https://images.unsplash.com/${id}?w=${w}&q=75&auto=format&fit=max`;

export const PIZZA_PHOTOS = {
  // raw dough stretched on a floured board — the board ring stays visible around the dough
  crust: { src: unsplash("photo-1607207504006-89723ee11236", 1800), ar: 1.5, cx: 0.495, cy: 0.565, d: 0.573 },
  // sauce spiral; centred left of the ladle so it never shows
  sauce: { src: unsplash("photo-1754799565094-14f6e224aa9f", 1600), ar: 2 / 3, cx: 0.4, cy: 0.53, d: 0.52 },
  // shredded mozzarella over sauce
  cheese: { src: unsplash("photo-1777333033402-f53f5eb3e5c6", 1800), ar: 2 / 3, cx: 0.55, cy: 0.6, d: 0.4 },
  // one clean pepperoni slice from a pepperoni pizza close-up
  pepperoni: { src: unsplash("photo-1607929298871-fbdcf7e84852", 800), ar: 2 / 3, cx: 0.645, cy: 0.19, d: 0.24 },
  // the large leaf on the left of a basil sprig (tip points left)
  basil: { src: unsplash("photo-1758657996602-717fa28bc0b7", 600), ar: 1793 / 1200, cx: 0.235, cy: 0.535, d: 0.4 },
} satisfies Record<string, PhotoCrop>;

export const PIZZA_PHOTO_CREDITS = [
  { what: "Dough", by: "@philhearing", href: "https://unsplash.com/photos/white-dough-on-brown-wooden-table-32w8MNBuxPk" },
  { what: "Sauce", by: "@arikurniawan", href: "https://unsplash.com/photos/sauce-being-spread-on-pizza-dough-in-a-spiral-0RVTziyKRB8" },
  { what: "Mozzarella", by: "@brelynkk", href: "https://unsplash.com/photos/pizza-dough-with-tomato-sauce-and-cheese-okeZ3BpuH18" },
  { what: "Pepperoni", by: "@rfrsrh", href: "https://unsplash.com/photos/brown-and-white-pizza-with-cheese-x_QDFM3tzgA" },
  { what: "Basil", by: "@weareqed", href: "https://unsplash.com/photos/fresh-basil-leaves-on-a-dark-textured-surface-DDKdfRe1GxA" },
];
