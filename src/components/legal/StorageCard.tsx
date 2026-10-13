import type { StorageItem } from "@/features/legal/storageInventory";
import FactList from "./FactList";

/** Fiche d'un cookie ou d'un stockage du navigateur. */
export default function StorageCard({ item }: { item: StorageItem }) {
  const { name, purpose, content, duration, issuer, scope, options } = item;
  return (
    <FactList
      title={name}
      facts={[
        { label: "Finalité", value: purpose },
        { label: "Contenu", value: content },
        { label: "Durée", value: duration },
        { label: "Émetteur", value: issuer },
        { label: "Utilisé en", value: scope },
        ...(options ? [{ label: "Options", value: options }] : []),
      ]}
    />
  );
}
