import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { idleStatus } from "@/features/editor/saveProfiles";
import { useEditorStore } from "@/features/editor/store";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
// Les actions serveur des comptes ne sont pas utilisées sans compte.
vi.mock("@/features/auth/actions", () => ({ endSession: vi.fn(), signOut: vi.fn() }));
vi.mock("@/features/maps/actions", () => ({
  listMaps: vi.fn(),
  getMap: vi.fn(),
  createMap: vi.fn(),
  updateMap: vi.fn(),
  renameMap: vi.fn(),
  setMapCover: vi.fn(),
  deleteMap: vi.fn(),
}));

const { default: TopBar } = await import("./TopBar");

const initial = useEditorStore.getInitialState();
const savedSelection = initial.selection;
afterEach(() => Object.assign(initial, { selection: savedSelection }));

describe("barre du haut", () => {
  it("le statut d'enregistrement reste visible sur écran étroit (sous la barre, sans défilement)", () => {
    const html = renderToStaticMarkup(createElement(TopBar, { account: null }));
    const statuses = [...html.matchAll(/<(?:span|p) role="status"[^>]*class="([^"]*)"[^>]*>([^<]*)</g)];
    expect(statuses).toHaveLength(2);
    // Un seul des deux est affiché à la fois : écran large (dans la barre) ou étroit (dessous).
    const [wide, narrow] = statuses;
    expect(wide[1]).toMatch(/(^| )hidden( |$)/);
    expect(wide[1]).toContain("lg:block");
    expect(narrow[1]).toContain("lg:hidden");
    expect(narrow[1]).toContain("top-12");
    // Rendu serveur : état initial du store, statut d'attente (un conflit s'afficherait au même endroit).
    for (const status of statuses) expect(status[2]).toBe(idleStatus({ kind: "demo" }, false));
  });

  it("fiche ouverte : la barre s'arrête au bord du panneau (aucun bouton caché dessous)", () => {
    expect(renderToStaticMarkup(createElement(TopBar, { account: null }))).toContain('style="right:0"');
    Object.assign(initial, { selection: { k: "c", id: "FRA" } });
    const html = renderToStaticMarkup(createElement(TopBar, { account: null }));
    expect(html).toContain('style="right:min(360px, 100%)"');
    expect(html).toContain("Catégories");
  });
});
