import type { Processing } from "@/features/legal/processing";
import FactList from "./FactList";

/** Fiche d'un traitement : finalité, base légale, données, fourniture, destinataires, lieu, durée. */
export default function ProcessingCard({ processing }: { processing: Processing }) {
  const { title, purpose, legalBasis, data, provision, recipients, location, retention } = processing;
  return (
    <FactList
      title={title}
      facts={[
        { label: "Finalité", value: purpose },
        { label: "Base légale", value: legalBasis },
        {
          label: "Données",
          value: (
            <ul className="m-0 grid list-disc gap-0.5 pl-5 marker:text-mute">
              {data.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ),
        },
        ...(provision ? [{ label: "Données obligatoires ou facultatives", value: provision }] : []),
        { label: "Destinataires", value: recipients },
        { label: "Lieu de stockage et transferts", value: location },
        { label: "Durée de conservation", value: retention },
      ]}
    />
  );
}
