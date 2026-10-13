import type { Metadata } from "next";
import Link from "next/link";
import LegalDocument from "@/components/legal/LegalDocument";
import LegalSection from "@/components/legal/LegalSection";
import StorageCard from "@/components/legal/StorageCard";
import { list, paragraph, textLink } from "@/components/legal/prose";
import { inventoryByKind } from "@/features/legal/storageInventory";

export const metadata: Metadata = {
  title: "Cookies et stockage local",
  description: "Liste exacte des cookies et des stockages du navigateur utilisés par Stratavault, tous strictement nécessaires.",
};

const SECTIONS = [
  { id: "principe", title: "En bref" },
  { id: "inventaire", title: "Liste complète" },
  { id: "effacer", title: "Effacer ces données" },
] as const;

export default function CookiesPage() {
  const [principe, inventaire, effacer] = SECTIONS;

  return (
    <LegalDocument
      current="/cookies"
      title="Cookies et stockage local"
      lead="Voici tout ce que Stratavault enregistre dans votre navigateur, avec le nom exact, la finalité et la durée de chaque élément."
      sections={SECTIONS}
    >
      <LegalSection {...principe}>
        <ul className={list}>
          <li>
            Tous les cookies et stockages ci-dessous sont strictement nécessaires au service que vous demandez (session du
            compte, mode démo, enregistrement de vos cartes, préférence d’affichage). Ils sont donc exemptés de
            consentement (article 82 de la loi Informatique et Libertés, lignes directrices de la CNIL) : aucun bandeau
            n’est affiché.
          </li>
          <li>Aucun cookie de mesure d’audience, de publicité ou de réseau social ; aucun traceur tiers.</li>
          <li>
            Les données personnelles associées sont décrites dans la{" "}
            <Link href="/confidentialite" className={textLink}>
              politique de confidentialité
            </Link>
            .
          </li>
        </ul>
      </LegalSection>

      <LegalSection {...inventaire}>
        {inventoryByKind().map((group) => (
          <div key={group.kind}>
            <h3 className="mt-8 text-[17px] font-semibold text-ink">{group.label}</h3>
            {group.items.map((item) => (
              <StorageCard key={item.name} item={item} />
            ))}
          </div>
        ))}
      </LegalSection>

      <LegalSection {...effacer}>
        <p className={paragraph}>
          En mode démo, « Effacer les données de ce navigateur », dans votre espace, efface les cartes de la démo et la
          vue mémorisée de l’éditeur. Vous pouvez aussi effacer à tout moment les cookies et les données de ce site dans
          les réglages de votre navigateur.
          Effacer les cookies ferme la session du compte ou quitte le mode démo. Effacer les données du site supprime aussi
          les cartes du mode démo, qui n’existent nulle part ailleurs : exportez-les d’abord (« Exporter » dans
          l’éditeur). Les cartes d’un compte restent dans le compte, à l’exception des modifications qui n’auraient pas
          encore pu lui être envoyées.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
