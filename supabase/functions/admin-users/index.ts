// Panzutti — admin-users Edge Function
// Lets an admin create staff / cashier / driver / admin logins from the admin panel,
// and reset their passwords. Creating a login needs the service-role key, which
// only exists here (inside Supabase), never in the browser.
//
// POST { action: "create", email, password, full_name, role, branch_id? }
// POST { action: "set_password", user_id, password }
// Header: Authorization: Bearer <the admin's own access token>
//
// Changing role / branch / active of an existing account is done by the admin panel
// with a normal UPDATE on public.profiles (allowed for admins by RLS), not here.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const ROLES = ["admin", "staff", "cashier", "driver"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  // Who is calling? Must be an active admin.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(401, { error: "Please sign in again" });
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return reply(401, { error: "Please sign in again" });
  const { data: me } = await admin.from("profiles").select("role, is_active").eq("id", who.user.id).maybeSingle();
  if (!me || me.role !== "admin" || !me.is_active) return reply(403, { error: "Only admins can manage users" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "Invalid request" });
  }
  const password = String(body.password ?? "");
  if (password.length < 8) return reply(400, { error: "The password must be at least 8 characters" });

  if (body.action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? "").trim().slice(0, 80);
    const role = String(body.role ?? "");
    const branchId = body.branch_id ? String(body.branch_id) : null;
    if (!EMAIL_RE.test(email)) return reply(400, { error: "Enter a valid email address" });
    if (!fullName) return reply(400, { error: "Enter the person's name" });
    if (!ROLES.includes(role as (typeof ROLES)[number])) return reply(400, { error: "Choose a role" });
    if (branchId && !UUID_RE.test(branchId)) return reply(400, { error: "Unknown branch" });

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !created.user) {
      const msg = /already/i.test(error?.message ?? "") ? "An account with this email already exists — change its role in the list instead" : error?.message;
      return reply(400, { error: msg ?? "Couldn't create the user" });
    }
    // handle_new_user() has made the profile row; give it the role and branch
    const { error: upErr } = await admin
      .from("profiles")
      .update({ full_name: fullName, role, branch_id: role === "admin" ? null : branchId, is_active: true })
      .eq("id", created.user.id);
    if (upErr) return reply(500, { error: `User created, but setting the role failed: ${upErr.message}` });
    return reply(200, { user_id: created.user.id });
  }

  if (body.action === "set_password") {
    const userId = String(body.user_id ?? "");
    if (!UUID_RE.test(userId)) return reply(400, { error: "Unknown user" });
    // only staff accounts, never customers' own logins
    const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (!target || target.role === "customer") return reply(400, { error: "Only staff passwords can be changed here" });
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return reply(400, { error: error.message });
    return reply(200, { ok: true });
  }

  return reply(400, { error: "Unknown action" });
});
