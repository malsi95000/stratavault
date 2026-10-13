import type { Release } from "@/data/changelog";

/** Frise verticale des versions (bêta, .timeline) : pastille, version, date, paragraphes, contribution. */
export default function Timeline({ releases }: { releases: readonly Release[] }) {
  return (
    <ol className="m-0 grid list-none gap-[30px] p-0">
      {releases.map((release) => (
        <li
          key={release.version}
          className="relative border-l-[3px] border-line pt-0.5 pb-1 pl-[22px] before:absolute before:top-1.5 before:-left-[7px] before:size-[11px] before:rounded-full before:bg-acc before:content-['']"
        >
          <span className="brut mr-2.5 text-[21px]">{release.version}</span>
          <span className="text-[13px] text-mute">{release.date}</span>
          {release.paragraphs.map((paragraph, i) => {
            const isLast = i === release.paragraphs.length - 1;
            return (
              <p key={i} className="mt-[9px] max-w-[64ch] text-ink">
                {paragraph}
                {isLast && release.contribution && (
                  <em className="mt-[7px] block text-[13.5px] text-mute not-italic">{release.contribution}</em>
                )}
              </p>
            );
          })}
        </li>
      ))}
    </ol>
  );
}
