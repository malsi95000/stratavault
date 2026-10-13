import { getCurrentUser } from "@/lib/supabase/user";
import SignOutButton from "./SignOutButton";

/** Compte connecté (e-mail + « Se déconnecter ») ; rien en mode démo. */
export default async function AccountBar() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px] text-mute">
      {user.email && (
        <span>
          Connecté : <span className="text-ink">{user.email}</span>
        </span>
      )}
      <SignOutButton userId={user.id} />
    </div>
  );
}
