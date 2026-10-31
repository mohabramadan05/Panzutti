"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { Mascot } from "./brand";
import type { Dictionary, Locale } from "@/lib/i18n";
import { PIZZA_PHOTOS, type PhotoCrop } from "@/lib/pizza-photos";
import { cn } from "@/lib/utils";
import "./pizza-assembly.css";

const LAST = 5; // 0 dough · 1 sauce · 2 mozzarella · 3 fillings · 4 oven · 5 ready (folded)
const STEP_MS = 2400; // time on each step
const DONE_MS = 4000; // time the finished panuozzo stays before it starts again

/*
 * Everything on the plate is a real photo. The round base is the same photo series as the /pizza page
 * (dough → sauce on that dough → mozzarella on that sauce), each shown as a round crop and laid over
 * the previous one. Tomatoes (Original Caprese menu photo), basil and mozzarella clusters are photo
 * cut-outs in public/pizza/build, and the finished panuozzo is the Capri menu photo.
 */
const READY = "/pizza/build/ready.webp";

// Mozzarella clusters that fall onto the sauce while the cheese photo fades in (% of the disc)
const CHEESE = [
  { n: 1, x: 32, y: 34, r: -20 },
  { n: 3, x: 64, y: 30, r: 35 },
  { n: 5, x: 50, y: 52, r: 10 },
  { n: 2, x: 28, y: 64, r: -40 },
  { n: 4, x: 70, y: 66, r: 60 },
].map((c) => ({ ...c, src: `/pizza/build/cheese-${c.n}.webp` }));

// Fillings, in % of the disc (centre = 50/50), all inside the sauce
const FILLINGS: { kind: "tomato" | "basil"; x: number; y: number; r: number; flip?: boolean }[] = [
  { kind: "tomato", x: 34, y: 30, r: -10 },
  { kind: "tomato", x: 66, y: 34, r: 25 },
  { kind: "tomato", x: 26, y: 56, r: -30 },
  { kind: "tomato", x: 52, y: 50, r: 15 },
  { kind: "tomato", x: 74, y: 60, r: -20 },
  { kind: "tomato", x: 46, y: 74, r: 40 },
  { kind: "basil", x: 50, y: 28, r: -20 },
  { kind: "basil", x: 34, y: 76, r: 30, flip: true },
  { kind: "basil", x: 72, y: 46, r: -35 },
  { kind: "basil", x: 30, y: 40, r: 120, flip: true },
];
const FILLING_SRC = { tomato: "/pizza/build/tomato-a.webp", basil: "/pizza/build/basil-a.webp" };

// Flour dust that puffs off the dough as it lands (angle in degrees around the disc, distance in % of the stage width)
const FLOUR = Array.from({ length: 10 }, (_, i) => ({ a: i * 36 + (i % 2 ? 14 : 0), d: 34 + (i % 3) * 6, s: 10 + (i % 4) * 5 }));
// Embers rising from the wood-fired oven (left in %, delay and duration in s, size in px)
const EMBERS = Array.from({ length: 18 }, (_, i) => ({ x: 8 + ((i * 37) % 84), delay: (i * 0.19) % 1.6, dur: 1.5 + (i % 4) * 0.35, s: 7 + (i % 3) * 3 }));

/** The `crop` region of a photo filling its round (overflow-hidden) parent. */
function Photo({ crop }: { crop: PhotoCrop }) {
  const k = 1 / crop.d; // photo width in parent widths
  return (
    // eslint-disable-next-line @next/next/no-img-element -- crop positioned beyond its box
    <img
      src={crop.src}
      alt=""
      draggable={false}
      className="pointer-events-none absolute max-w-none select-none"
      style={{ width: `${k * 100}%`, left: `${(0.5 - crop.cx * k) * 100}%`, top: `${(0.5 - crop.cy * (k / crop.ar)) * 100}%` }}
    />
  );
}

