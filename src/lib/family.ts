import type { SupabaseClient } from "@supabase/supabase-js";
import type { FamilyPhoto } from "./data";

export const FAMILY_BUCKET = "panzutti-family";
export const FAMILY_PAGE_SIZE = 24;
/** Bucket limits (see panzutti_supabase_v2.sql): images only, 8 MB. */
export const FAMILY_MAX_BYTES = 8 * 1024 * 1024;
export const FAMILY_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic" };

type GalleryRow = { id: string; file_path: string; caption: string | null; uploader_name: string | null; is_official: boolean };

/**
 * One page of the approved family wall. The bucket is private, so each photo gets a
 * short-lived signed URL (1 hour — longer than the page's 5-minute revalidate).
 */
export async function fetchFamilyPage(client: SupabaseClient, limit = FAMILY_PAGE_SIZE, offset = 0): Promise<FamilyPhoto[]> {
  const { data, error } = await client.rpc("get_family_gallery", { p_limit: limit, p_offset: offset });
  if (error) throw error;
  const rows = (data ?? []) as GalleryRow[];
  if (!rows.length) return [];
  const { data: signed } = await client.storage.from(FAMILY_BUCKET).createSignedUrls(rows.map((r) => r.file_path), 60 * 60);
  return rows
    .map((r, i) => ({ id: r.id, url: signed?.[i]?.signedUrl ?? "", caption: r.caption, uploader_name: r.uploader_name, is_official: r.is_official }))
    .filter((p) => p.url);
}
