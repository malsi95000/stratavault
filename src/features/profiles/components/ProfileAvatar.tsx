import { avatarPath } from "../paths";
import { initialsOf } from "../text";
import { cn } from "@/lib/utils";

type Props = {
  avatarId: string | null;
  displayName: string;
  /** Côté en pixels. */
  size?: number;
  className?: string;
};

/**
 * Avatar d'un profil, décoratif (le nom affiché est écrit à côté). L'image vient de la route du site
 * /avatars/<id> (réservée aux comptes connectés, fichier WebP produit par le serveur) : jamais
 * d'adresse de Supabase dans la page. Sans avatar : les initiales du nom affiché.
 */
export default function ProfileAvatar({ avatarId, displayName, size = 96, className }: Props) {
  const frame = cn(
    "grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-field-alt text-mute",
    className,
  );
  return (
    <span aria-hidden="true" className={frame} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}>
      {avatarId ? (
        // Image servie par le site avec la session (next/image la redemanderait sans les cookies), chargée
        // à l'approche de l'écran : une longue liste de contacts ne demande pas tous les avatars d'un coup.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarPath(avatarId)}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          draggable={false}
        />
      ) : (
        <span className="brut">{initialsOf(displayName)}</span>
      )}
    </span>
  );
}
