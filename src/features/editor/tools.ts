// Outils de l'éditeur : raccourcis clavier et curseurs (bêta, lignes 135-136 et 829-833).
import type { Tool } from "./hints";
import type { MapView } from "./projection";

/** Raccourcis clavier des outils (touche en minuscule). */
export const TOOL_SHORTCUTS: Readonly<Record<string, Tool>> = {
  v: "select",
  l: "link",
  p: "ping",
  o: "point",
  z: "lasso",
  t: "texte",
  g: "gomme",
  f: "flux",
};

type KeyLike = { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean };

/** Vrai si la cible est un champ de saisie : les raccourcis ne s'y appliquent pas. */
export function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
}

/** Vrai si la cible est dans un dialogue modal (confirmation, saisie) : les raccourcis ne s'y appliquent pas. */
export function isInDialog(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return target.closest('[role="dialog"], [role="alertdialog"]') !== null;
}

export type ShortcutAction = { type: "tool"; tool: Tool } | { type: "cancel" } | null;

/** Action d'une touche : changer d'outil, Échap, ou rien (avec Ctrl, Meta ou Alt, ou pendant une saisie). */
export function shortcutFor(e: KeyLike, typing: boolean): ShortcutAction {
  if (typing || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === "Escape") return { type: "cancel" };
  const tool = TOOL_SHORTCUTS[e.key.toLowerCase()];
  return tool ? { type: "tool", tool } : null;
}

/** Outils de dessin ou de placement : curseur en croix sur la carte. */
const CROSSHAIR_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["link", "ping", "point", "lasso", "texte", "gomme", "flux"]);
/** Outils pour lesquels les pays prennent aussi le curseur en croix. */
const CROSSHAIR_COUNTRY_TOOLS: ReadonlySet<Tool> = new Set<Tool>(["link", "ping", "point", "flux"]);

/** Classes du <svg> de la carte selon l'outil (curseurs de la bêta) ; en vue globe, main pour faire tourner. */
export function mapCursorClass(tool: Tool, view: MapView = "planisphere"): string {
  const classes: string[] = [];
  if (view === "globe" && tool === "select") classes.push("cursor-grab active:cursor-grabbing");
  if (CROSSHAIR_TOOLS.has(tool)) classes.push("cursor-crosshair");
  if (CROSSHAIR_COUNTRY_TOOLS.has(tool)) classes.push("[&_[data-k=c]]:cursor-crosshair");
  return classes.join(" ");
}

/** Effet d'un glisser sur la carte : déplacer la vue, faire tourner le globe, ou dessiner (lasso, pinceau). */
export type DragMode = "pan" | "rotate" | "draw";

export function dragMode(tool: Tool, view: MapView): DragMode {
  if (tool === "lasso" || tool === "flux") return "draw";
  return view === "globe" ? "rotate" : "pan";
}

type ZoomEventLike = { type: string; ctrlKey: boolean; button: number };

/**
 * Filtre du zoom d3 : la molette zoome toujours ; le glisser (souris, doigt) ne déplace la vue que sur le
 * planisphère, hors lasso et pinceau. Clic droit et Ctrl+glisser sont ignorés (filtre par défaut de d3).
 */
export function zoomAccepts(ev: ZoomEventLike, tool: Tool, view: MapView): boolean {
  if (ev.type === "wheel") return true;
  if (ev.ctrlKey || ev.button) return false;
  return dragMode(tool, view) === "pan";
}
