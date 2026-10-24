import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import logoGreen from "@/assets/panzutti-logo-green.png.asset.json";
import logoYellow from "@/assets/panzutti-logo-yellow.png.asset.json";
import mWave from "@/assets/mascot-wave.png.asset.json";
import mCelebrate from "@/assets/mascot-celebrate.png.asset.json";
import mThumbs from "@/assets/mascot-thumbs-up.png.asset.json";
import mThinking from "@/assets/mascot-thinking.png.asset.json";
import mEmpty from "@/assets/mascot-empty.png.asset.json";

export function Logo({ variant = "green", className }: { variant?: "green" | "yellow"; className?: string }) {
  return (
    <img
      src={variant === "green" ? logoGreen.url : logoYellow.url}
      alt="PANZUTTI — Panuozzo & more"
      className={cn("h-10 w-auto object-contain", className)}
    />
  );
}

/**
 * Reserved spot for the official "Panuozzo Lover" mascot artwork.
 * Pass `src` once the official file is supplied; until then a neutral frame is shown.
 */
export type MascotPose = "wave" | "celebrate" | "thumbs-up" | "thinking" | "empty";
const MASCOT_ART: Partial<Record<MascotPose, string>> = {
  wave: mWave.url,
  celebrate: mCelebrate.url,
  "thumbs-up": mThumbs.url,
  thinking: mThinking.url,
  empty: mEmpty.url,
};

export function Mascot({ pose, className, label }: { pose: MascotPose; className?: string; label?: string }) {
  const src = MASCOT_ART[pose];
  if (src) return <img src={src} alt="The Panuozzo Lover" loading="lazy" draggable={false} className={cn("block object-contain select-none", className)} />;
  return (
    <div
      aria-hidden
      data-mascot-slot={pose}
      className={cn(
        "flex items-center justify-center rounded-3xl border-2 border-dashed border-primary/30 bg-card/40 p-4 text-center text-[11px] font-semibold uppercase tracking-widest text-primary/50",
        className,
      )}
    >
      {label ?? "Mascot"}
    </div>
  );
}

export function SectionTitle({ kicker, title, className }: { kicker?: string; title: string; className?: string }) {
  return (
    <div className={cn("mb-8", className)}>
      {kicker && <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-brand-red">{kicker}</p>}
      <h2 className="text-4xl text-primary md:text-5xl">{title}</h2>
    </div>
  );
}

export function PageShell({ title, kicker, children }: { title: string; kicker?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-8 md:pb-16 md:pt-12">
      <SectionTitle kicker={kicker} title={title} />
      {children}
    </div>
  );
}

export function SignInPrompt({ text }: { text: string }) {
  return (
    <div className="rounded-3xl bg-card p-8 text-center">
      <p className="mb-4 text-lg">{text}</p>
      <Link to="/auth" className="inline-flex rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground">
        Sign in or create account
      </Link>
    </div>
  );
}
