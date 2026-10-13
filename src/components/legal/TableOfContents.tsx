import type { SectionLink } from "./LegalSection";

/** Sommaire d'une page légale : liens vers chaque partie. */
export default function TableOfContents({ sections }: { sections: readonly SectionLink[] }) {
  return (
    <nav aria-label="Sommaire" className="mt-8 border border-line bg-panel px-4 py-3">
      <p className="text-xs tracking-[.08em] text-mute uppercase">Sommaire</p>
      <ol className="mt-2 grid list-decimal gap-1 pl-5 text-[14px] marker:text-mute">
        {sections.map(({ id, title }) => (
          <li key={id}>
            <a href={`#${id}`} className="text-ink underline-offset-3 hover:text-acc hover:underline">
              {title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
