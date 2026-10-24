import { cache } from "react";
import { supabase } from "./supabase";
import { fetchFamilyPage } from "./family";

export type MenuItem = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price: number; // piasters
  image_url: string | null;
  is_signature: boolean;
  is_sold_out: boolean;
  addon_groups: AddonGroup[];
};
export type Addon = { id: string; name_en: string; name_ar: string; price: number; max_quantity: number; is_default: boolean; is_sold_out: boolean };
/** Group rules (enforced again by `place_order`): pick between min_select and max_select different add-ons. */
export type AddonGroup = { id: string; name_en: string; name_ar: string; min_select: number; max_select: number; addons: Addon[] };
export type MenuCategory = { id: string; slug: string; name_en: string; name_ar: string; items: MenuItem[] };

export type Branch = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  address_en: string;
  address_ar: string;
  phone: string;
  opens_at: string;
  closes_at: string;
  timezone: string;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  delivery_fee: number; // piasters
  min_delivery_order: number; // piasters
  accepts_instapay: boolean;
  instapay_address: string | null; // InstaPay stays hidden until the owner sets this
  tax_rate?: number; // v4: VAT, default 0.14
  service_rate?: number; // v4: service on reservations, default 0.12
};

export type FamilyPhoto = { id: string; url: string; caption: string | null; uploader_name: string | null; is_official: boolean };

export type HomeData = {
  signature: MenuItem[];
  allItems: MenuItem[];
  branch: Branch;
  family: FamilyPhoto[];
  live: boolean; // false = Supabase not reachable, showing built-in content
};

/** Menu photos saved in /public/menu/<slug>.webp (copied from the live menu, 2026-10-24). They win over `image_url`, so nothing loads from another site. */
const LOCAL_MENU_PHOTOS = new Set([
  "arugula-lemon-shrimp",
  "caesar-club",
  "capri",
  "caramelized-beef",
  "chicken-arancini-balls",
  "chicken-cream-alfredo",
  "chicken-rolls",
  "chips",
  "chocolate-temptation",
  "classic-caesar",
  "deli-delights",
  "easy-morning",
  "everyday-routine",
  "fizz-craft",
  "fizzy-delight",
  "fresh-and-smoked",
  "fried-truffle-buffalo-balls",
  "golden-chicken-parm",
  "grilled-chicken-pesto",
  "hot-honey-pepperoni",
  "iconic-tiramisu",
  "kiwi-chiller",
  "marinara-shakshouka",
  "nutella-panuozzo",
  "original-caprese",
  "passion-fruit",
  "peach-bliss",
  "philly-sausage",
  "power-plus",
  "rustic-wedges",
  "sausage-arancini-balls",
  "shrimp-and-zest",
  "shrimp-arancini-balls",
  "shrimp-luxe",
  "the-comfort",
  "the-local",
  "truffle-state",
  "white-energy",
]);

export const localMenuImage = (slug: string) => (LOCAL_MENU_PHOTOS.has(slug) ? `/menu/${slug}.webp` : null);

