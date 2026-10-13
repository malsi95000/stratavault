import Link from "next/link";
import { LEGAL_PAGE, MINIMUM_AGE } from "@/lib/legal";

const link = "text-ink underline underline-offset-3 transition-colors duration-150 hover:text-acc";

/** Mention sous le bouton d'inscription : âge minimum, conditions d'utilisation et politique de confidentialité. */
export default function SignupConsent() {
  return (
    <p className="mt-1 text-xs text-mute">
      En créant un compte, vous acceptez les{" "}
      <Link href={LEGAL_PAGE.terms.href} className={link}>
        conditions d’utilisation
      </Link>{" "}
      et reconnaissez avoir pris connaissance de la{" "}
      <Link href={LEGAL_PAGE.privacy.href} className={link}>
        politique de confidentialité
      </Link>
      . Service destiné aux personnes de {MINIMUM_AGE} ans et plus ; avant cet âge, avec l’autorisation d’un titulaire
      de l’autorité parentale.
    </p>
  );
}
