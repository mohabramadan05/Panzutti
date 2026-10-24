"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Plus, RotateCcw } from "lucide-react";
import type { Dictionary, Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import "./pizza-assembly.css";

const LAST = 4; // 0 dough · 1 sauce · 2 cheese · 3 toppings · 4 ready

// Topping positions in % of the pizza box (centre = 50/50). All sit inside the cheese circle.
const TOPPINGS: { kind: "pepperoni" | "mushroom" | "basil"; x: number; y: number; r: number }[] = [
  { kind: "pepperoni", x: 50, y: 24, r: 0 },
  { kind: "pepperoni", x: 28, y: 42, r: 0 },
  { kind: "pepperoni", x: 70, y: 40, r: 0 },
  { kind: "pepperoni", x: 40, y: 66, r: 0 },
  { kind: "pepperoni", x: 66, y: 70, r: 0 },
  { kind: "pepperoni", x: 50, y: 47, r: 0 },
  { kind: "mushroom", x: 36, y: 30, r: -20 },
  { kind: "mushroom", x: 74, y: 57, r: 25 },
  { kind: "mushroom", x: 26, y: 60, r: 10 },
  { kind: "mushroom", x: 56, y: 82, r: -35 },
  { kind: "basil", x: 62, y: 28, r: 35 },
  { kind: "basil", x: 38, y: 50, r: -40 },
  { kind: "basil", x: 60, y: 58, r: 120 },
  { kind: "basil", x: 44, y: 80, r: 70 },
];

export function PizzaAssembly({ locale, t }: { locale: Locale; t: Dictionary["pizza"] }) {
  const [stage, setStage] = useState(0);
  const reduce = useReducedMotion();
  const next = () => setStage((s) => Math.min(s + 1, LAST));
  const reset = () => setStage(0);
  const done = stage === LAST;
  const step = t.steps[stage];
  const Arrow = locale === "ar" ? ArrowLeft : ArrowRight;

  const layer = {
    initial: reduce ? { opacity: 0 } : { scale: 0, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    exit: reduce ? { opacity: 0 } : { scale: 0, opacity: 0 },
    transition: { duration: reduce ? 0 : 0.8, ease: "easeOut" as const },
  };

  return (
    <section className="pz-section" aria-labelledby="pizza-title">
      <div className="pz-inner">
        <div className="pz-copy">
          <p className="pz-kicker">{t.kicker}</p>
          <h2 id="pizza-title" className="pz-title">{t.title}</h2>
          <p className="pz-body">{t.body}</p>

          <div className="pz-step" aria-live="polite" aria-atomic="true">
            <p className="pz-step-count">{t.step.replace("{n}", String(stage + 1)).replace("{total}", String(LAST + 1))}</p>
            <p className={cn("pz-step-title", locale === "ar" ? "font-arabic" : "font-script")}>{step.t}</p>
            <p className="pz-step-desc">{step.d}</p>
          </div>

          <ol className="pz-dots" aria-hidden>
            {t.steps.map((s, i) => (
              <li key={s.t} className={cn("pz-dot", i <= stage && "is-on", i === stage && "is-current")} />
            ))}
          </ol>

          <div className="pz-actions">
            <button type="button" onClick={done ? reset : next} className="pz-button">
              {done ? <RotateCcw className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              {done ? t.restart : t.next}
            </button>
            {done && (
              <Link href={`/${locale}/menu`} className="pz-link">
                {t.order} <Arrow className="h-4 w-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>

        <div className="pz-stage">
          <div className="pz-board" aria-hidden />
          <motion.div
            className="pizza"
            role="img"
            aria-label={step.t}
            animate={done && !reduce ? { scale: [1, 1.08, 0.97, 1.02, 1], rotate: [0, -4, 3, -1, 0] } : { scale: 1, rotate: 0 }}
            transition={{ duration: 0.9, ease: "easeInOut" }}
          >
            <div className="pizza-dough" />

            <AnimatePresence>
              {stage >= 1 && <motion.div key="sauce" className="pizza-sauce" {...layer} />}
              {stage >= 2 && <motion.div key="cheese" className="pizza-cheese" {...layer} />}
            </AnimatePresence>

            <AnimatePresence>
              {stage >= 3 &&
                TOPPINGS.map((tp, index) => (
                  <div key={`${tp.kind}-${index}`} className="pz-spot" style={{ left: `${tp.x}%`, top: `${tp.y}%` }}>
                    <motion.div
                      className={tp.kind}
                      initial={reduce ? { opacity: 0, rotate: tp.r } : { y: -150, opacity: 0, scale: 0.5, rotate: tp.r - 60 }}
                      animate={{ y: 0, opacity: 1, scale: 1, rotate: tp.r }}
                      exit={{ opacity: 0, scale: reduce ? 1 : 0.5, transition: { duration: reduce ? 0 : 0.25 } }}
                      transition={reduce ? { duration: 0 } : { delay: index * 0.12, type: "spring", stiffness: 220, damping: 13 }}
                    />
                  </div>
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
