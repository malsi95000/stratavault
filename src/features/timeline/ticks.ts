// Graduations de la frise : un pas lisible (siècle, demi-siècle… année, trimestre, mois) choisi pour
// que deux libellés restent séparés d'au moins `minGap` pixels.
import { monthStart } from "./dates";
import { TIMELINE_END } from "./viewport";
import type { Viewport } from "./viewport";

export type Tick = { value: number; label: string; /** Graduation principale (décennie, année…) : plus marquée. */ major: boolean };

const YEAR_STEPS = [100, 50, 20, 10, 5, 2, 1] as const;
const MONTH_STEPS = [6, 3, 1] as const;
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

/** Pas des graduations : un nombre d'années, ou de mois (`months`). */
export type TickStep = { years: number } | { months: number };

export function tickStep(view: Viewport, width: number, minGap = 80): TickStep {
  const pxPerYear = width / (view.end - view.start);
  // Le plus petit pas qui laisse assez de place, en partant des mois.
  for (const months of [...MONTH_STEPS].reverse()) if ((pxPerYear * months) / 12 >= minGap) return { months };
  for (const years of [...YEAR_STEPS].reverse()) if (pxPerYear * years >= minGap) return { years };
  return { years: YEAR_STEPS[0] };
}

/** Graduations de la vue (bords compris), sans dépasser la fin de la frise (2101 en est exclu). */
export function timelineTicks(view: Viewport, width: number, minGap = 80): Tick[] {
  if (width <= 0) return [];
  const step = tickStep(view, width, minGap);
  const ticks: Tick[] = [];
  if ("years" in step) {
    const first = Math.ceil(view.start / step.years) * step.years;
    for (let y = first; y <= view.end && y < TIMELINE_END; y += step.years) {
      ticks.push({ value: y, label: String(y), major: y % (step.years * 5) === 0 || step.years >= 50 });
    }
    return ticks;
  }
  for (let year = Math.floor(view.start); year <= Math.ceil(view.end); year++) {
    for (let month = 1; month <= 12; month += step.months) {
      const value = monthStart(year, month);
      if (value < view.start || value > view.end || value >= TIMELINE_END) continue;
      ticks.push({ value, label: month === 1 ? String(year) : MONTHS[month - 1], major: month === 1 });
    }
  }
  return ticks;
}
