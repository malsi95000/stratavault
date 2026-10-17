import type { Tutorial } from "@/features/editor/help/tutorials";

/** Contenu d'un tutoriel : titre, résumé, étapes numérotées, raccourci et astuce. */
export default function TutorialCard({ tutorial, titleId }: { tutorial: Tutorial; titleId: string }) {
  const { title, summary, steps, shortcut, tip } = tutorial;
  // Raccourci d'un outil : une seule touche, affichée comme une touche du clavier.
  const singleKey = shortcut !== undefined && shortcut.length === 1;
  return (
    <div className="grid gap-2.5 text-[13px] leading-[1.5]">
      <h2 id={titleId} className="brut m-0 text-[16px] text-ink">
        {title}
      </h2>
      <p className="m-0 text-mute">{summary}</p>
      <ol className="m-0 grid list-decimal gap-1.5 pl-5 text-ink marker:text-mute">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {shortcut && (
        <p className="m-0 text-ink">
          <span className="text-mute">Raccourci : </span>
          {singleKey ? (
            <kbd className="rounded-[3px] border border-line bg-bg px-1.5 py-px font-mono text-[12px]">{shortcut}</kbd>
          ) : (
            shortcut
          )}
        </p>
      )}
      {tip && (
        <p className="m-0 border-t border-line pt-2 text-ink">
          <span className="text-acc">Astuce : </span>
          {tip}
        </p>
      )}
    </div>
  );
}
