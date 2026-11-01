import { createClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

/**
 * On-demand refresh of the cached pages (home, menu, item pages, cart, checkout…).
 * The admin panel calls this after every menu change, so the site shows the new data right away
 * instead of after the pages' `revalidate` window.
 *
 * Auth: `Authorization: Bearer <Supabase access token>` of a staff/admin user. The token is checked
 * with Supabase and the role is read from `profiles` (RLS lets a user read their own row), so no
 * shared secret is needed. No cookies are involved, which is why `*` is fine for CORS.
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const STAFF_ROLES = ["admin", "staff", "cashier"];

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !key) return NextResponse.json({ error: "Supabase not configured" }, { status: 500, headers: CORS });
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 401, headers: CORS });

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userRes, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userRes.user) return NextResponse.json({ error: "Invalid token" }, { status: 401, headers: CORS });

  const { data: profile } = await sb.from("profiles").select("role, is_active").eq("id", userRes.user.id).maybeSingle();
  if (!profile?.is_active || !STAFF_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: CORS });
  }

  // Every page lives under the [locale] layout, so this clears the whole site (both languages).
  revalidatePath("/[locale]", "layout");
  return NextResponse.json({ revalidated: true, at: new Date().toISOString() }, { headers: CORS });
}
