import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand";
import { errMsg } from "@/lib/format";

const search = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — PANZUTTI" },
      { name: "description", content: "Sign in or create your PANZUTTI account to order and earn Club points." },
      { property: "og:title", content: "Sign in — PANZUTTI" },
      { property: "og:description", content: "Your PANZUTTI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const safe = (r?: string) => (r && r.startsWith("/") && !r.startsWith("//") ? r : "/account");

function AuthPage() {
  const { redirect } = Route.useSearch();
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up" | "reset">("in");
  const [f, setF] = useState({ email: "", password: "", full_name: "", phone: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate({ to: safe(redirect), replace: true });
  }, [session, redirect, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email: f.email.trim(),
          password: f.password,
          options: { emailRedirectTo: window.location.origin + "/account", data: { full_name: f.full_name.trim(), phone: f.phone.trim() } },
        });
        if (error) throw error;
        if (!data.session) toast.success("Check your email to confirm your account.");
      } else if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: window.location.origin + "/reset-password" });
        if (error) throw error;
        toast.success("Password reset email sent.");
      }
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-28 pt-10">
      <div className="rounded-[2rem] bg-card p-8 shadow-sm ring-1 ring-border">
        <Logo className="mx-auto h-14" />
        <h1 className="mt-6 text-center text-3xl text-primary">{mode === "up" ? "Join PANZUTTI" : mode === "in" ? "Welcome back" : "Reset password"}</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "up" && (
            <>
              <div><Label htmlFor="n">Full name</Label><Input id="n" required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></div>
              <div><Label htmlFor="ph">Mobile number</Label><Input id="ph" required type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
            </>
          )}
          <div><Label htmlFor="em">Email</Label><Input id="em" required type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          {mode !== "reset" && (
            <div><Label htmlFor="pw">Password</Label><Input id="pw" required minLength={8} type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
          )}
          <button disabled={busy} className="w-full rounded-full bg-primary py-3 font-extrabold text-primary-foreground disabled:opacity-50">
            {busy ? "Please wait…" : mode === "up" ? "Create account" : mode === "in" ? "Sign in" : "Send reset link"}
          </button>
        </form>
        <div className="mt-5 space-y-2 text-center text-sm">
          {mode !== "up" && <button className="font-bold text-primary" onClick={() => setMode("up")}>New here? Create an account</button>}
          {mode !== "in" && <button className="block w-full font-bold text-primary" onClick={() => setMode("in")}>Already have an account? Sign in</button>}
          {mode === "in" && <button className="block w-full text-muted-foreground" onClick={() => setMode("reset")}>Forgot password?</button>}
        </div>
      </div>
    </div>
  );
}
