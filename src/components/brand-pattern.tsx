/* eslint-disable @next/next/no-img-element -- tiny decorative brand crop */
import { cn } from "@/lib/utils";

/**
 * The Panzutti chain pattern (green-dot version of the brand pattern sheet), cropped straight from
 * the sheet with a transparent background:
 *   /brand/pattern-link.png  one link (arch + U + dot), 94×236
 *   /brand/pattern-tile.png  one row of 4 links that repeats seamlessly, 380×248
 */

/** One link, used as a separator (e.g. between items in the marquee). Size it with h-*. */
export function ChainMark({ className }: { className?: string }) {
  return <img src="/brand/pattern-link.png" alt="" aria-hidden width={94} height={236} className={cn("h-8 w-auto shrink-0", className)} />;
}

/** The pattern repeated over the whole parent (position the parent `relative`). `size` = width of one tile in px. */
export function ChainPattern({ className, size = 190 }: { className?: string; size?: number }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 bg-repeat", className)}
      style={{ backgroundImage: "url(/brand/pattern-tile.png)", backgroundSize: `${size}px auto` }}
    />
  );
}
