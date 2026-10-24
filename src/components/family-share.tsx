"use client";
/* eslint-disable @next/next/no-img-element -- local object-URL preview and signed URLs */

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { CheckCircle2, ImagePlus, Loader2, LogOut, Upload } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import { FAMILY_BUCKET, FAMILY_MAX_BYTES, FAMILY_TYPES } from "@/lib/family";
import { getBrowserSupabase, isGoogleEnabled } from "@/lib/supabase-browser";
import { cn } from "@/lib/utils";

type Mine = { id: string; url: string; caption: string | null; status: "pending" | "approved" | "rejected"; review_note: string | null };

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12Z" />
    </svg>
  );
}

export function FamilyShare({ locale, t }: { locale: Locale; t: Dictionary["share"] }) {
  const sb = getBrowserSupabase();
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = still checking
  const [googleOn, setGoogleOn] = useState<boolean | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<Mine[]>([]);

  useEffect(() => {
    isGoogleEnabled().then(setGoogleOn);
    if (!sb) return setSession(null);
    // getSession() also finishes the Google redirect (?code=… in the URL)
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  // Clean the OAuth code out of the address bar once signed in
  useEffect(() => {
    if (session && window.location.search.includes("code=")) window.history.replaceState(null, "", window.location.pathname);
  }, [session]);

  const loadMine = useCallback(async () => {
    if (!sb || !session) return;
    const { data } = await sb
      .from("family_photos")
      .select("id, file_path, caption, status, review_note")
      .eq("uploaded_by", session.user.id)
      .order("created_at", { ascending: false })
      .limit(12);
    const rows = (data ?? []) as (Omit<Mine, "url"> & { file_path: string })[];
    if (!rows.length) return setMine([]);
    const { data: signed } = await sb.storage.from(FAMILY_BUCKET).createSignedUrls(rows.map((r) => r.file_path), 60 * 60);
    setMine(rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? "" })).filter((r) => r.url));
  }, [sb, session]);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const signIn = async () => {
    if (!sb) return;
    setRedirecting(true);
    const { error: err } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/${locale}/family/share` },
    });
    if (err) {
      setRedirecting(false);
      setError(err.message);
    }
  };

  const pickFile = (f: File | null) => {
    setError("");
    setDone(false);
    if (!f) return;
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!FAMILY_TYPES[ext]) return setError(t.badType);
    if (f.size > FAMILY_MAX_BYTES) return setError(t.tooBig);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  /**
   * Signed in → own folder + submit_family_photo (v2).
   * Guest → 'guest/' folder + submit_guest_family_photo (v3). Either way the photo is pending until an admin approves it.
   */
  const submit = async () => {
    if (!sb || !file) return;
    if (!session && !guestName.trim()) return setError(t.nameRequired);
    setBusy(true);
    setError("");
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${session ? session.user.id : "guest"}/${crypto.randomUUID()}.${ext}`;
    const up = await sb.storage.from(FAMILY_BUCKET).upload(path, file, { contentType: file.type || FAMILY_TYPES[ext] });
    const res = up.error
      ? up
      : session
        ? await sb.rpc("submit_family_photo", { p_file_path: path, p_caption: caption.trim() || null })
        : await sb.rpc("submit_guest_family_photo", { p_file_path: path, p_name: guestName.trim(), p_caption: caption.trim() || null });
    setBusy(false);
    if (res.error) return setError(res.error.message || t.generic);
    setDone(true);
    setFile(null);
    setPreview(null);
    setCaption("");
    loadMine();
  };

  const name = (session?.user.user_metadata?.full_name as string | undefined) ?? session?.user.email ?? "";

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_1fr]">
      <section className="rounded-[2rem] bg-card p-6 ring-1 ring-border md:p-8">
        {session === undefined ? (
          <div className="h-48 animate-pulse rounded-2xl bg-muted" aria-busy />
        ) : (
          <div>
            {session ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{t.signedInAs.replace("{name}", name)}</p>
                <button type="button" onClick={() => sb?.auth.signOut()} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-brand-red">
                  <LogOut className="h-4 w-4" aria-hidden /> {t.signOut}
                </button>
              </div>
            ) : (
              // Guests can share too — they just give a name
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">{t.name}</span>
                <input
                  value={guestName}
                  onChange={(e) => {
                    setGuestName(e.target.value.slice(0, 60));
                    setError("");
                  }}
                  autoComplete="given-name"
                  className="h-12 w-full rounded-2xl bg-background px-4 ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="mt-1 block text-xs text-muted-foreground">{t.nameHint}</span>
              </label>
            )}

            {done && (
              <p role="status" className="mt-5 flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 font-bold text-primary-foreground">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-brand-yellow" aria-hidden /> {t.success}
              </p>
            )}

            <label
              className={cn(
                "mt-5 flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border-2 border-dashed bg-background text-center transition hover:border-primary",
                preview ? "border-primary/40 p-3" : "border-primary/30 px-6 py-12",
              )}
            >
              {preview ? (
                <img src={preview} alt="" className="max-h-80 w-auto rounded-2xl object-contain" />
              ) : (
                <ImagePlus className="h-10 w-10 text-primary" aria-hidden />
              )}
              <span className="font-extrabold text-primary">{preview ? t.change : t.choose}</span>
              <span className="text-xs text-muted-foreground">{t.rules[0]}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
            </label>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm font-bold">{t.caption}</span>
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value.slice(0, 140))}
                placeholder={t.captionPlaceholder}
                className="h-12 w-full rounded-2xl bg-background px-4 ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
              />
            </label>

            <button
              type="button"
              onClick={submit}
              disabled={!file || busy || (!session && !guestName.trim())}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-red px-6 py-3.5 font-extrabold text-brand-cream shadow-lg shadow-brand-red/25 transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              {busy ? t.uploading : t.submit}
            </button>

            {/* Optional: signing in adds the "your photos" status panel. Hidden while Google is off. */}
            {!session && googleOn && (
              <div className="mt-8 border-t border-dashed border-border pt-6">
                <p className="text-sm text-muted-foreground">{t.orGoogle}</p>
                <button
                  type="button"
                  onClick={signIn}
                  disabled={redirecting}
                  className="mt-3 inline-flex items-center gap-3 rounded-full bg-background px-5 py-3 text-sm font-extrabold text-foreground shadow ring-1 ring-border transition hover:ring-primary disabled:opacity-60"
                >
                  {redirecting ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <GoogleIcon />}
                  {redirecting ? t.redirecting : t.google}
                </button>
              </div>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">
            {error}
          </p>
        )}
      </section>

      <aside className="space-y-6">
        <ul className="space-y-2 rounded-[2rem] bg-brand-yellow/50 p-6 text-sm font-semibold">
          {t.rules.map((r) => (
            <li key={r} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /> {r}
            </li>
          ))}
        </ul>

        {mine.length > 0 && (
          <section className="rounded-[2rem] bg-card p-6 ring-1 ring-border">
            <h2 className="text-xl text-primary">{t.mine}</h2>
            <ul className="mt-4 grid grid-cols-3 gap-3">
              {mine.map((m) => (
                <li key={m.id}>
                  <img src={m.url} alt={m.caption ?? ""} className="aspect-square w-full rounded-xl object-cover" />
                  <span
                    className={cn(
                      "mt-1 block text-[11px] font-bold leading-tight",
                      m.status === "approved" ? "text-primary" : m.status === "rejected" ? "text-brand-red" : "text-muted-foreground",
                    )}
                    title={m.review_note ?? undefined}
                  >
                    {t.statuses[m.status]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