export function PizzaAssembly({ locale, t }: { locale: Locale; t: Dictionary["pizza"] }) {
  const [stage, setStage] = useState(0);
  const [round, setRound] = useState(0); // bumps on every loop, so the dough drops in again
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const done = stage === LAST;
  const baking = stage === 4;
  const step = t.steps[stage];
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  // Builds itself step by step, only while the section is on screen, and loops after showing the finished panuozzo.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const id = window.setTimeout(() => {
      if (stage >= LAST) setRound((r) => r + 1);
      setStage(stage >= LAST ? 0 : stage + 1);
    }, stage === LAST ? DONE_MS : STEP_MS);
    return () => window.clearTimeout(id);
  }, [stage, playing, visible]);

  const fade = (d = 0.8) => ({ duration: reduce ? 0 : d, ease: "easeOut" as const });

  return (
    <section ref={ref} className="pz-section" aria-labelledby="pizza-title">
      <div className="pz-inner">
        <div className="pz-copy">
          <p className="pz-kicker">{t.kicker}</p>
          <h2 id="pizza-title" className="pz-title">{t.title}</h2>
          <p className="pz-body">{t.body}</p>

          <div className="pz-step" aria-live="polite" aria-atomic="true">
            <p className="pz-step-count">{t.step.replace("{n}", String(stage + 1)).replace("{total}", String(LAST + 1))}</p>
            <AnimatePresence mode="wait">
              <motion.div
                key={stage}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
                transition={{ duration: reduce ? 0 : 0.35 }}
              >
                <p className={cn("pz-step-title", locale === "ar" ? "font-arabic" : "font-script")}>{step.t}</p>
                <p className="pz-step-desc">{step.d}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* steps: click one to jump to it */}
          <ol className="pz-dots">
            {t.steps.map((s, i) => (
              <li key={s.t}>
                <button
                  type="button"
                  onClick={() => setStage(i)}
                  aria-label={`${t.step.replace("{n}", String(i + 1)).replace("{total}", String(LAST + 1))}: ${s.t}`}
                  aria-current={i === stage ? "step" : undefined}
                  className={cn("pz-dot", i <= stage && "is-on", i === stage && "is-current")}
                />
              </li>
            ))}
          </ol>

          <div className="pz-actions">
            <Link href={`/${locale}/menu`} className="pz-button">
              {t.order} <Arrow className="h-4 w-4" aria-hidden />
            </Link>
            <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing} className="pz-link">
              {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              {playing ? t.pause : t.play}
            </button>
          </div>
        </div>

        <div className="pz-stage" role="img" aria-label={step.t}>
          {/* the character points at the panuozzo while it builds itself */}
          <Mascot point="end" className="pz-mascot" />
          <div className={cn("pz-plate", baking && "is-baking")} aria-hidden />

          {/* progress around the plate: fills up while the current step plays */}
          <svg className="pz-ring" viewBox="0 0 100 100" aria-hidden>
            <circle cx="50" cy="50" r="48" className="pz-ring-track" />
            {playing && visible && !reduce && (
              <motion.circle
                key={stage}
                cx="50"
                cy="50"
                r="48"
                className="pz-ring-fill"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: (done ? DONE_MS : STEP_MS) / 1000, ease: "linear" }}
              />
            )}
          </svg>

          {/* flour dust puffing off the dough as it lands */}
          <AnimatePresence>
            {stage === 0 &&
              !reduce &&
              FLOUR.map((f, i) => (
                <motion.span
                  key={`flour-${i}`}
                  className="pz-flour"
                  style={{ width: f.s, height: f.s }}
                  initial={{ opacity: 0, x: "-50%", y: "-50%", scale: 0.3 }}
                  animate={{
                    opacity: [0, 0.9, 0],
                    scale: [0.3, 1.4, 2],
                    x: `calc(-50% + ${(Math.cos((f.a * Math.PI) / 180) * f.d).toFixed(1)}cqw)`,
                    y: `calc(-50% + ${(Math.sin((f.a * Math.PI) / 180) * f.d).toFixed(1)}cqw)`,
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 1.4, delay: 0.25 + (i % 3) * 0.05, ease: "easeOut" }}
                />
              ))}
          </AnimatePresence>

          {/* the round base: real photos stacked, each one laid over the last */}
          <motion.div
            key={round}
            className="pz-disc"
            style={{ transformPerspective: 800 }}
            animate={
              done
                ? { opacity: 0, scale: reduce ? 1 : 0.6, rotateX: reduce ? 0 : 70, y: 0 }
                : { opacity: 1, scale: 1, rotateX: 0, rotate: reduce ? 0 : stage * 14, y: 0, filter: baking ? "saturate(1.35) brightness(1.02) sepia(0.3) contrast(1.06)" : "saturate(1) brightness(1) sepia(0) contrast(1)" }
            }
            initial={reduce ? false : { y: -80, opacity: 0, scale: 0.9 }}
            transition={
              reduce
                ? { duration: 0 }
                : { duration: done ? 0.6 : 0.9, ease: "easeOut", rotate: { type: "spring", stiffness: 40, damping: 12 }, y: { type: "spring", stiffness: 260, damping: 16 } }
            }
          >
            <Photo crop={PIZZA_PHOTOS.crust} />

            <AnimatePresence>
              {stage >= 1 && stage < LAST && (
                <motion.div
                  key="sauce"
                  className="pz-layer"
                  initial={reduce ? { opacity: 0 } : { clipPath: "circle(0% at 50% 50%)", rotate: -200 }}
                  animate={reduce ? { opacity: 1 } : { clipPath: "circle(50% at 50% 50%)", rotate: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 1.3, ease: "easeInOut" }}
                >
                  <Photo crop={PIZZA_PHOTOS.sauce} />
                </motion.div>
              )}
              {stage >= 2 && stage < LAST && (
                <motion.div key="cheese" className="pz-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ ...fade(0.9), delay: reduce ? 0 : 0.5 }}>
                  <Photo crop={PIZZA_PHOTOS.cheese} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* mozzarella sprinkled by hand while the cheese photo melts in underneath */}
            <AnimatePresence>
              {stage === 2 &&
                CHEESE.map((c, i) => (
                  <motion.img
                    key={`cheese-${i}`}
                    src={c.src}
                    alt=""
                    className="pz-piece pz-mozz"
                    style={{ left: `${c.x}%`, top: `${c.y}%` }}
                    initial={reduce ? { opacity: 0, rotate: c.r } : { opacity: 0, y: -60, scale: 1.3, rotate: c.r - 40 }}
                    animate={{ opacity: [0, 1, 1, 0], y: 0, scale: 1, rotate: c.r }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 1.6, delay: reduce ? 0 : i * 0.08, times: [0, 0.2, 0.6, 1], ease: "easeOut" }}
                  />
                ))}
            </AnimatePresence>

            <AnimatePresence>
              {stage >= 3 &&
                stage < LAST &&
                FILLINGS.map((f, i) => (
                  <motion.img
                    key={`${f.kind}-${i}`}
                    src={FILLING_SRC[f.kind]}
                    alt=""
                    className={cn("pz-piece", `pz-${f.kind}`, f.flip && "-scale-x-100")}
                    style={{ left: `${f.x}%`, top: `${f.y}%` }}
                    initial={reduce ? { opacity: 0, rotate: f.r } : { y: -140, opacity: 0, scale: 0.6, rotate: f.r - 60 }}
                    animate={{ y: 0, opacity: 1, scale: 1, rotate: f.r }}
                    exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.25 } }}
                    transition={reduce ? { duration: 0 } : { delay: i * 0.08, type: "spring", stiffness: 220, damping: 14 }}
                  />
                ))}
            </AnimatePresence>

            {/* wood-fired oven: warm flickering light over the whole disc */}
            <AnimatePresence>
              {baking && <motion.div key="fire" className="pz-fire" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade(0.6)} />}
            </AnimatePresence>
          </motion.div>

          {/* embers rising from the oven while it bakes */}
          {baking && !reduce && (
            <div className="pz-embers" aria-hidden>
              {EMBERS.map((e, i) => (
                <span
                  key={i}
                  className="pz-ember"
                  style={{ left: `${e.x}%`, width: e.s, height: e.s, animationDelay: `${e.delay}s`, animationDuration: `${e.dur}s` }}
                />
              ))}
            </div>
          )}

          {/* steam over the finished panuozzo */}
          {done && !reduce && (
            <div className="pz-steam" aria-hidden>
              <span />
              <span />
              <span />
            </div>
          )}

          {/* done: folded shut — the real thing, straight from the menu photo */}
          <AnimatePresence>
            {done && (
              <motion.img
                key="ready"
                src={READY}
                alt=""
                className="pz-ready"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.7, delay: 0.2, ease: [0.3, 1.25, 0.5, 1] }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {done && (
              <motion.span
                key="sticker"
                className={cn("pz-sticker", locale === "ar" ? "font-arabic" : "font-script")}
                initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -40, opacity: 0 }}
                animate={{ scale: 1, rotate: 12, opacity: 1 }}
                exit={{ opacity: 0, scale: reduce ? 1 : 0 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 12, delay: 0.5 }}
                aria-hidden
              >
                {t.steps[LAST].t}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
