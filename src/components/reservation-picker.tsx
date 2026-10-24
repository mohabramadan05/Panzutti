"use client";

import { useEffect, useMemo } from "react";
import { CalendarDays, Clock, Users } from "lucide-react";
import { Stepper } from "./item-configurator";
import type { Branch } from "@/lib/data";
import type { Dictionary, Locale } from "@/lib/i18n";
import { MAX_DAYS_AHEAD, MAX_GUESTS, dateLabel, localDate, slotLabel, slotsFor, type ReservationPick } from "@/lib/reservation";
import { cn } from "@/lib/utils";

type Labels = Pick<Dictionary["checkout"], "date" | "time" | "guests" | "pickTime" | "noSlots"> & Pick<Dictionary["item"], "decrease" | "increase">;

/** Date + time slot + number of guests. Used on /reserve and in the checkout when the order is a reservation. */
export function ReservationPicker({
  value,
  onChange,
  branch,
  locale,
  t,
  error,
}: {
  value: ReservationPick | null;
  onChange: (v: ReservationPick) => void;
  branch: Pick<Branch, "opens_at" | "closes_at" | "timezone">;
  locale: Locale;
  t: Labels;
  error?: string;
}) {
  const today = localDate(branch.timezone);
  const last = localDate(branch.timezone, MAX_DAYS_AHEAD);
  // Today may have no slots left (late evening): start on the first day that still has one
  const firstDay = useMemo(() => (slotsFor(today, branch).length ? today : localDate(branch.timezone, 1)), [today, branch]);
  const pick: ReservationPick = value ?? { date: firstDay, slot: -1, guests: 2 };
  const slots = useMemo(() => slotsFor(pick.date, branch), [pick.date, branch]);

  // Give the parent a starting value so "guests" and the date are saved even before a time is chosen
  useEffect(() => {
    if (!value) onChange(pick);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps -- only seed once

  // Quick picks: the next 7 days as chips; the date input covers the rest of the month
  const chips = useMemo(() => Array.from({ length: 7 }, (_, i) => localDate(branch.timezone, i)).filter((d) => d >= firstDay), [branch.timezone, firstDay]);
  const set = (patch: Partial<ReservationPick>) => onChange({ ...pick, ...patch });
  const field = "h-12 w-full rounded-2xl bg-background px-4 ring-1 ring-border outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="space-y-5">
      <div>
        <span className="mb-2 flex items-center gap-2 text-sm font-bold">
          <CalendarDays className="h-4 w-4 text-brand-red" aria-hidden /> {t.date}
        </span>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {chips.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => set({ date: d, slot: -1 })}
              aria-pressed={pick.date === d}
              className={cn(
                "shrink-0 rounded-2xl px-3.5 py-2 text-sm font-extrabold ring-1 transition",
                pick.date === d ? "bg-primary text-primary-foreground ring-primary" : "bg-background ring-border hover:ring-primary",
              )}
            >
              {dateLabel(d, locale)}
            </button>
          ))}
        </div>
        <input
          type="date"
          aria-label={t.date}
          min={firstDay}
          max={last}
          value={pick.date}
          onChange={(e) => e.target.value && set({ date: e.target.value, slot: -1 })}
          className={cn(field, "mt-2")}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Clock className="h-4 w-4 text-brand-red" aria-hidden /> {t.time}
          </span>
          {slots.length ? (
            <select
              value={slots.includes(pick.slot) ? pick.slot : ""}
              onChange={(e) => set({ slot: Number(e.target.value) })}
              aria-invalid={!!error}
              className={cn(field, error && "ring-2 ring-brand-red")}
            >
              <option value="" disabled>
                {t.pickTime}
              </option>
              {slots.map((s) => (
                <option key={s} value={s}>
                  {slotLabel(s, locale)}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-2xl bg-brand-red/10 px-4 py-3 text-sm font-bold text-brand-red">{t.noSlots}</p>
          )}
        </label>
        <div>
          <span className="mb-2 flex items-center gap-2 text-sm font-bold">
            <Users className="h-4 w-4 text-brand-red" aria-hidden /> {t.guests}
          </span>
          <div className="flex h-12 items-center">
            <Stepper value={pick.guests} min={1} max={MAX_GUESTS} onChange={(guests) => set({ guests })} labels={t} />
          </div>
        </div>
      </div>
      {error && <p className="text-sm font-bold text-brand-red">{error}</p>}
    </div>
  );
}
