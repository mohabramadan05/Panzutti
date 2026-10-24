"use client";

/**
 * Scroll-driven pizza assembly (GSAP + ScrollTrigger).
 *
 * How scroll maps to the animation
 * --------------------------------
 * 1. `.pizza-scrollytelling-container` is exactly one viewport tall (100vh).
 * 2. ScrollTrigger pins it at `start: "top top"` — the moment its top edge meets the top of the
 *    viewport — and keeps it pinned for `end: "+=" + SCROLL_SCREENS * window.innerHeight` pixels.
 *    While pinned, ScrollTrigger adds that same distance as padding below the section, so the
 *    document grows by SCROLL_SCREENS viewport heights and the page below waits its turn.
 * 3. `scrub: 1` ties the timeline's progress (0 → 1) to the scroll position inside that range:
 *    scrolled px since start ÷ total pin distance = timeline progress. The `1` means the playhead
 *    takes ~1s to catch up with the scrollbar, which smooths out wheel/trackpad jumps.
 * 4. The timeline's own durations are relative, not seconds. Its total length is stretched over
 *    the pin distance, so a tween with duration 1 in a 5-unit timeline uses 1/5 of the scroll.
 * 5. Distances that depend on the viewport (e.g. "drop from above the screen") are function
 *    values. With `invalidateOnRefresh: true` ScrollTrigger re-reads them, and the `end` value,
 *    after every resize or orientation change, so the binding stays correct on any screen.
 *
 * Users who prefer reduced motion get no pin and no tweens: the DOM is the finished pizza, and
 * every step of the copy is listed (see the `motion-reduce:` classes).
 */

import { useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowDown } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { PIZZA_PHOTOS, type PhotoCrop } from "@/lib/pizza-photos";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** How many viewport heights of scrolling the whole assembly takes. */
const SCROLL_SCREENS = 4;
/** Timeline labels, in order. Index = copy step shown in the side panel. */
const PHASES = ["crust", "sauce", "cheese", "toppings"] as const;

// ---------------------------------------------------------------- deterministic layout
// Positions are computed (not random) so server and client render identical markup.
// Golden-angle spiral: evenly spread points inside a circle of radius `r` (% of the pizza box).
const spiral = (n: number, r: number, offset = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i + offset) * 2.39996; // golden angle in radians
    const d = Math.sqrt((i + 0.5) / n) * r;
    return { x: 50 + Math.cos(a) * d, y: 50 + Math.sin(a) * d };
  });

// Layer geometry, as fractions of the pizza box. Sauce sits inside the dough, cheese inside the sauce.
const SAUCE_INSET = 0.15;
const CHEESE_INSET = 0.19;
const CHEESE_SIZE = 1 - 2 * CHEESE_INSET;
/** Diameter of one falling piece of cheese. */
const PIECE = 0.12;

const PIECES = spiral(34, 24); // stays inside the cheese circle (radius 31%) minus half a piece
const PEPPERONI = spiral(8, 25, 0.6);
const BASIL = [
  { x: 40, y: 32, deg: 25 },
  { x: 64, y: 50, deg: -40 },
  { x: 35, y: 55, deg: 110 },
  { x: 56, y: 73, deg: 10 },
];

// ---------------------------------------------------------------- photo layers
/** Soft circular edge so photo layers blend into the layer below instead of looking stamped. */
const SOFT_EDGE = "radial-gradient(circle, #000 67%, transparent 71%)";
/** Basil leaf outline (tip on the left, like the leaf in the source photo). */
const LEAF = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 56"><path d="M2 28C40-2 88 2 97 28C88 54 40 58 2 28Z"/></svg>',
)}")`;
const LEAF_AR = 100 / 56;

