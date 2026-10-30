import { cn } from "@/lib/utils";
import type { SharingActionState } from "../actionState";

/** Message renvoyé par le serveur, annoncé par les lecteurs d'écran (zone toujours présente). */
export default function SharingMessage({ state }: { state: SharingActionState }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {state.message && (
        <p className={cn("m-0 text-[13px]", state.status === "error" ? "text-danger" : "text-ink")}>{state.message}</p>
      )}
    </div>
  );
}
