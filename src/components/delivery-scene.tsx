import type { Dictionary } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import "./delivery-scene.css";

type Status = keyof Dictionary["order"]["statuses"];

const CREAM = "#FFF2D0";
const RED = "#C01D2E";
const YELLOW = "#FED900";
const INK = "#16352A";
const GREEN_DARK = "#154733";

/** Where the scooter stands (x in the 640-wide scene) for each delivery status. */
const SCOOTER_X: Partial<Record<Status, number>> = { out_for_delivery: 250, completed: 398 };
const AT_SHOP = 176;

/** Simple Cairo-ish skyline (buildings, a minaret, the pyramids) — drawn twice so it can loop. */
function Skyline() {
  const block = (
    <g fill={CREAM} opacity="0.13">
      <rect x="190" y="96" width="34" height="64" />
      <rect x="228" y="78" width="26" height="82" />
      <rect x="258" y="104" width="40" height="56" />
      <rect x="306" y="62" width="9" height="98" />
      <path d="M302 62 L310.5 44 L319 62 Z" />
      <circle cx="310.5" cy="40" r="3" />
      <rect x="322" y="90" width="30" height="70" />
      <path d="M380 160 L420 112 L460 160 Z" />
      <path d="M440 160 L470 126 L500 160 Z" />
      <rect x="520" y="100" width="28" height="60" />
      <rect x="552" y="84" width="22" height="76" />
      <rect x="10" y="108" width="30" height="52" />
      <rect x="44" y="92" width="22" height="68" />
    </g>
  );
  return (
    <g className="ds-sky">
      {block}
      <g transform="translate(640 0)">{block}</g>
    </g>
  );
}

function Steam({ x, y }: { x: number; y: number }) {
  return (
    <g fill={CREAM}>
      <circle className="ds-steam" cx={x} cy={y} r="6" />
      <circle className="ds-steam" cx={x + 6} cy={y - 4} r="5" />
      <circle className="ds-steam" cx={x - 4} cy={y - 2} r="5" />
    </g>
  );
}

function Shop({ preparing, glow }: { preparing: boolean; glow: boolean }) {
  return (
    <g>
      {/* chimney + steam from the wood-fired oven */}
      <rect x="128" y="26" width="16" height="34" rx="2" fill={CREAM} />
      <rect x="125" y="22" width="22" height="7" rx="2" fill={RED} />
      {preparing && <Steam x={136} y={16} />}
      {/* building */}
      <rect x="14" y="58" width="150" height="102" rx="4" fill={CREAM} />
      {/* striped awning */}
      <g>
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={8 + i * 18} y="74" width="18" height="16" fill={i % 2 ? CREAM : RED} />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx={17 + i * 18} cy="90" r="9" fill={i % 2 ? CREAM : RED} />
        ))}
      </g>
      {/* sign */}
      <rect x="30" y="34" width="96" height="22" rx="11" fill={RED} />
      <text x="78" y="49.5" textAnchor="middle" fontSize="12" fontWeight="800" letterSpacing="1.5" fill={CREAM} fontFamily="system-ui, sans-serif">
        PANZUTTI
      </text>
      {/* window with the oven inside */}
      <rect x="24" y="106" width="64" height="42" rx="4" fill={INK} />
      <path d="M36 148 V132 A20 16 0 0 1 76 132 V148 Z" fill="#7A3B12" />
      <path className={cn(glow && "ds-glow")} d="M42 148 V134 A14 11 0 0 1 70 134 V148 Z" fill={glow ? "#F59E0B" : "#B45309"} />
      {/* door */}
      <rect x="104" y="104" width="42" height="56" rx="3" fill="#1F6348" />
      <circle cx="138" cy="134" r="2.5" fill={YELLOW} />
    </g>
  );
}

function House({ heart }: { heart: boolean }) {
  return (
    <g>
      <path d="M528 98 L580 58 L632 98 Z" fill={RED} />
      <rect x="538" y="96" width="84" height="64" fill={YELLOW} />
      <rect x="548" y="108" width="20" height="20" rx="2" fill={CREAM} />
      <path d="M558 108 V128 M548 118 H568" stroke={INK} strokeWidth="2" />
      <rect x="584" y="118" width="24" height="42" rx="2" fill="#1F6348" />
      <circle cx="603" cy="140" r="2" fill={YELLOW} />
      {heart && (
        <path
          className="ds-pop"
          d="M580 46 C572 38 560 42 560 52 C560 62 580 72 580 72 C580 72 600 62 600 52 C600 42 588 38 580 46 Z"
          fill={RED}
          stroke={CREAM}
          strokeWidth="2.5"
        />
      )}
    </g>
  );
}

