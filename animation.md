# Pizza Assembly Animation — Next.js

A step-by-step pizza assembly animation built with **Next.js, TypeScript, Motion, and CSS**.

## What it does

1. **Dough:** show the pizza crust.
2. **Sauce:** reveal tomato sauce with a scale/fade animation.
3. **Cheese:** reveal mozzarella.
4. **Toppings:** drop pepperoni, mushrooms, and basil into place.
5. **Finished:** give the pizza a small celebratory bounce and offer a restart button.

The visitor advances the assembly using **Add next ingredient**.

## 1. Install

```bash
npm install motion
```

Import Motion from `motion/react`.

## 2. Files

```text
components/
├── PizzaAssembly.tsx
└── PizzaAssembly.css
app/
└── page.tsx
```

## 3. Component outline (`components/PizzaAssembly.tsx`)

- Add `"use client"` because the component uses React state and interactive animations.
- Import `useState` from React and `AnimatePresence`, `motion` from `motion/react`.
- Keep the current step in state (`stage`, from `0` to `4`).
- Define the stage labels/descriptions:
  - Fresh dough
  - Tomato sauce
  - Mozzarella
  - Toppings
  - Ready!
- Build the pizza as stacked, absolutely positioned layers:
  - `.pizza-dough` — always visible crust/base
  - `.pizza-sauce` — visible from stage 2
  - `.pizza-cheese` — visible from stage 3
  - `.pepperoni`, `.mushroom`, `.basil` — visible from stage 4
- Use `AnimatePresence` for layer entrance/exit.
- Animate toppings with `initial` and `animate` states plus spring transitions, staggering each topping with a delay.
- Show the current step, description, and progress dots.
- Button behavior:
  - Before the last step: advance to the next stage.
  - At the last step: reset to stage 0.
- Add `aria-live="polite"` to the step information.

### Core state logic

```tsx
const [stage, setStage] = useState(0);
const next = () => setStage((s) => Math.min(s + 1, 4));
const reset = () => setStage(0);
```

### Animation patterns

```tsx
<motion.div
  initial={{ scale: 0, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  exit={{ scale: 0, opacity: 0 }}
  transition={{ duration: 0.8, ease: "easeOut" }}
/>
```

For falling toppings:

```tsx
initial={{ y: -150, opacity: 0, scale: 0.5 }}
animate={{ y: 0, opacity: 1, scale: 1 }}
transition={{
  delay: index * 0.12,
  type: "spring",
  stiffness: 220,
  damping: 13,
}}
```

## 4. CSS approach (`components/PizzaAssembly.css`)

- Use a centered, responsive section with a warm cream background.
- Make `.pizza` a square, circular, `position: relative` container.
- Stack layers with `position: absolute`, circular borders, and `inset` values.
- Style:
  - Dough: golden gradient and thick crust border.
  - Sauce: red circle.
  - Cheese: yellow circle with radial-gradient texture.
  - Pepperoni: small red circles.
  - Mushrooms: tan shapes with darker borders.
  - Basil: green leaf shapes.
- Use `z-index` to layer ingredients above the cheese.
- Add progress dots, a primary pill-shaped button, hover/focus styles, and a mobile breakpoint.
- The example uses CSS shapes, so the pizza is illustrative rather than photorealistic.

## 5. Add it to the homepage (`app/page.tsx`)

```tsx
import PizzaAssembly from "@/components/PizzaAssembly";

export default function Home() {
  return (
    <main>
      <PizzaAssembly />
    </main>
  );
}
```

If the `@/` alias is not configured, use a relative import. The same component can be rendered from `pages/index.tsx` in the Pages Router.

## 6. Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Production notes

- For a more realistic result, use transparent PNG/WebP or SVG artwork for each ingredient layer.
- The current example is user-controlled; an automatic timeline or scroll-triggered sequence can be added later.
- The CSS reduced-motion rule alone does **not** disable Motion's JavaScript-driven animations. For accessibility, check `useReducedMotion` from Motion and provide reduced-motion variants or skip transitions.
- Keep ingredient positions inside the pizza and test on mobile sizes.
