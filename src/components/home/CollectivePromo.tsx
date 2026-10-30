import Link from "next/link";
import { HOME_PROMO_TITLE, homePromoLink, homePromoText } from "@/features/collective/messages";
import { COLLECTIVE_PAGE } from "@/features/collective/paths";
import Reveal from "./Reveal";

/**
 * Encart de la carte collective sur l'accueil (COM-01, ACC-06). Le lien mène à la carte collective ;
 * sans session, le proxy renvoie d'abord à la connexion (la carte est réservée aux comptes connectés).
 * `signedIn` : session de compte probable (cookies) : le texte n'invite alors pas à se connecter.
 */
export default function CollectivePromo({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="relative z-1 mx-auto max-w-[840px] px-6 pt-4 pb-10">
      <Reveal className="grid gap-3 rounded-[8px] border border-line bg-panel px-6 py-5">
        <h2 className="brut m-0 text-[clamp(22px,3vw,30px)] tracking-[.02em]">{HOME_PROMO_TITLE}</h2>
        <p className="m-0 max-w-[62ch] text-mute">{homePromoText(signedIn)}</p>
        <div>
          <Link
            href={COLLECTIVE_PAGE}
            className="brut inline-block border-2 border-ink px-5 py-2.5 tracking-[.04em] text-ink transition-colors duration-150 hover:border-acc hover:bg-acc hover:text-on-acc focus-visible:border-acc focus-visible:bg-acc focus-visible:text-on-acc"
          >
            {homePromoLink(signedIn)}
          </Link>
        </div>
      </Reveal>
    </div>
  );
}
