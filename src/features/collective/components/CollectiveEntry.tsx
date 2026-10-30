import Link from "next/link";
import { navLink } from "@/components/auth/styles";
import { COLLECTIVE_TITLE, SPACE_COLLECTIVE_LEAD, SPACE_COLLECTIVE_LINK, unreadNoticesText } from "../messages";
import { COLLECTIVE_PAGE } from "../paths";
import { COLLECTIVE_WARNING } from "../warning";

type Props = {
  /** Avis de modération non lus du compte (0 si la lecture a échoué). */
  unreadNotices: number;
};

/**
 * Accès à la carte collective depuis l'espace (COM-03), en mode compte, avec le nombre d'avis de
 * modération non lus : l'auteur d'un élément masqué ou supprimé l'apprend sans rouvrir la carte.
 */
export default function CollectiveEntry({ unreadNotices }: Props) {
  return (
    <section aria-labelledby="carte-collective" className="mt-12 border-t border-line pt-6">
      <h2 id="carte-collective" className="brut mb-2 text-[19px]">
        {COLLECTIVE_TITLE}
      </h2>
      <p className="mb-4 max-w-[60ch] text-[14px] text-mute">
        {SPACE_COLLECTIVE_LEAD} {COLLECTIVE_WARNING.short}
      </p>
      {unreadNotices > 0 && (
        <p role="status" className="mb-4 max-w-[60ch] text-[14px] text-ink">
          {unreadNoticesText(unreadNotices)}
        </p>
      )}
      <Link href={COLLECTIVE_PAGE} className={navLink}>
        {SPACE_COLLECTIVE_LINK}
      </Link>
    </section>
  );
}
