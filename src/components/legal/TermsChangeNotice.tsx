import Link from "next/link";
import { ACCOUNT_PAGE } from "@/features/account/notices";
import { TERMS_CHANGE, termsChangeText } from "@/features/legal/termsChange";
import { LEGAL_PAGE } from "@/lib/legal";

const LINK = "text-ink underline underline-offset-3";

/**
 * Avis aux titulaires d'un compte : les textes ont changé (src/features/legal/termsChange.ts). Affiché
 * dans l'espace des comptes créés avant l'entrée en vigueur, pendant la période prévue, avec les liens
 * vers les textes et « Mon compte ».
 */
export default function TermsChangeNotice() {
  return (
    <aside aria-labelledby="textes-mis-a-jour" className="mb-8 grid max-w-[64ch] gap-2 rounded-[8px] border border-line bg-panel px-5 py-4">
      <h2 id="textes-mis-a-jour" className="brut m-0 text-[16px]">
        {TERMS_CHANGE.title}
      </h2>
      <p className="m-0 text-[14px] text-mute">{termsChangeText()}</p>
      <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[14px]">
        <Link href={LEGAL_PAGE.terms.href} className={LINK}>
          {LEGAL_PAGE.terms.title}
        </Link>
        <Link href={LEGAL_PAGE.privacy.href} className={LINK}>
          Politique de confidentialité
        </Link>
        <Link href={ACCOUNT_PAGE} className={LINK}>
          Mon compte
        </Link>
      </p>
    </aside>
  );
}
