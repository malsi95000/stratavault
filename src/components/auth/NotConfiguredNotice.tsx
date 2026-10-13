import { NOT_CONFIGURED } from "@/features/auth/messages";
import { notice } from "./styles";

/** Affiché quand Supabase n'est pas configuré : seuls les boutons de démo restent actifs. */
export default function NotConfiguredNotice() {
  return <p className={notice}>{NOT_CONFIGURED}</p>;
}