const softEdge: CSSProperties = { WebkitMaskImage: SOFT_EDGE, maskImage: SOFT_EDGE };
const leafMask: CSSProperties = { WebkitMaskImage: LEAF, maskImage: LEAF, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" };

/**
 * Shows the `crop` region of a photo filling its (overflow-hidden) parent.
 * `boxAr` is the parent's width / height. Positions are % of the parent, so it scales with the pizza.
 */
function Photo({ crop, boxAr = 1 }: { crop: PhotoCrop; boxAr?: number }) {
  const k = 1 / crop.d; // photo width in parent widths
  return (
    // eslint-disable-next-line @next/next/no-img-element -- hotlinked Unsplash crop, positioned beyond its box
    <img
      src={crop.src}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none select-none"
      style={{
        width: `${k * 100}%`,
        left: `${(0.5 - crop.cx * k) * 100}%`,
        top: `${(0.5 - crop.cy * (k / crop.ar) * boxAr) * 100}%`,
      }}
    />
  );
}

/** Places an element centred on (x%, y%). Uses the individual `translate`/`rotate` CSS
 *  properties so GSAP is free to animate `transform` without overwriting the placement. */
const place = (x: number, y: number, deg = 0): CSSProperties => ({
  left: `${x}%`,
  top: `${y}%`,
  translate: "-50% -50%",
  rotate: `${deg}deg`,
});

export function PizzaScrollytelling({ t }: { t: Dictionary["scrolly"] }) {
  const container = useRef<HTMLElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  useGSAP(
    () => {
      const q = gsap.utils.selector(container);
      const mm = gsap.matchMedia();

      // Everything below is skipped (and reverted live) when the user prefers reduced motion.
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const vh = () => window.innerHeight;
        const vw = () => window.innerWidth;

        const tl = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            trigger: container.current,
            start: "top top", // pin when the section's top hits the viewport's top
            end: () => `+=${vh() * SCROLL_SCREENS}`, // …and hold it for N viewport heights of scroll
            pin: true,
            scrub: 1, // playhead follows the scrollbar with 1s of smoothing
            invalidateOnRefresh: true, // re-run function values (vh/vw) after resize
          },
          // Runs on every playhead move (scrub included): sync the side panel and progress bar
          onUpdate: () => {
            const now = tl.time() + 0.001;
            let active = 0;
            PHASES.forEach((p, i) => {
              if (tl.labels[p] <= now) active = i;
            });
            setStep(active); // React skips the render when the value is unchanged
            if (bar.current) bar.current.style.transform = `scaleX(${tl.progress()})`;
          },
        });

        tl.to(q(".js-hint"), { autoAlpha: 0, y: 20, duration: 0.3 }, 0)

          // Layer 1 — crust drops from just above the top edge of the viewport into the centre
          .addLabel("crust", 0)
          .from(q(".js-crust"), { y: () => -vh(), rotation: -30, scale: 0.85, ease: "power2.out", duration: 1 }, "crust")

          // Layer 2 — sauce grows from nothing once the crust has landed
          .addLabel("sauce")
          .from(q(".js-sauce"), { scale: 0, autoAlpha: 0, rotation: 90, ease: "power1.out", duration: 0.9 }, "sauce+=0.05")

          // Layer 3 — mozzarella rains down in pieces. Each piece shows its own patch of the cheese
          // photo, so the pieces land as one picture; the full layer then fades in to fill the gaps.
          .addLabel("cheese")
          .from(
            q(".js-piece"),
            {
              y: () => -vh() * 0.9,
              autoAlpha: 0,
              rotation: (i) => (i % 2 ? 120 : -120),
              ease: "power1.in",
              duration: 0.5,
              stagger: { each: 0.025, from: "random" },
            },
            "cheese",
          )
          .from(q(".js-melt"), { autoAlpha: 0, duration: 0.4 }, ">-0.2")

          // Layer 4 — pepperoni flies in from alternating sides, basil floats down rotating
          .addLabel("toppings")
          .from(
            q(".js-pep"),
            {
              x: (i) => (i % 2 ? 1 : -1) * vw() * 0.6,
              y: () => -vh() * 0.4,
              rotation: (i) => (i % 2 ? 240 : -240),
              autoAlpha: 0,
              ease: "back.out(1.3)",
              duration: 0.7,
              stagger: 0.08,
            },
            "toppings",
          )
          .from(
            q(".js-basil"),
            {
              x: (i) => (i % 2 ? -1 : 1) * 120,
              y: () => -vh() * 0.6,
              rotation: (i) => (i % 2 ? -200 : 200),
              autoAlpha: 0,
              ease: "power2.out",
              duration: 0.7,
              stagger: 0.1,
            },
            "toppings+=0.3",
          )
          // Short hold at the end so the finished pizza sits still before the pin releases
          .to({}, { duration: 0.5 });
      });

      return () => mm.revert();
    },
    { scope: container },
  );

  return (
    <section
      ref={container}
      aria-labelledby="scrolly-title"
      className="pizza-scrollytelling-container relative h-screen overflow-hidden bg-[#111417] text-white motion-reduce:h-auto motion-reduce:min-h-screen"
    >
      {/* warm glow so the food pops off the slate */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_68%_50%,rgb(254_217_0/.10),transparent_45%),radial-gradient(circle_at_20%_90%,rgb(192_29_46/.12),transparent_40%)]" />

      <div className="relative mx-auto grid h-full max-w-6xl grid-rows-[1fr_auto] items-center gap-6 px-4 pb-10 pt-20 md:grid-cols-[1fr_1.15fr] md:grid-rows-1 md:gap-12 md:pb-0">
        {/* -------------------------------------------------------- side panel copy */}
        <div className="order-2 md:order-1">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-brand-yellow">{t.kicker}</p>
          <h1 id="scrolly-title" className="sr-only">{t.metaTitle}</h1>

          <div aria-live="polite" className="mt-4 grid motion-reduce:gap-8">
            {t.steps.map((s, i) => (
              <div
                key={s.t}
                aria-hidden={i !== step}
                className={cn(
                  "[grid-area:1/1] transition-[opacity,translate] ease-out motion-reduce:[grid-area:auto] motion-reduce:opacity-100",
                  // outgoing copy leaves quickly; incoming copy waits for it, so the two never overlap
                  i === step ? "translate-y-0 opacity-100 delay-200 duration-500" : "duration-200",
                  i < step && "-translate-y-4 opacity-0",
                  i > step && "translate-y-4 opacity-0",
                )}
              >
                <p className="font-display text-sm text-white/50">{t.stepLabel.replace("{n}", String(i + 1))}</p>
                <h2 className="mt-2 text-3xl leading-tight md:text-6xl">{s.t}</h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-white/65 md:text-lg">{s.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-4 motion-reduce:hidden" aria-hidden>
            <span className="font-display text-sm tabular-nums text-white/80">0{step + 1}</span>
            <div className="h-0.5 flex-1 rounded-full bg-white/15">
              {/* initial scale inline, not `scale-x-0`: Tailwind v4 uses the `scale` property, which would multiply with the transform set in onUpdate */}
              <div ref={bar} className="h-0.5 origin-left rounded-full bg-brand-yellow rtl:origin-right" style={{ transform: "scaleX(0)" }} />
            </div>
            <span className="font-display text-sm tabular-nums text-white/40">0{PHASES.length}</span>
          </div>
        </div>

        {/* -------------------------------------------------------- pizza stage (layer stack) */}
        <div className="order-1 flex items-center justify-center md:order-2">
          <div
            role="img"
            aria-label={t.steps.map((s) => s.t).join(", ")}
            className="relative size-[min(78vw,44vh)] md:size-[min(44vw,72vh,560px)]"
            dir="ltr"
          >
            {/* Layer 1 — crust: dough on its floured board. Background colours show while photos load. */}
            <div className="js-crust absolute inset-0 overflow-hidden rounded-full bg-[#8a6a45] shadow-[0_40px_80px_-20px_rgb(0_0_0/.8)]">
              <Photo crop={PIZZA_PHOTOS.crust} />
            </div>

            {/* Layer 2 — sauce */}
            <div className="js-sauce absolute overflow-hidden rounded-full bg-[#b3311f]" style={{ inset: `${SAUCE_INSET * 100}%`, ...softEdge }}>
              <Photo crop={PIZZA_PHOTOS.sauce} />
            </div>

            {/* Layer 3 — full cheese layer, faded in under the pieces once they have landed */}
            <div className="js-melt absolute overflow-hidden rounded-full" style={{ inset: `${CHEESE_INSET * 100}%`, ...softEdge }}>
              <Photo crop={PIZZA_PHOTOS.cheese} />
            </div>
            {/* Layer 3 — falling pieces: each window shows the cheese layer exactly where it will land */}
            {PIECES.map((p, i) => (
              <span
                key={`c${i}`}
                className="js-piece absolute aspect-square overflow-hidden rounded-[46%_54%_50%_50%/52%_46%_54%_48%]"
                style={{ ...place(p.x, p.y), width: `${PIECE * 100}%` }}
              >
                <span
                  className="absolute"
                  style={{
                    width: `${(CHEESE_SIZE / PIECE) * 100}%`,
                    aspectRatio: "1",
                    left: `${((CHEESE_INSET - (p.x / 100 - PIECE / 2)) / PIECE) * 100}%`,
                    top: `${((CHEESE_INSET - (p.y / 100 - PIECE / 2)) / PIECE) * 100}%`,
                  }}
                >
                  <Photo crop={PIZZA_PHOTOS.cheese} />
                </span>
              </span>
            ))}

            {/* Layer 4 — pepperoni: one real slice, turned differently each time so repeats don't show */}
            {PEPPERONI.map((p, i) => (
              <span
                key={`p${i}`}
                className="js-pep absolute aspect-square w-[12%] overflow-hidden rounded-full bg-[#9c2a1c] shadow-[0_3px_6px_rgb(0_0_0/.45)] after:absolute after:inset-0 after:rounded-full after:shadow-[inset_0_0_6px_rgb(60_0_0/.6)]"
                style={place(p.x, p.y, (i * 83) % 360)}
              >
                <Photo crop={PIZZA_PHOTOS.pepperoni} />
              </span>
            ))}

            {/* Layer 4 — basil: leaf-shaped mask over a real leaf (shadow on the wrapper so the mask can't clip it) */}
            {BASIL.map((p, i) => (
              <span
                key={`b${i}`}
                className="js-basil absolute w-[16%] drop-shadow-[0_2px_3px_rgb(0_0_0/.45)]"
                style={{ ...place(p.x, p.y, p.deg), aspectRatio: `${LEAF_AR}` }}
              >
                <span className="absolute inset-0 overflow-hidden bg-[#3f7d2c]" style={leafMask}>
                  <Photo crop={PIZZA_PHOTOS.basil} boxAr={LEAF_AR} />
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* scroll hint, faded out by the first tween */}
      <p className="js-hint pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-white/50 motion-reduce:hidden">
        {t.hint}
        <ArrowDown className="h-4 w-4 animate-bounce" aria-hidden />
      </p>
    </section>
  );
}
