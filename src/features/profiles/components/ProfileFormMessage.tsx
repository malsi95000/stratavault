import type { ProfileFormState } from "../formState";
import { cn } from "@/lib/utils";

/** Message global renvoyé par le serveur, annoncé par les lecteurs d'écran (zone toujours présente). */
export default function ProfileFormMessage({ state }: { state: ProfileFormState }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {state.message && (
        <p className={cn("m-0 text-[14px]", state.status === "error" ? "text-danger" : "text-ink")}>{state.message}</p>
      )}
    </div>
  );
}