/** Shown if Supabase is not configured or not reachable, so the page never breaks. */
const FALLBACK_ITEMS: MenuItem[] = [
  { id: "f1", slug: "fried-truffle-buffalo-balls", name_en: "Fried Truffle Buffalo Balls", name_ar: "كرات جبنة بافلو مقلية بالترافل", description_en: "5 fried buffalo cheese balls with truffle mayo sauce, parmesan cheese and parsley.", description_ar: null, price: 14500, image_url: localMenuImage("fried-truffle-buffalo-balls"), is_signature: true, is_sold_out: false, addon_groups: [] },
  { id: "f2", slug: "hot-honey-pepperoni", name_en: "Hot Honey Pepperoni", name_ar: "هوت هوني بيبروني", description_en: "Mozzarella and pepperoni grilled to crispy perfection, finished with our signature hot honey sauce.", description_ar: null, price: 20500, image_url: localMenuImage("hot-honey-pepperoni"), is_signature: true, is_sold_out: false, addon_groups: [] },
  { id: "f3", slug: "nutella-panuozzo", name_en: "Nutella Panuozzo", name_ar: "بانوتزو نوتيلا", description_en: "A freshly made cocoa-dough panuozzo filled generously with creamy Nutella.", description_ar: null, price: 18500, image_url: localMenuImage("nutella-panuozzo"), is_signature: true, is_sold_out: false, addon_groups: [] },
  { id: "f4", slug: "fizz-craft", name_en: "Fizz Craft", name_ar: "فيز كرافت", description_en: "Mixed berries meet peach in a sparkling citrus refresher.", description_ar: null, price: 17500, image_url: localMenuImage("fizz-craft"), is_signature: true, is_sold_out: false, addon_groups: [] },
  { id: "f5", slug: "chicken-cream-alfredo", name_en: "Chicken Cream Alfredo", name_ar: "تشيكن كريم ألفريدو", description_en: "Grilled chicken breast, fresh rocca and parmesan with creamy alfredo mushroom sauce.", description_ar: null, price: 25000, image_url: localMenuImage("chicken-cream-alfredo"), is_signature: false, is_sold_out: false, addon_groups: [] },
  { id: "f6", slug: "the-comfort", name_en: "The Comfort", name_ar: "ذا كومفورت", description_en: "Golden fried sourdough panuozzo with marinara, fresh mozzarella, basil and parmesan.", description_ar: null, price: 17900, image_url: localMenuImage("the-comfort"), is_signature: false, is_sold_out: false, addon_groups: [
    { id: "fg1", name_en: "Choose a side", name_ar: "اختار الجانبي", min_select: 1, max_select: 1, addons: [
      { id: "fa1", name_en: "Fried chips", name_ar: "بطاطس مقلية", price: 0, max_quantity: 1, is_default: true, is_sold_out: false },
      { id: "fa2", name_en: "Salad", name_ar: "سلطة", price: 0, max_quantity: 1, is_default: false, is_sold_out: false },
    ] },
  ] },
  { id: "f7", slug: "iconic-tiramisu", name_en: "Iconic Tiramisu", name_ar: "تيراميسو", description_en: "Rich mascarpone cream, coffee-soaked lady fingers and a cocoa finish.", description_ar: null, price: 29500, image_url: localMenuImage("iconic-tiramisu"), is_signature: false, is_sold_out: false, addon_groups: [] },
  { id: "f8", slug: "kiwi-chiller", name_en: "Kiwi Chiller", name_ar: "كيوي تشيلر", description_en: "Fresh kiwi and mint blended into the ultimate refreshing chill.", description_ar: null, price: 17500, image_url: localMenuImage("kiwi-chiller"), is_signature: false, is_sold_out: false, addon_groups: [] },
];

/** Fallback items grouped the way the real menu is (slugs match `menu_categories`). */
const FALLBACK_CATEGORIES: MenuCategory[] = [
  { id: "fc1", slug: "side-bites", name_en: "Side Bites", name_ar: "مقبلات", items: ["f1"] },
  { id: "fc2", slug: "all-day-panuozzo", name_en: "All Day Panuozzo", name_ar: "بانوتزو طول اليوم", items: ["f2", "f5", "f6"] },
  { id: "fc3", slug: "sweet-panuozzo", name_en: "Sweet Panuozzo & More", name_ar: "بانوتزو حلو والمزيد", items: ["f3", "f7"] },
  { id: "fc4", slug: "signatures", name_en: "Signatures", name_ar: "مشروبات مميزة", items: ["f4"] },
  { id: "fc5", slug: "refreshers", name_en: "Refreshers", name_ar: "مشروبات منعشة", items: ["f8"] },
].map((c) => ({ ...c, items: c.items.map((id) => FALLBACK_ITEMS.find((i) => i.id === id)!) }));

/** Prefer the self-hosted photo; keep `image_url` (e.g. a Supabase upload) for items without one. */
export const withImage = <T extends Pick<MenuItem, "slug" | "image_url">>(i: T): T => ({ ...i, image_url: localMenuImage(i.slug) ?? i.image_url });

const FALLBACK_BRANCH: Branch = {
  id: "fallback",
  slug: "meraki-salah-salem",
  name_en: "Meraki Complex – Salah Salem",
  name_ar: "ميراكي كومبلكس – صلاح سالم",
  address_en: "Meraki Complex, Air Force House, El Golf, Salah Salem, Cairo",
  address_ar: "ميراكي كومبلكس، دار القوات الجوية، الجولف، صلاح سالم، القاهرة",
  phone: "+201041093713",
  opens_at: "09:00:00",
  closes_at: "02:00:00",
  timezone: "Africa/Cairo",
  accepts_delivery: true,
  accepts_pickup: true,
  delivery_fee: 3000,
  min_delivery_order: 0,
  accepts_instapay: false,
  instapay_address: null,
  tax_rate: 0.14,
  service_rate: 0.12,
};

