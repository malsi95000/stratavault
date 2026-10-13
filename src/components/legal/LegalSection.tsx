import type { ReactNode } from "react";

export type SectionLink = { id: string; title: string };

/** Partie d'une page légale : titre ancré (cible du sommaire). */
export default function LegalSection({ id, title, children }: SectionLink & { children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-6">
      <h2 id={`${id}-titre`} className="brut mt-12 mb-1 text-[clamp(20px,3vw,26px)] tracking-[.02em]">
        {title}
      </h2>
      {children}
    </section>
  );
}
