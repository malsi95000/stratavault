import type { ReactNode } from "react";
import { card, term } from "./prose";

export type Fact = { label: string; value: ReactNode };

/** Bloc de faits (« Finalité : … », « Durée : … ») pour un traitement ou un stockage. */
export default function FactList({ title, facts }: { title: string; facts: readonly Fact[] }) {
  return (
    <div className={card}>
      <h3 className="font-semibold break-words text-ink">{title}</h3>
      <dl className="m-0 grid gap-2.5">
        {facts.map(({ label, value }) => (
          <div key={label}>
            <dt className={term}>{label}</dt>
            <dd className="m-0 mt-0.5 max-w-[68ch] text-[14.5px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
