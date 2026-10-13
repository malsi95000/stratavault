// Lecture du code source de l'application pour les tests qui vérifient une propriété de tout le
// code (inventaire des stockages, informations légales venant d'une seule source…).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");
const SRC = join(ROOT, "src");

export type SourceFile = { path: string; text: string };

/** Fichiers .ts et .tsx de src/, sans les tests ni leurs utilitaires (chemins relatifs, séparateur « / »). */
export function sourceFiles(): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== join(SRC, "test")) walk(full);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        files.push({ path: relative(ROOT, full).split(sep).join("/"), text: readFileSync(full, "utf8") });
      }
    }
  };
  walk(SRC);
  return files;
}

/** Valeur d'une constante chaîne `const NOM = "valeur"` déclarée dans `text`, ou null. */
export function stringConstant(text: string, name: string): string | null {
  const match = new RegExp(`const ${name}\\s*=\\s*"([^"]*)"`).exec(text);
  return match ? match[1] : null;
}

/** Vrai si `href` (chemin interne, sans paramètres) correspond à une page de src/app. */
export function routeExists(href: string): boolean {
  const path = href.split(/[?#]/)[0];
  return existsSync(join(SRC, "app", ...path.split("/").filter(Boolean), "page.tsx"));
}
