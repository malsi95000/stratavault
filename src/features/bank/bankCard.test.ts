// Carte de la banque : « Continuer » d'une carte qui a des membres ouvre l'éditeur coopératif.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sharedMapPath } from "@/features/sharing/paths";
import BankCard from "./components/BankCard";

const MAP = "12345678-1234-4234-8234-123456789abc";

const render = (props: { sharing?: boolean; shared?: boolean }) =>
  renderToStaticMarkup(
    createElement(BankCard, {
      item: { id: MAP, name: "Sahel", active: false, meta: "" },
      onContinue: () => {},
      onRename: () => {},
      onDelete: () => {},
      loadDoc: async () => null,
      onCover: async () => true,
      ...props,
    }),
  );

describe("carte de la banque", () => {
  it("carte sans membre : « Continuer » ouvre l'éditeur habituel (bouton)", () => {
    const html = render({ sharing: true });
    expect(html).toMatch(/<button[^>]*>Continuer<\/button>/);
    expect(html).not.toContain("partagée");
  });

  it("carte qui a des membres : « Continuer » mène à l'éditeur coopératif, et la carte est signalée partagée", () => {
    const html = render({ sharing: true, shared: true });
    expect(html).not.toMatch(/<button[^>]*>Continuer<\/button>/);
    expect(html).toMatch(new RegExp(`<a[^>]*href="${sharedMapPath(MAP)}"[^>]*>Continuer</a>`));
    expect(html).toContain("Sahel — partagée");
  });
});
