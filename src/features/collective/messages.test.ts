// Textes de la carte collective : signature (nom affiché et identifiant public), avis de modération,
// suspension, avertissement de l'espace tiré de warning.ts.
import { describe, expect, it } from "vitest";
import { contributedBy, noticeText, suspensionText, unreadNoticesText } from "./messages";
import { COLLECTIVE_WARNING } from "./warning";

describe("textes de la carte collective", () => {
  it("un élément est signé du nom affiché et de l'identifiant public, qui distingue deux homonymes", () => {
    expect(contributedBy("Alice Martin", "alice")).toBe("Ajouté par Alice Martin (@alice)");
    expect(contributedBy("Alice Martin", "bob")).toBe("Ajouté par Alice Martin (@bob)");
    expect(contributedBy(null, null)).toBe("Ajouté par Membre sans profil");
  });

  it("avis : retrait par l'auteur, suspension datée", () => {
    expect(noticeText("reporter", "withdraw", "ping", "Port")).toBe("Votre signalement (balise « Port ») a été traité : élément retiré par son auteur.");
    // Supprimer un élément supprime aussi les liens de son auteur qui y sont rattachés : l'auteur le sait.
    expect(noticeText("author", "delete", "ping", "Port")).toBe(
      "Votre élément (balise « Port ») a été supprimé, avec vos liens qui y étaient rattachés s’il y en avait, par la modération.",
    );
    expect(noticeText("author", "delete", "link", "")).toBe("Votre élément (lien) a été supprimé par la modération.");
    expect(noticeText("author", "hide", "ping", "Port")).toBe("Votre élément (balise « Port ») a été masqué par la modération.");
    expect(suspensionText("2026-11-26T10:00:00.000Z")).toBe("Contributions suspendues jusqu’au 26 nov. 2026.");
    expect(unreadNoticesText(1)).toContain("1 avis de modération non lu ");
    expect(unreadNoticesText(3)).toContain("3 avis de modération non lus");
  });

  it("avertissement : la phrase reprise dans l'espace est celle de warning.ts", () => {
    expect(COLLECTIVE_WARNING.short.length).toBeGreaterThan(0);
    expect(COLLECTIVE_WARNING.paragraphs.join(" ")).toContain("identifiant public");
  });
});
