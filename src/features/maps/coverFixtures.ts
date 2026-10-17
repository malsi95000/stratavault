// Exemples d'aperçus SVG dangereux, partagés par les tests de l'application (cover.test.ts) et de la
// base (cover.sql.test.ts) : les deux validations doivent refuser exactement les mêmes.
import { COVER_SVG_PREFIX } from "./cover";

/** Aperçu complet autour d'un contenu. */
export const coverSvg = (body: string) => `${COVER_SVG_PREFIX} viewBox="0 0 160 90">${body}</svg>`;

/** Contenus refusés : actifs, références externes, et contournements par entités ou échappements. */
export const UNSAFE_SVG_BODIES = [
  "<script>alert(1)</script>",
  "<SCRIPT>alert(1)</SCRIPT>",
  '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>',
  '<image href="https://exemple.fr/x.png"/>',
  '<use xlink:href="#a"/>',
  '<rect style="fill:url(https://exemple.fr/x)"/>',
  "<style>@import 'https://exemple.fr/x.css';</style>",
  '<a href="javascript:alert(1)">x</a>',
  '<rect onclick="alert(1)"/>',
  '<rect width="2" ONLOAD = "alert(1)"/>',
  "<!ENTITY a 'b'>",
  "<?xml-stylesheet href='x'?>",
  "<iframe/>",
  "<embed/>",
  "<object/>",
  // Entités XML, décodées dans les attributs avant de passer au CSS : `&#117;rl(` donne `url(`.
  '<rect width="10" height="10" filter="u&#x72;l(https://evil.example/f.svg#f)"/>',
  '<rect style="fill:&#117;rl(https://evil.example/x.svg#a)"/>',
  // Échappements CSS dans une feuille de style.
  "<style>rect{fill:u\\72l(https://evil.example/x)}</style>",
  '<style>@\\69mport "https://evil.example/x.css";</style>',
  // Balises hors de la liste (même sans attribut dangereux), guillemet simple, retour à la ligne.
  "<desc>x</desc>",
  '<use x="1"/>',
  '<pattern id="p"/>',
  "<text>x</text>",
  "<rect fill='#fff'/>",
  '<rect\nwidth="1"/>',
] as const;