async function withTimeout<T>(p: PromiseLike<T>, ms = 4000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

export async function getHomeData(): Promise<HomeData> {
  const fallback: HomeData = {
    signature: FALLBACK_ITEMS.filter((i) => i.is_signature),
    allItems: FALLBACK_ITEMS,
    branch: FALLBACK_BRANCH,
    family: [],
    live: false,
  };
  if (!supabase) return fallback;

  try {
    const [menuRes, branchRes, galleryRes] = await withTimeout(
      Promise.all([
        supabase.rpc("get_menu"),
        supabase.from("branches").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle(),
        supabase.rpc("get_family_gallery", { p_limit: 8 }),
      ]),
    );
    if (menuRes.error) throw menuRes.error;

    const categories = (menuRes.data ?? []) as MenuCategory[];
    const allItems = categories.flatMap((c) => c.items ?? []).map(withImage);
    const signature = allItems.filter((i) => i.is_signature && !i.is_sold_out);

    // Approved Panzutti Family photos live in a private bucket -> short-lived signed URLs
    let family: FamilyPhoto[] = [];
    const rows = (galleryRes.data ?? []) as { id: string; file_path: string; caption: string | null; uploader_name: string | null; is_official: boolean }[];
    if (rows.length) {
      const { data: signed } = await supabase.storage
        .from("panzutti-family")
        .createSignedUrls(rows.map((r) => r.file_path), 60 * 60);
      family = rows
        .map((r, i) => ({ id: r.id, url: signed?.[i]?.signedUrl ?? "", caption: r.caption, uploader_name: r.uploader_name, is_official: r.is_official }))
        .filter((p) => p.url);
    }

    return {
      signature: signature.length ? signature : allItems.slice(0, 4),
      allItems,
      branch: (branchRes.data as Branch | null) ?? FALLBACK_BRANCH,
      family,
      live: true,
    };
  } catch (e) {
    console.warn("[home] Supabase unavailable, using built-in content:", (e as Error).message);
    return fallback;
  }
}

export type MenuData = { categories: MenuCategory[]; branch: Branch; live: boolean };

/** Full menu for /menu. Empty categories are hidden. */
export const getMenuData = cache(async (): Promise<MenuData> => {
  const fallback: MenuData = { categories: FALLBACK_CATEGORIES, branch: FALLBACK_BRANCH, live: false };
  if (!supabase) return fallback;

  try {
    const [menuRes, branchRes] = await withTimeout(
      Promise.all([
        supabase.rpc("get_menu"),
        supabase.from("branches").select("*").eq("is_active", true).order("created_at").limit(1).maybeSingle(),
      ]),
    );
    if (menuRes.error) throw menuRes.error;

    const categories = ((menuRes.data ?? []) as MenuCategory[])
      .map((c) => ({ ...c, items: (c.items ?? []).map(withImage) }))
      .filter((c) => c.items.length > 0);

    return {
      categories: categories.length ? categories : FALLBACK_CATEGORIES,
      branch: (branchRes.data as Branch | null) ?? FALLBACK_BRANCH,
      live: categories.length > 0,
    };
  } catch (e) {
    console.warn("[menu] Supabase unavailable, using built-in content:", (e as Error).message);
    return fallback;
  }
}); // cache(): one fetch per request even when the page and the footer both ask

export type JobPosition = { id: string; title_en: string; title_ar: string; description_en: string | null; description_ar: string | null };
export type ServiceCategory = { id: string; slug: string; name_en: string; name_ar: string };

/** Open positions + supplier categories for /careers and /suppliers. Empty lists when Supabase is unreachable. */
export async function getJoinData(): Promise<{ positions: JobPosition[]; services: ServiceCategory[]; live: boolean }> {
  if (!supabase) return { positions: [], services: [], live: false };
  try {
    const [pos, svc] = await withTimeout(
      Promise.all([
        supabase.from("job_positions").select("id, title_en, title_ar, description_en, description_ar").eq("is_open", true).order("sort_order"),
        supabase.from("service_categories").select("id, slug, name_en, name_ar").eq("is_active", true).order("sort_order"),
      ]),
    );
    if (pos.error || svc.error) throw pos.error ?? svc.error;
    return { positions: (pos.data ?? []) as JobPosition[], services: (svc.data ?? []) as ServiceCategory[], live: true };
  } catch (e) {
    console.warn("[join] Supabase unavailable:", (e as Error).message);
    return { positions: [], services: [], live: false };
  }
}

/** First page of the approved family wall for /family. Empty (not an error) when Supabase is unreachable. */
export async function getFamilyWall(): Promise<{ photos: FamilyPhoto[]; live: boolean }> {
  if (!supabase) return { photos: [], live: false };
  try {
    return { photos: await withTimeout(fetchFamilyPage(supabase)), live: true };
  } catch (e) {
    console.warn("[family] Supabase unavailable:", (e as Error).message);
    return { photos: [], live: false };
  }
}

/** One item (with its category) for /menu/[slug]. `null` when the slug is not on the menu. */
export async function getMenuItem(slug: string) {
  const data = await getMenuData();
  for (const category of data.categories) {
    const item = category.items.find((i) => i.slug === slug);
    if (item) return { item, category, branch: data.branch, live: data.live };
  }
  return null;
}

/** Is the branch open right now (Cairo time)? Handles closing after midnight. */
export function openStatus(b: Branch, now = new Date()) {
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: b.timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h % 24) * 60 + m;
  };
  const t = toMin(local), o = toMin(b.opens_at), c = toMin(b.closes_at);
  const open = o === c ? true : o < c ? t >= o && t < c : t >= o || t < c;
  return { open };
}
