"use client";
/* eslint-disable @next/next/no-img-element -- signed Supabase URLs of unknown size in a masonry wall */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, Heart, Loader2, Sparkles, X } from "lucide-react";
import type { FamilyPhoto } from "@/lib/data";
import type { Dictionary, Locale } from "@/lib/i18n";
import { FAMILY_PAGE_SIZE, fetchFamilyPage } from "@/lib/family";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const TILTS = ["-rotate-2", "rotate-1", "rotate-2", "-rotate-1"];

export function FamilyWall({ initial, live, locale, t }: { initial: FamilyPhoto[]; live: boolean; locale: Locale; t: Dictionary["familyPage"] }) {
  const [photos, setPhotos] = useState(initial);
  const [hasMore, setHasMore] = useState(initial.length === FAMILY_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const script = locale === "ar" ? "font-arabic" : "font-script";

  const loadMore = async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const next = await fetchFamilyPage(supabase, FAMILY_PAGE_SIZE, photos.length);
      setPhotos((p) => [...p, ...next.filter((n) => !p.some((x) => x.id === n.id))]);
      setHasMore(next.length === FAMILY_PAGE_SIZE);
    } catch {
      setHasMore(false);
    }
    setLoading(false);
  };

  // Lightbox: native <dialog> gives focus trapping and Esc for free
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open != null && !d.open) d.showModal();
    if (open == null && d.open) d.close();
  }, [open]);

  const step = useCallback(
    (dir: 1 | -1) => setOpen((i) => (i == null ? i : (i + dir + photos.length) % photos.length)),
    [photos.length],
  );

  const onKey = (e: React.KeyboardEvent) => {
    const forward = locale === "ar" ? "ArrowLeft" : "ArrowRight";
    const backward = locale === "ar" ? "ArrowRight" : "ArrowLeft";
    if (e.key === forward) step(1);
    if (e.key === backward) step(-1);
  };

  if (!photos.length)
    return (
      <div className="relative mx-auto flex max-w-xl flex-col items-center px-4 py-10 text-center">
        <div className="relative h-64 w-full">
          {[-8, 4, -2].map((r, i) => (
            <div
              key={i}
              aria-hidden
              style={{ transform: `rotate(${r}deg) translate(${(i - 1) * 80}px, ${i === 1 ? -10 : 12}px)` }}
              className={cn("absolute inset-x-0 mx-auto h-56 w-44 rounded-xl bg-card p-2.5 pb-10 shadow-xl", i === 1 && "z-10")}
            >
              <div className="flex h-full w-full items-center justify-center rounded-lg border-2 border-dashed border-primary/25 bg-muted">
                {i === 1 ? <Heart className="h-8 w-8 text-brand-red" /> : <Camera className="h-7 w-7 text-primary/40" />}
              </div>
            </div>
          ))}
        </div>
        <h2 className={cn("mt-6 text-3xl text-brand-red", script)}>{live ? t.empty : t.offline}</h2>
        {live && <p className="mt-2 max-w-sm text-foreground/75">{t.emptyBody}</p>}
        <Link href={`/${locale}/family/share`} className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-extrabold text-primary-foreground">
          <Camera className="h-4 w-4" aria-hidden /> {t.share}
        </Link>
      </div>
    );

  const current = open != null ? photos[open] : null;

  return (
    <>
      <ul className="columns-2 gap-4 sm:columns-3 lg:columns-4 [&>li]:mb-5">
        {photos.map((p, i) => (
          <li key={p.id} className="break-inside-avoid">
            <button
              type="button"
              onClick={() => setOpen(i)}
              className={cn(
                "group block w-full rounded-xl bg-card p-2 pb-3 text-start shadow-lg ring-1 ring-border/60 transition duration-300 hover:z-10 hover:rotate-0 hover:scale-[1.03] hover:shadow-xl",
                TILTS[i % TILTS.length],
              )}
            >
              <span className="relative block overflow-hidden rounded-lg bg-muted">
                <img src={p.url} alt={p.caption ?? t.photoAlt} loading={i < 8 ? "eager" : "lazy"} className="block h-auto w-full" />
                {p.is_official && (
                  <span className="absolute start-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand-red px-2 py-0.5 text-[11px] font-extrabold text-brand-cream">
                    <Sparkles className="h-3 w-3" aria-hidden /> {t.official}
                  </span>
                )}
              </span>
              {(p.caption || p.uploader_name) && (
                <span className="mt-2 block px-1">
                  {p.caption && <span className={cn("block text-lg leading-tight text-brand-red", script)}>{p.caption}</span>}
                  {p.uploader_name && !p.is_official && (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{t.by.replace("{name}", p.uploader_name)}</span>
                  )}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border-2 border-primary px-6 py-3 font-extrabold text-primary transition hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {loading ? t.loading : t.loadMore}
          </button>
        </div>
      )}

      <dialog
        ref={dialog}
        onClose={() => setOpen(null)}
        onKeyDown={onKey}
        onClick={(e) => e.target === e.currentTarget && setOpen(null)}
        aria-label={current?.caption ?? t.photoAlt}
        className="m-auto max-h-[92vh] w-[min(92vw,960px)] overflow-visible bg-transparent p-0 backdrop:bg-foreground/80 backdrop:backdrop-blur-sm"
      >
        {current && (
          <figure className="relative rounded-2xl bg-card p-3 pb-4 shadow-2xl">
            <img src={current.url} alt={current.caption ?? t.photoAlt} className="mx-auto max-h-[75vh] w-auto rounded-xl object-contain" />
            {(current.caption || current.uploader_name) && (
              <figcaption className="mt-3 px-1 text-center">
                {current.caption && <span className={cn("block text-2xl text-brand-red", script)}>{current.caption}</span>}
                {current.uploader_name && !current.is_official && <span className="text-sm text-muted-foreground">{t.by.replace("{name}", current.uploader_name)}</span>}
              </figcaption>
            )}
            <button type="button" onClick={() => setOpen(null)} aria-label={t.close} className="absolute -end-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-red text-brand-cream shadow-lg">
              <X className="h-5 w-5" aria-hidden />
            </button>
            {photos.length > 1 && (
              <>
                <button type="button" onClick={() => step(-1)} aria-label={t.prev} className="absolute -start-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card text-primary shadow-lg ring-1 ring-border md:-start-6">
                  <ChevronLeft className="h-6 w-6 rtl:rotate-180" aria-hidden />
                </button>
                <button type="button" onClick={() => step(1)} aria-label={t.next} className="absolute -end-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-card text-primary shadow-lg ring-1 ring-border md:-end-6">
                  <ChevronRight className="h-6 w-6 rtl:rotate-180" aria-hidden />
                </button>
              </>
            )}
          </figure>
        )}
      </dialog>
    </>
  );
}
