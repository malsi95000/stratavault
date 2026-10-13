import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { idleStatus } from "@/features/editor/saveProfiles";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));
// Les actions serveur des comptes ne sont pas utilisées sans compte.
vi.mock("@/features/auth/actions", () => ({ endSession: vi.fn(), signOut: vi.fn() }));
vi.mock("@/features/maps/actions", () => ({
  listMaps: vi.fn(),
  getMap: vi.fn(),
  createMap: vi.fn(),
  updateMap: vi.fn(),
  renameMap: vi.fn(),
  deleteMap: vi.fn(),
}));

const { default: TopBar } = await import("./TopBar");

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
});
