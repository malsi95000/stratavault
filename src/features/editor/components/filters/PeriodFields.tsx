"use client";

import { useId } from "react";
import { periodOf } from "@/features/filters/filter";
import type { Filter } from "@/features/filters/filter";
import { FIELD } from "../fiches/styles";

export const PERIOD_INVALID = "Date illisible : écrivez une année (1914), un mois (1914-08) ou un jour (1914-08-03).";
export const PERIOD_REVERSED = "La fin de la période précède son début : aucune fiche ne peut correspondre.";

/** Message d'erreur de la période, ou null si elle est lisible et dans l'ordre. */
export function periodProblem(filter: Pick<Filter, "from" | "to">): string | null {
  const { start, end, invalid } = periodOf(filter);
  if (invalid.length > 0) return PERIOD_INVALID;
  if (start !== null && end !== null && end <= start) return PERIOD_REVERSED;
  return null;
}

/** Période du filtre : « Du » et « Au » (bornes incluses), chacune facultative. */
export default function PeriodFields({
  filter,
  onChange,
}: {
  filter: Pick<Filter, "from" | "to">;
  onChange: (patch: Partial<Pick<Filter, "from" | "to">>) => void;
}) {
  const fromId = useId();
  const toId = useId();
  const errorId = useId();
  const { invalid } = periodOf(filter);
  const problem = periodProblem(filter);
  // Période à l'envers : les deux champs sont en cause.
  const reversed = problem === PERIOD_REVERSED;
  const field = (id: string, label: string, which: "from" | "to") => (
    <label htmlFor={id} className="block min-w-0 flex-1 text-[13px] text-mute">
      {label}
      <input
        id={id}
        type="text"
        autoComplete="off"
        placeholder={which === "from" ? "1914" : "1918-11-11"}
        maxLength={32}
        className={FIELD}
        value={filter[which]}
        aria-invalid={invalid.includes(which) || reversed || undefined}
        aria-describedby={problem ? errorId : undefined}
        onChange={(e) => onChange({ [which]: e.target.value })}
      />
    </label>
  );
  return (
    <fieldset className="m-0 mt-3.5 min-w-0 border-0 p-0">
      <legend className="mb-1 p-0 text-[13px] text-mute">Période</legend>
      <div className="flex gap-2">
        {field(fromId, "Du", "from")}
        {field(toId, "Au (inclus)", "to")}
      </div>
      {problem && (
        <p id={errorId} className="m-0 mt-1.5 text-[13px] text-danger">
          {problem}
        </p>
      )}
    </fieldset>
  );
}