/** Rider on a red scooter with a Panzutti box. Local coords: wheels sit on y = 100. */
function Scooter() {
  const wheel = (cx: number) => (
    <g>
      <circle cx={cx} cy="88" r="12" fill={INK} />
      <g className="ds-wheel">
        <circle cx={cx} cy="88" r="7" fill="none" stroke={CREAM} strokeWidth="1.5" strokeDasharray="4 3" />
        <circle cx={cx} cy="88" r="3" fill={CREAM} />
      </g>
    </g>
  );
  return (
    <g className="ds-bob">
      {/* speed lines */}
      <g className="ds-wind" stroke={CREAM} strokeWidth="3" strokeLinecap="round">
        <line x1="-10" y1="38" x2="-34" y2="38" />
        <line x1="-6" y1="54" x2="-40" y2="54" />
        <line x1="-12" y1="70" x2="-30" y2="70" />
      </g>
      {/* delivery box */}
      <rect x="0" y="22" width="42" height="34" rx="5" fill={RED} />
      <rect x="-2" y="17" width="46" height="8" rx="3" fill={YELLOW} />
      <text x="21" y="48" textAnchor="middle" fontSize="20" fontWeight="900" fill={CREAM} fontFamily="Georgia, serif">P</text>
      {/* body */}
      <path d="M8 82 C10 66 26 62 44 62 L84 62 C94 62 97 55 100 45 L104 30 L111 31 L107 50 C105 64 113 73 120 82 Z" fill={RED} />
      <rect x="40" y="73" width="52" height="7" rx="3" fill={INK} />
      <rect x="40" y="54" width="34" height="9" rx="4.5" fill={INK} />
      <line x1="106" y1="34" x2="108" y2="86" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <line x1="97" y1="29" x2="114" y2="25" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <circle cx="116" cy="42" r="4.5" fill={YELLOW} />
      {/* rider */}
      <polyline points="58,58 80,60 84,74" fill="none" stroke={GREEN_DARK} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M52 58 L64 26 C66 20 76 20 79 26 L76 58 Z" fill={CREAM} />
      <line x1="74" y1="32" x2="99" y2="29" stroke={CREAM} strokeWidth="7" strokeLinecap="round" />
      <circle cx="72" cy="15" r="11" fill={YELLOW} />
      <path d="M74 12 H84 C84 18 80 20 75 19 Z" fill={INK} />
      {wheel(22)}
      {wheel(106)}
    </g>
  );
}

/**
 * Illustrated status for the order page: the scooter waits at the shop while the order is
 * prepared, drives (wheels, road and skyline move) when it's out for delivery, and parks at
 * the customer's door when it's delivered. Pickup orders show the shop with a bag on the step.
 */
export function DeliveryScene({
  type,
  status,
  t,
}: {
  type: "pickup" | "delivery";
  status: Status;
  t: Dictionary["order"]["scene"];
}) {
  const driving = type === "delivery" && status === "out_for_delivery";
  const preparing = status === "preparing" || status === "confirmed";
  const caption =
    type === "pickup" && (status === "ready" || status === "completed")
      ? t[status === "ready" ? "readyPickup" : "completedPickup"]
      : t[status];
  const x = SCOOTER_X[status] ?? AT_SHOP;

  return (
    <figure className={cn("mt-6", status === "cancelled" && "opacity-50 grayscale")}>
      <svg
        viewBox="0 0 640 200"
        role="img"
        aria-label={caption}
        direction="ltr"
        className={cn("block h-auto w-full overflow-visible", driving ? "ds-driving" : "ds-idle")}
      >
        <Skyline />
        {/* road */}
        <rect x="-20" y="160" width="680" height="40" rx="6" fill={GREEN_DARK} />
        <line x1="-20" y1="161" x2="660" y2="161" stroke={CREAM} strokeOpacity="0.25" strokeWidth="2" />
        <line className="ds-road" x1="-20" y1="182" x2="660" y2="182" stroke={CREAM} strokeOpacity="0.55" strokeWidth="4" strokeDasharray="42 42" />

        <Shop preparing={preparing} glow={status === "preparing"} />
        {type === "delivery" ? (
          <>
            <House heart={status === "completed"} />
            <g className="ds-scooter" style={{ transform: `translate(${x}px, 60px)` }}>
              <Scooter />
            </g>
          </>
        ) : (
          (status === "ready" || status === "completed") && (
            // Pickup: the Panzutti bag waiting on the step
            <g className="ds-pop">
              <path d="M170 128 h34 l-3 32 h-28 Z" fill={RED} />
              <path d="M180 128 C180 116 194 116 194 128" fill="none" stroke={RED} strokeWidth="3" />
              <text x="187" y="151" textAnchor="middle" fontSize="15" fontWeight="900" fill={CREAM} fontFamily="Georgia, serif">P</text>
            </g>
          )
        )}
      </svg>
      <figcaption className="mt-3 text-center font-bold text-brand-yellow" aria-live="polite">
        {caption}
      </figcaption>
    </figure>
  );
}
