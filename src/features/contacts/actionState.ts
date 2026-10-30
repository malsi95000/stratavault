// État renvoyé par les Server Actions des contacts aux formulaires (useActionState) : uniquement des
// messages prévus pour l'affichage, jamais d'erreur brute.

export type ContactActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const INITIAL_CONTACT_STATE: ContactActionState = { status: "idle", message: "" };

/** Valeur du champ « after » d'un bouton qui quitte la page après un succès (voir ContactActionButton). */
export const LEAVE_AFTER_SUCCESS = "leave";

export const contactError = (message: string): ContactActionState => ({ status: "error", message });
export const contactSuccess = (message: string): ContactActionState => ({ status: "success", message });
