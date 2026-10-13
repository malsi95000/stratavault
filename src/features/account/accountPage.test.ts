// Page /compte sans session (src/app/compte/page.tsx) : c'est aussi le rendu renvoyé par la Server
// Action juste après la suppression du compte (cookies effacés). Son texte ne doit rien affirmer sur
// des cartes qui n'existent plus.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ComptePage from "@/app/compte/page";

const mocks = vi.hoisted(() => ({
  check: { value: { status: "signed-out" } as { status: string } },
  demo: { value: false },
}));

vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/supabase/user", () => ({ checkActiveAccount: async () => mocks.check.value }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (mocks.demo.value && name === "sv-demo" ? { value: "1" } : undefined) }),
  headers: async () => new Headers(),
}));

const render = async () =>
  renderToStaticMarkup(await ComptePage({ params: Promise.resolve({}), searchParams: Promise.resolve({}) } as PageProps<"/compte">));

beforeEach(() => {
  mocks.check.value = { status: "signed-out" };
  mocks.demo.value = false;
});

describe("/compte sans session", () => {
  it("texte neutre, juste aussi après la suppression du compte", async () => {
    const html = await render();
    expect(html).toContain("Session terminée");
    expect(html).toContain('href="/connexion"');
    expect(html).not.toContain("restent disponibles");
    expect(html).not.toMatch(/vos cartes/i);
  });

  it("mode démo : renvoie vers l'espace", async () => {
    mocks.demo.value = true;
    const html = await render();
    expect(html).toContain("mode démo");
    expect(html).toContain('href="/espace"');
  });
});
