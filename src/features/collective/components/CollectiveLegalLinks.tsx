import { LEGAL_LINKS_LABEL, PRIVACY_LINK, TERMS_LINK } from "../messages";
import { COLLECTIVE_PRIVACY_PAGE, COLLECTIVE_RULES_PAGE } from "../paths";

const LINK = "underline underline-offset-2 hover:text-ink";

/**
 * Liens vers les règles (CGU) et la politique de confidentialité, là où la carte collective recueille
 * des données (avertissement d'entrée, signalement). Ouverts dans un nouvel onglet : quitter la carte
 * pourrait interrompre une publication en cours.
 */
export default function CollectiveLegalLinks() {
  return (
    <nav aria-label={LEGAL_LINKS_LABEL} className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-mute">
      <a href={COLLECTIVE_RULES_PAGE} target="_blank" rel="noopener" className={LINK}>
        {TERMS_LINK}
      </a>
      <a href={COLLECTIVE_PRIVACY_PAGE} target="_blank" rel="noopener" className={LINK}>
        {PRIVACY_LINK}
      </a>
    </nav>
  );
}
