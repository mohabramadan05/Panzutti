import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const settingsQuery = queryOptions({
  queryKey: ["settings"],
  queryFn: async () => {
    const { data, error } = await supabase.from("site_settings").select("key,value");
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((r) => [r.key, r.value as Record<string, any>])) as Record<string, Record<string, any>>;
  },
});

export const categoriesQuery = queryOptions({
  queryKey: ["categories"],
  queryFn: async () => {
    const { data, error } = await supabase.from("categories").select("*").eq("is_visible", true).order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const productsQuery = queryOptions({
  queryKey: ["products"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("products")
      .select("*, option_groups(id)")
      .eq("is_published", true)
      .order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name,slug), option_groups(*, options(*))")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

export const tiersQuery = queryOptions({
  queryKey: ["tiers"],
  queryFn: async () => {
    const { data, error } = await supabase.from("reward_tiers").select("*").eq("is_active", true).order("points");
    if (error) throw error;
    return data;
  },
});

export const zonesQuery = queryOptions({
  queryKey: ["zones"],
  queryFn: async () => {
    const { data, error } = await supabase.from("delivery_zones").select("*").eq("is_active", true).order("sort_order");
    if (error) throw error;
    return data;
  },
});

export const hoursQuery = queryOptions({
  queryKey: ["hours"],
  queryFn: async () => {
    const { data, error } = await supabase.from("opening_hours").select("*").order("weekday");
    if (error) throw error;
    return data;
  },
});

export const articlesQuery = queryOptions({
  queryKey: ["articles"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("articles")
      .select("id,title,slug,excerpt,cover_url,category,published_at,is_featured")
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (error) throw error;
    return data;
  },
});

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function uploadMedia(file: File, folder: string) {
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]+/g, "-")}`;
  const { error } = await supabase.storage.from("media").upload(path, file, { upsert: false });
  if (error) throw error;
  const { data, error: e2 } = await supabase.storage.from("media").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (e2) throw e2;
  return data.signedUrl;
}
