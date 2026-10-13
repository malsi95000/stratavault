import Link from "next/link";
import { LEGAL_PAGE } from "@/lib/legal";
import { textLink } from "./styles";

/** Lien vers la politique de confidentialité (page de connexion). */
export default function PrivacyLink() {
  return (
    <Link href={LEGAL_PAGE.privacy.href} className={textLink}>
      Données personnelles : politique de confidentialité
    </Link>
  );
}
