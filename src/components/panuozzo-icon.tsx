import type { SVGProps } from "react";

/** Panuozzo line icon (long stuffed roll), drawn like a lucide icon: 24×24, stroke = currentColor. */
export function PanuozzoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <g transform="rotate(-14 12 12)">
        {/* long stuffed bread roll */}
        <path d="M2.5 12.5 C2.5 10.2 4.2 9.2 6.5 9.2 H17.5 C19.8 9.2 21.5 10.2 21.5 12.5 C21.5 14.8 19.8 15.8 17.5 15.8 H6.5 C4.2 15.8 2.5 14.8 2.5 12.5 Z" />
        {/* filling layer through the middle */}
        <path d="M2.5 12.5 Q5.5 11 8.5 12.5 T14.5 12.5 T21.5 12.5" />
        {/* filling spilling out of the top */}
        <path d="M7 9.2 Q8.2 7.4 9.5 9.2 Q10.8 7.2 12 9.2 Q13.2 7.4 14.5 9.2" />
      </g>
    </svg>
  );
}
