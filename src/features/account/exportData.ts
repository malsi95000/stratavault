// Fichier « Télécharger mes données » (RGPD, articles 15 et 20) : le compte et toutes ses cartes,
// dans un format JSON structuré, lisible par une machine comme par une personne.
//
// Le fichier est produit en flux, carte par carte, en JSON compact : le serveur ne garde jamais en
// mémoire qu'une carte à la fois (au plus 4 Mo dans l'application, 8 Mo dans la base), et le contenu
// de chaque carte est recopié tel que la base l'écrit, sans être décodé en objets.
import type { ExportedMapSummary } from "@/lib/supabase/account";
import type { AccountDetails } from "@/lib/supabase/user";

export const ACCOUNT_EXPORT_FORMAT = "stratavault-donnees-du-compte";
export const ACCOUNT_EXPORT_VERSION = 1;

/** Présentation placée en tête du fichier. */
export const ACCOUNT_EXPORT_NOTE =
  "Données de votre compte Stratavault : la fiche du compte, puis toutes vos cartes. Le champ « data » de chaque carte est au format des fichiers de l’éditeur : enregistré seul dans un fichier .json, il s’importe avec le bouton « Importer ». Les mots de passe ne sont jamais conservés en clair et ne figurent pas ici.";

/** Forme du fichier (les clés apparaissent dans cet ordre). */
export type AccountExport = {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  version: typeof ACCOUNT_EXPORT_VERSION;
  note: string;
  exportedAt: string;
  account: {
    id: string;
    email: string | null;
    createdAt: string | null;
    emailConfirmedAt: string | null;
    lastSignInAt: string | null;
  };
  maps: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    revision: number;
    data: unknown;
  }[];
};

/** Début du fichier, jusqu'à l'ouverture de la liste des cartes. */
export function exportHead(account: AccountDetails, now: Date): string {
  const head: Omit<AccountExport, "maps"> = {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    note: ACCOUNT_EXPORT_NOTE,
    exportedAt: now.toISOString(),
    account: {
      id: account.id,
      email: account.email,
      createdAt: account.createdAt,
      emailConfirmedAt: account.emailConfirmedAt,
      lastSignInAt: account.lastSignInAt,
    },
  };
  // `{…}` sans son accolade fermante, puis la clé « maps ».
  return `${JSON.stringify(head).slice(0, -1)},"maps":[`;
}

/** Une carte du fichier ; `dataText` est son contenu en JSON, tel que la base l'écrit (data::text). */
export function exportMapEntry(map: ExportedMapSummary, dataText: string): string {
  const fields = {
    id: map.id,
    name: map.name,
    createdAt: map.created_at,
    updatedAt: map.updated_at,
    revision: map.revision,
  };
  return `${JSON.stringify(fields).slice(0, -1)},"data":${dataText}}`;
}

/** Fin du fichier. */
export const EXPORT_TAIL = "]}";

/**
 * Délai pour la première lecture du flux. Le serveur commence à envoyer le fichier dès la réponse
 * prête ; sans lecture dans ce délai (requête HEAD, connexion perdue), le flux est abandonné et sa
 * place libérée.
 */
export const EXPORT_FIRST_READ_TIMEOUT_MS = 10_000;
/**
 * Délai entre deux lectures : un navigateur qui cesse de lire le fichier (sans fermer la connexion)
 * ne garde pas sa place au-delà. Assez long pour qu'une carte de 4 Mo parte sur une connexion lente.
 */
export const EXPORT_IDLE_TIMEOUT_MS = 2 * 60_000;

/** Erreur du flux quand le navigateur ne lit plus le fichier. */
export class ExportStalledError extends Error {
  constructor() {
    super("Téléchargement abandonné : le fichier n’est plus lu.");
    this.name = "ExportStalledError";
  }
}

type ExportStreamOptions = {
  account: AccountDetails;
  maps: readonly ExportedMapSummary[];
  now: Date;
  /** Contenu d'une carte en texte JSON ; null si elle n'existe plus (elle est alors omise). */
  readData: (mapId: string) => Promise<string | null>;
  /** Appelée une seule fois, quand le flux se termine, échoue, est abandonné ou n'est plus lu. */
  onEnd: () => void;
  /** Délais de lecture (pour les tests) ; par défaut EXPORT_FIRST_READ_TIMEOUT_MS et EXPORT_IDLE_TIMEOUT_MS. */
  timeouts?: { firstReadMs: number; idleMs: number };
};

/**
 * Flux du fichier : la tête, puis une carte à chaque lecture du navigateur (une seule requête à la
 * base à la fois, au rythme où le fichier est téléchargé), puis la fin. Une lecture en échec
 * interrompt le téléchargement (le navigateur le signale comme échoué) : jamais de fichier tronqué
 * présenté comme complet. Un flux qui n'est pas lu à temps (voir les délais plus haut) est
 * interrompu de la même façon, et sa place libérée.
 */
export function createAccountExportStream({
  account,
  maps,
  now,
  readData,
  onEnd,
  timeouts = { firstReadMs: EXPORT_FIRST_READ_TIMEOUT_MS, idleMs: EXPORT_IDLE_TIMEOUT_MS },
}: ExportStreamOptions) {
  const encoder = new TextEncoder();
  let ended = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stopTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const end = () => {
    stopTimer();
    if (ended) return;
    ended = true;
    onEnd();
  };
  /** Attend la prochaine lecture au plus `ms` millisecondes, sinon interrompt le flux. */
  const awaitRead = (controller: ReadableStreamDefaultController<Uint8Array>, ms: number) => {
    stopTimer();
    timer = setTimeout(() => {
      timer = undefined;
      if (ended) return;
      end();
      controller.error(new ExportStalledError());
    }, ms);
    // La minuterie ne retient pas le processus.
    timer.unref?.();
  };
  let index = -1; // -1 : tête pas encore écrite
  let written = 0; // cartes écrites (pour les virgules)

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        awaitRead(controller, timeouts.firstReadMs);
      },
      async pull(controller) {
        // Pas de délai pendant la lecture d'une carte dans la base : seulement entre deux lectures du navigateur.
        stopTimer();
        if (ended) return;
        try {
          if (index < 0) {
            index = 0;
            controller.enqueue(encoder.encode(exportHead(account, now)));
            awaitRead(controller, timeouts.idleMs);
            return;
          }
          while (index < maps.length) {
            const map = maps[index];
            index += 1;
            const dataText = await readData(map.id);
            if (dataText === null) continue;
            controller.enqueue(encoder.encode((written > 0 ? "," : "") + exportMapEntry(map, dataText)));
            written += 1;
            awaitRead(controller, timeouts.idleMs);
            return;
          }
          controller.enqueue(encoder.encode(EXPORT_TAIL));
          controller.close();
          end();
        } catch (error) {
          end();
          controller.error(error);
        }
      },
      cancel() {
        end();
      },
    },
    // Rien n'est lu d'avance : une carte n'est demandée à la base que quand la précédente est partie.
    { highWaterMark: 0 },
  );
}

/** Nom du fichier téléchargé : `stratavault-donnees-AAAA-MM-JJ.json` (date UTC), sans donnée personnelle. */
export const accountExportFileName = (now: Date) => `stratavault-donnees-${now.toISOString().slice(0, 10)}.json`;
