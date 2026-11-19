import { Bike, ShoppingBag } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";

/** Display-only badges under the menu banner title: tells guests delivery and pickup are both available. */
export function OrderTypePicker({ t }: { t: Dictionary["menu"] }) {
  const options = [
    { label: t.delivery, Icon: Bike },
    { label: t.pickup, Icon: ShoppingBag },
  ];

  return (
    <ul aria-label={t.orderType} className="mt-6 flex flex-wrap gap-3">
      {options.map(({ label, Icon }) => (
        <li
          key={label}
          className="flex min-w-32 flex-col items-center gap-2 rounded-2xl bg-primary-foreground/[0.07] px-5 py-4 font-extrabold ring-2 ring-primary-foreground/25"
        >
          <Icon className="h-8 w-8 text-brand-yellow" aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}
