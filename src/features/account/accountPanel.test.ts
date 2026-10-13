// Rubrique « Supprimer mon compte » : la personne est informée, au moment d'agir, de ce que la
// suppression n'efface pas (sauvegardes, journaux des prestataires).
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DATA_PROVIDER, LEGAL_PAGE } from "@/lib/legal";

vi.mock("./components/DeleteAccountDialog", () => ({ default: () => null }));
vi.mock("./components/PasswordChange", () => ({ default: () => null }));
vi.mock("./components/ExportDownload", () => ({ default: () => null }));

const { default: AccountPanel } = await import("./components/AccountPanel");

const account = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "alice@example.test",
  createdAt: "2026-10-01T10:00:00Z",
  emailConfirmedAt: "2026-10-01T10:05:00Z",
  lastSignInAt: "2026-10-09T08:00:00Z",
};

describe("rubrique « Supprimer mon compte »", () => {
  it("signale les sauvegardes et les journaux, avec un lien vers les traitements", () => {
    const html = renderToStaticMarkup(createElement(AccountPanel, { account }));
    expect(html).toContain(DATA_PROVIDER.backupRetention);
    expect(html).toContain(`Les journaux techniques de l’hébergeur et de ${DATA_PROVIDER.service} ne sont pas effacés`);
    expect(html).toContain(`href="${LEGAL_PAGE.privacy.href}#traitements"`);
  });
});
