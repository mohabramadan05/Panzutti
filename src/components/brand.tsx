/* eslint-disable @next/next/no-img-element -- transparent mascot cut-outs, sized by CSS height */
import { FACES_RIGHT, MASCOTS, type MascotPose } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Text wordmark (self-hosted fonts, no image request). The old logo PNGs on panzutti.com are gone;
 * to use a real logo file later, drop it in /public/brand and render an <img> here — nothing else changes.
 */
export function Logo({ variant = "red", className }: { variant?: "red" | "cream"; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Panzutti — Panuozzo & More"
      className={cn("inline-flex h-10 flex-col items-center justify-center leading-none", variant === "red" ? "text-brand-red" : "text-brand-cream", className)}
    >
      <span aria-hidden className="font-script text-[2.1rem] leading-[0.95] md:text-[2.4rem]">Panzutti</span>
      <span aria-hidden className={cn("mt-0.5 text-[0.55rem] font-extrabold uppercase tracking-[0.35em]", variant === "red" ? "text-primary" : "text-brand-yellow")}>
        Panuozzo &amp; more
      </span>
    </span>
  );
}

/**
 * The Panzutti character. `pose` picks a drawing from the mascot sheet (lib/brand.ts → MASCOTS).
 * `point` turns him so he points/looks at the content, in English and in Arabic (RTL):
 * "start" = towards where text begins, "end" = towards where it ends.
 */
export function Mascot({
  className,
  point,
  eager,
  pose = "classic",
}: {
  className?: string;
  point?: "start" | "end";
  eager?: boolean;
  pose?: MascotPose;
}) {
  const m = MASCOTS[pose];
  const right = FACES_RIGHT.has(pose);
  // In LTR "end" is the right side; in RTL it is the left side.
  const flipLtr = point === "end" ? !right : point === "start" ? right : false;
  const flipRtl = point === "end" ? right : point === "start" ? !right : false;
  return (
    <img
      src={m.src}
      alt=""
      aria-hidden
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      width={m.w}
      height={m.h}
      className={cn("block w-auto select-none object-contain", flipLtr && "ltr:-scale-x-100", flipRtl && "rtl:-scale-x-100", className)}
    />
  );
}

export function SectionTitle({
  kicker,
  title,
  className,
  light,
}: {
  kicker?: string;
  title: string;
  className?: string;
  light?: boolean;
}) {
  return (
    <div className={cn("mb-8", className)}>
      {kicker && (
        <p className={cn("mb-2 text-sm font-bold uppercase tracking-[0.2em]", light ? "text-brand-yellow" : "text-brand-red")}>
          {kicker}
        </p>
      )}
      <h2 className={cn("text-4xl md:text-5xl", light ? "text-brand-cream" : "text-primary")}>{title}</h2>
    </div>
  );
}
