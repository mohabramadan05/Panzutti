/* eslint-disable @next/next/no-img-element -- logo/mascot are transparent PNGs of unknown size */
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Logo({ variant = "red", className }: { variant?: "red" | "cream"; className?: string }) {
  return (
    <img
      src={variant === "red" ? brand.logoRed : brand.logoCream}
      alt="Panzutti — Panuozzo & More"
      className={cn("h-10 w-auto object-contain", className)}
    />
  );
}

/**
 * The Panzutti character (curly hair, cream shirt). In the drawing he points with his raised hand to
 * the viewer's left. `point` turns him so he points at the content, in English and in Arabic (RTL):
 * "start" = towards where text begins, "end" = towards where it ends.
 */
export function Mascot({ className, point, eager }: { className?: string; point?: "start" | "end"; eager?: boolean }) {
  return (
    <img
      src={brand.mascot}
      alt=""
      aria-hidden
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      width={525}
      height={900}
      className={cn(
        "block w-auto select-none object-contain",
        point === "end" && "ltr:-scale-x-100",
        point === "start" && "rtl:-scale-x-100",
        className,
      )}
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
