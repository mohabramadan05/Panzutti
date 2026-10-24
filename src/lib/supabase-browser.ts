import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null | undefined;

/**
 * Browser client that keeps the signed-in session (localStorage) and finishes the Google
 * redirect (PKCE `?code=` in the URL). Use it for anything that needs the customer's identity;
 * the plain `supabase` client in ./supabase stays anonymous.
 * TODO (sign-in work): move to @supabase/ssr cookie sessions when the account pages need server access.
 */
export function getBrowserSupabase() {
  if (client !== undefined) return client;
  client =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storageKey: "panzutti-auth" },
        })
      : null;
  return client;
}

/** Is Google sign-in switched on in Supabase Auth? (public settings endpoint) */
export async function isGoogleEnabled() {
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return !!settings.external?.google;
  } catch {
    return false;
  }
}
