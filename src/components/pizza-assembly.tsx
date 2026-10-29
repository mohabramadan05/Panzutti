"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { Mascot } from "./brand";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import "./pizza-assembly.css";

const LAST = 5; // 0 dough · 1 bake · 2 slice open · 3 cheese · 4 fillings · 5 ready
const STEP_MS = 2200; // time on each step
const DONE_MS = 4000; // time the finished panuozzo stays before it starts again

// Filling positions in % of the panuozzo box (centre = 50/50). All sit inside the sliced-open crumb.
const FILLINGS: { kind: "salami" | "tomato" | "rocket"; x: number; y: number; r: number }[] = [
  { kind: "salami", x: 20, y: 50, r: 0 },
  { kind: "salami", x: 34, y: 46, r: 0 },
  { kind: "salami", x: 48, y: 53, r: 0 },
  { kind: "salami", x: 62, y: 47, r: 0 },
  { kind: "salami", x: 76, y: 52, r: 0 },
  { kind: "tomato", x: 27, y: 40, r: 20 },
  { kind: "tomato", x: 55, y: 60, r: -15 },
  { kind: "tomato", x: 70, y: 39, r: 40 },
  { kind: "tomato", x: 41, y: 61, r: -30 },
  { kind: "rocket", x: 24, y: 60, r: -25 },
  { kind: "rocket", x: 42, y: 38, r: 15 },
  { kind: "rocket", x: 58, y: 40, r: -10 },
  { kind: "rocket", x: 80, y: 41, r: 30 },
  { kind: "rocket", x: 68, y: 61, r: -40 },
];

// Melted cheese dripping from under the closed lid (% from the start edge).
const DRIPS = [{ x: 30, h: 9 }, { x: 47, h: 13 }, { x: 63, h: 8 }, { x: 74, h: 11 }];

export function PizzaAssembly({ locale, t }: { locale: Locale; t: Dictionary["pizza"] }) {
  const [stage, setStage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const done = stage === LAST;
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
    const id = window.setTimeout(() => setStage((s) => (s >= LAST ? 0 : s + 1)), stage === LAST ? DONE_MS : STEP_MS);
    return () => window.clearTimeout(id);
  }, [stage, playing, visible]);

  const layer = {
    initial: reduce ? { opacity: 0 } : { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: reduce ? { opacity: 0 } : { scale: 0, opacity: 0 },
    transition: { duration: reduce ? 0 : 0.8, ease: "easeOut" as const },
  };

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

          <ol className="pz-dots" aria-hidden>
            {t.steps.map((s, i) => (
              <li key={s.t} className={cn("pz-dot", i <= stage && "is-on", i === stage && "is-current")} />
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

        <div className="pz-stage">
          {/* the character points at the panuozzo while it builds itself */}
          <Mascot point="end" className="pz-mascot" />
          <div className="pz-board" aria-hidden />
          <motion.div
            className="pnz"
            role="img"
            aria-label={step.t}
            animate={done && !reduce ? { scale: [1, 1.08, 0.97, 1.02, 1], rotate: [0, -3, 2, -1, 0] } : { scale: 1, rotate: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          >
            <div className="pnz-dough" />

            <AnimatePresence>
              {stage >= 1 && (
                <motion.div
                  key="crust"
                  className="pnz-crust"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 1, ease: "easeOut" }}
                />
              )}
              {stage >= 2 && (
                <motion.div
                  key="cut"
                  className="pnz-cut"
                  style={{ originX: locale === "ar" ? 1 : 0 }}
                  initial={reduce ? { opacity: 0 } : { scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: 1, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduce ? 0 : 0.8, ease: "easeInOut" }}
                />
              )}
              {stage >= 3 && <motion.div key="cheese" className="pnz-cheese" {...layer} />}
            </AnimatePresence>

            <AnimatePresence>
              {stage >= 4 &&
                FILLINGS.map((f, index) => (
                  <div key={`${f.kind}-${index}`} className="pz-spot" style={{ left: `${f.x}%`, top: `${f.y}%` }}>
                    <motion.div
                      className={`pnz-${f.kind}`}
                      initial={reduce ? { opacity: 0, rotate: f.r } : { y: -150, opacity: 0, scale: 0.5, rotate: f.r - 60 }}
                      animate={{ y: 0, opacity: 1, scale: 1, rotate: f.r }}
                      exit={{ opacity: 0, scale: reduce ? 1 : 0.5, transition: { duration: reduce ? 0 : 0.25 } }}
                      transition={reduce ? { duration: 0 } : { delay: index * 0.08, type: "spring", stiffness: 220, damping: 13 }}
                    />
                  </div>
                ))}
            </AnimatePresence>

            {/* the top half of the bread folds over the fillings and closes it like a sandwich */}
            <AnimatePresence>
              {done && (
                <motion.div
                  key="lid"
                  className="pnz-lid"
                  style={{ originY: 0, transformPerspective: 600 }}
                  initial={reduce ? { opacity: 0 } : { rotateX: -170, opacity: 0 }}
                  animate={{ rotateX: 0, opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.3, 1.25, 0.5, 1], opacity: { duration: 0.2 } }}
                />
              )}
              {done &&
                DRIPS.map((d, index) => (
                  <motion.span
                    key={`drip-${d.x}`}
                    className="pnz-drip"
                    style={{ insetInlineStart: `${d.x}%`, height: `${d.h}%`, originY: 0 }}
                    initial={reduce ? { opacity: 0 } : { scaleY: 0, opacity: 0 }}
                    animate={{ scaleY: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.8 + index * 0.12, ease: "easeIn" }}
                  />
                ))}
            </AnimatePresence>
          </motion.div>

          <AnimatePresence>
            {done && (
              <motion.span
                key="sticker"
                className={cn("pz-sticker", locale === "ar" ? "font-arabic" : "font-script")}
                initial={reduce ? { opacity: 0 } : { scale: 0, rotate: -40, opacity: 0 }}
                animate={{ scale: 1, rotate: 12, opacity: 1 }}
                exit={{ opacity: 0, scale: reduce ? 1 : 0 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 12, delay: 0.3 }}
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
