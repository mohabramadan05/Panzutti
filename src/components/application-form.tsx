"use client";

import { useState } from "react";
import { Briefcase, CheckCircle2, FileUp, Loader2, Send } from "lucide-react";
import type { JobPosition, ServiceCategory } from "@/lib/data";
import type { Dictionary, Locale } from "@/lib/i18n";
import { supabase } from "@/lib/supabase";
import { brand } from "@/lib/brand";
import { normalizePhone } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024; // = 'applications' bucket limit
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTHER = "other";

type Props = {
  locale: Locale;
  t: Dictionary["joinForm"];
  live: boolean;
} & (
  | { mode: "job"; tc: Dictionary["careers"]; positions: JobPosition[] }
  | { mode: "service_provider"; tc: Dictionary["suppliers"]; services: ServiceCategory[] }
);

function Text({ label, hint, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      <input
        {...props}
        aria-invalid={!!error}
        className={cn("h-12 w-full rounded-2xl bg-background px-4 ring-1 outline-none focus:ring-2 focus:ring-primary", error ? "ring-2 ring-brand-red" : "ring-border")}
      />
      {error ? <span className="mt-1 block text-sm font-bold text-brand-red">{error}</span> : hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/**
 * Job (/careers) or supplier (/suppliers) application → submit_application().
 * Optional file goes to the private 'applications' bucket at incoming/<random>/<name> first;
 * only admins can read it (Panzutti-Admin → Applications).
 */
export function ApplicationForm(props: Props) {
  const { locale, t, live, mode } = props;
  const pick = (en: string, ar: string | null) => (locale === "ar" ? ar || en : en);
  const [f, setF] = useState({ name: "", phone: "", email: "", company: "", choice: "", other: "", message: "" });
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setF((cur) => ({ ...cur, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: "" }));
  };

  const choose = (id: string) => {
    setF((cur) => ({ ...cur, choice: id }));
    setErrors((er) => ({ ...er, choice: "" }));
    document.getElementById("apply-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pickFile = (fl: File | null) => {
    setErrors((er) => ({ ...er, file: "" }));
    if (!fl) return setFile(null);
    const ext = (fl.name.split(".").pop() ?? "").toLowerCase();
    if (!TYPES[ext]) return setErrors((er) => ({ ...er, file: t.fileType }));
    if (fl.size > MAX_BYTES) return setErrors((er) => ({ ...er, file: t.fileTooBig }));
    setFile(fl);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError("");
    const er: Record<string, string> = {};
    if (!f.name.trim()) er.name = t.required;
    if (!f.phone.trim()) er.phone = t.required;
    else if (!normalizePhone(f.phone)) er.phone = t.phoneInvalid;
    if (!f.email.trim()) er.email = t.required;
    else if (!EMAIL_RE.test(f.email.trim())) er.email = t.emailInvalid;
    if (!f.choice) er.choice = t.required;
    if (mode === "job" && f.choice === OTHER && !f.other.trim()) er.other = t.required;
    if (mode === "service_provider" && !f.company.trim()) er.company = t.required;
    setErrors(er);
    const first = Object.keys(er)[0];
    if (first) return document.getElementById(`af-${first}`)?.focus();
    if (!supabase) return;

    setBusy(true);
    let path: string | null = null;
    if (file) {
      const ext = (file.name.split(".").pop() ?? "").toLowerCase();
      // keep the original name readable for the admin, but storage-safe
      const base = file.name.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
      path = `incoming/${crypto.randomUUID()}/${base}.${ext}`;
      const up = await supabase.storage.from("applications").upload(path, file, { contentType: TYPES[ext] });
      if (up.error) {
        setBusy(false);
        return setServerError(up.error.message || t.generic);
      }
    }
    const { error } = await supabase.rpc("submit_application", {
      p_type: mode,
      p_full_name: f.name.trim(),
      p_phone: normalizePhone(f.phone),
      p_email: f.email.trim(),
      p_message: f.message.trim() || null,
      p_job_position_id: mode === "job" && f.choice !== OTHER ? f.choice : null,
      p_position_other: mode === "job" && f.choice === OTHER ? f.other.trim() : null,
      p_service_category_id: mode === "service_provider" ? f.choice : null,
      p_company_name: mode === "service_provider" ? f.company.trim() : null,
      p_attachment_path: path,
      p_locale: locale,
    });
    setBusy(false);
    if (error) return setServerError(error.message || t.generic);
    setDone(f.name.trim().split(" ")[0]);
    setF({ name: "", phone: "", email: "", company: "", choice: "", other: "", message: "" });
    setFile(null);
  };

  const options = mode === "job" ? props.positions.map((p) => ({ id: p.id, label: pick(p.title_en, p.title_ar) })) : props.services.map((s) => ({ id: s.id, label: pick(s.name_en, s.name_ar) }));

  return (
    <>
      {/* Careers: open positions as cards that pre-select the form */}
      {mode === "job" && (
        <section className="mb-12">
          <h2 className="mb-5 text-3xl text-primary">{props.tc.openTitle}</h2>
          {props.positions.length === 0 ? (
            <p className="rounded-2xl bg-card p-5 text-muted-foreground ring-1 ring-border">{props.tc.noOpen}</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {props.positions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => choose(p.id)}
                    className={cn(
                      "group flex w-full items-center gap-4 rounded-2xl bg-card p-5 text-start ring-1 transition hover:-translate-y-0.5 hover:shadow-lg",
                      f.choice === p.id ? "ring-2 ring-primary" : "ring-border hover:ring-primary",
                    )}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red transition group-hover:bg-brand-red group-hover:text-brand-cream">
                      <Briefcase className="h-6 w-6" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-xl text-primary">{pick(p.title_en, p.title_ar)}</span>
                      {(p.description_en || p.description_ar) && (
                        <span className="mt-1 block text-sm text-muted-foreground">{pick(p.description_en ?? "", p.description_ar)}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm font-extrabold text-primary">{props.tc.apply}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section id="apply-form" className="scroll-mt-24 rounded-[2rem] bg-card p-6 ring-1 ring-border md:p-10">
        <h2 className="text-3xl text-primary">{props.tc.formTitle}</h2>

        {!live ? (
          <p className="mt-4 rounded-2xl bg-brand-red/10 px-4 py-3 font-bold text-brand-red">{t.offline.replace("{email}", brand.email)}</p>
        ) : done ? (
          <div role="status" className="mt-6 rounded-3xl bg-primary p-6 text-primary-foreground">
            <p className="flex items-center gap-2 font-display text-2xl">
              <CheckCircle2 className="h-7 w-7 text-brand-yellow" aria-hidden /> {t.thanksTitle.replace("{name}", done)}
            </p>
            <p className="mt-2 opacity-90">{t.thanksBody}</p>
            <button type="button" onClick={() => setDone(null)} className="mt-5 rounded-full bg-brand-yellow px-5 py-2.5 font-extrabold text-foreground">
              {t.another}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-6 space-y-5">
            {mode === "service_provider" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Text id="af-company" label={props.tc.company} value={f.company} onChange={set("company")} autoComplete="organization" error={errors.company} maxLength={120} />
                <Text id="af-name" label={props.tc.contact} value={f.name} onChange={set("name")} autoComplete="name" error={errors.name} maxLength={80} />
              </div>
            )}
            {mode === "job" && <Text id="af-name" label={t.name} value={f.name} onChange={set("name")} autoComplete="name" error={errors.name} maxLength={80} />}
            <div className="grid gap-5 sm:grid-cols-2">
              <Text id="af-phone" label={t.phone} value={f.phone} onChange={set("phone")} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01012345678" error={errors.phone} />
              <Text id="af-email" label={t.email} value={f.email} onChange={set("email")} type="email" autoComplete="email" dir="ltr" error={errors.email} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-bold">{mode === "job" ? props.tc.position : props.tc.category}</span>
                <select
                  id="af-choice"
                  value={f.choice}
                  onChange={set("choice")}
                  aria-invalid={!!errors.choice}
                  className={cn("h-12 w-full rounded-2xl bg-background px-4 ring-1 outline-none focus:ring-2 focus:ring-primary", errors.choice ? "ring-2 ring-brand-red" : "ring-border")}
                >
                  <option value="">{props.tc.choose}</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                  {mode === "job" && <option value={OTHER}>{props.tc.other}</option>}
                </select>
                {errors.choice && <span className="mt-1 block text-sm font-bold text-brand-red">{errors.choice}</span>}
              </label>
              {mode === "job" && f.choice === OTHER && (
                <Text id="af-other" label={props.tc.otherLabel} value={f.other} onChange={set("other")} error={errors.other} maxLength={80} />
              )}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-bold">{t.message}</span>
              <textarea
                value={f.message}
                onChange={set("message")}
                rows={5}
                maxLength={3000}
                placeholder={props.tc.messageHint}
                className="w-full resize-y rounded-2xl bg-background px-4 py-3 ring-1 ring-border outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
              />
            </label>

            <div>
              <span className="mb-1.5 block text-sm font-bold">{props.tc.attach}</span>
              <label className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed bg-background p-4 hover:border-primary", errors.file ? "border-brand-red" : "border-primary/30")}>
                <FileUp className="h-6 w-6 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{file ? file.name : t.attach}</span>
                  <span className="block text-xs text-muted-foreground">{file ? t.attachChange : t.attachHint}</span>
                </span>
                <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
              </label>
              {errors.file && <span className="mt-1 block text-sm font-bold text-brand-red">{errors.file}</span>}
            </div>

            {serverError && (
              <p role="alert" className="rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">
                {serverError}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full bg-brand-red px-8 py-4 font-extrabold text-brand-cream shadow-lg shadow-brand-red/25 transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5 rtl:-scale-x-100" aria-hidden />}
              {busy ? t.sending : t.send}
            </button>
          </form>
        )}
      </section>
    </>
  );
}
