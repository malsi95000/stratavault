import { z } from "zod";

// Point d'entrée unique de zod dans l'application : importez `z` d'ici, jamais de "zod" directement.
// zod 4 compile ses validateurs d'objets avec `new Function` et, pour savoir s'il le peut, essaie
// `Function("")` dès qu'un `z.object` est défini. La CSP de production interdit eval : le navigateur
// signalerait une violation à chaque chargement. Le mode « jitless » supprime cet essai.
// Ce réglage doit précéder toute définition de schéma : ce module ne fait rien d'autre.
z.config({ jitless: true });

export { z };
