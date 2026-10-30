// Signalement par e-mail d'un profil ou d'une carte partagée : adresse du point de contact, emplacement
// du contenu, éléments d'une notification (DSA, art. 16, paragraphe 2), et lien présent à côté de
// chaque contenu d'un autre membre.
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReportContentLink from "@/components/legal/ReportContentLink";
import { CONTACT_EMAIL } from "@/lib/legal";
import { REPORT_LINK_LABEL, reportBody, reportMailto, reportSubject } from "./reportContent";

const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

describe("signalement d'un profil ou d'une carte partagée", () => {
  it("un e-mail au point de contact, prérempli avec l'emplacement du contenu", () => {
    const profile = { kind: "profile", handle: "alice" } as const;
    const map = { kind: "shared-map", mapName: "Arctique & co", owner: "Carol (@carol)" } as const;
    expect(reportSubject(profile)).toBe("Signalement : profil @alice");
    expect(reportSubject(map)).toBe("Signalement : carte partagée « Arctique & co », de Carol (@carol)");
    const url = new URL(reportMailto(map));
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(CONTACT_EMAIL);
    expect(url.searchParams.get("subject")).toBe(reportSubject(map));
    expect(url.searchParams.get("body")).toBe(reportBody(map));
  });

  it("le message demande les éléments d'une notification (raisons, emplacement, identité, bonne foi)", () => {
    const body = reportBody({ kind: "profile", handle: "alice" });
    for (const part of ["profil @alice", "Raisons du signalement", "emplacement", "Vos nom et prénom", "pédopornographie", "de bonne foi"]) {
      expect(body).toContain(part);
    }
  });

  it("le lien est rendu avec son texte, et placé à côté des profils et des cartes partagées d'autres membres", () => {
    const html = renderToStaticMarkup(createElement(ReportContentLink, { target: { kind: "profile", handle: "bob" } }));
    expect(html).toContain(REPORT_LINK_LABEL.profile);
    expect(html).toContain(`href="mailto:${CONTACT_EMAIL}?subject=`);
    for (const path of [
      "src/app/profil/[handle]/page.tsx",
      "src/features/sharing/components/SharedWithMe.tsx",
      "src/features/sharing/coop/CoopTopBar.tsx",
    ]) {
      expect(source(path), path).toContain("<ReportContentLink");
    }
  });
});
