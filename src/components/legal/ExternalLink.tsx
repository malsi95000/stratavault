import type { ReactNode } from "react";
import { textLink } from "./prose";

/** Lien vers un site extérieur (sans transmettre l'adresse de la page d'origine). */
export default function ExternalLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} className={textLink} rel="noopener noreferrer" target="_blank">
      {children ?? href.replace(/^https:\/\//, "")}
    </a>
  );
}
