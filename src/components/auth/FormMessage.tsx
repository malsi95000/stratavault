import type { AuthFormState } from "@/features/auth/formState";
import { cn } from "@/lib/utils";

/** Message global renvoyé par le serveur, annoncé par les lecteurs d'écran (zone toujours présente). */
export default function FormMessage({ state }: { state: AuthFormState }) {
  return (
    <div aria-live="polite" className="mt-3 empty:mt-0">
      {state.message && (
        <p className={cn("text-[14px]", state.status === "error" ? "text-danger" : "text-ink")}>{state.message}</p>
      )}
    </div>
  );
}
