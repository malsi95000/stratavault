// Information au point de collecte de la carte collective : liens vers les CGU et la politique de
// confidentialité dans l'avertissement d'entrée et dans le formulaire de signalement.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ConditionsPage from "@/app/conditions/page";
import ConfidentialitePage from "@/app/confidentialite/page";
import { ROOT, routeExists } from "@/test/sourceFiles";
import CollectiveLegalLinks from "./components/CollectiveLegalLinks";

const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("liens légaux de la carte collective", () => {
  it("mènent aux règles de la carte collective et aux traitements, dans un nouvel onglet", () => {
    const html = renderToStaticMarkup(createElement(CollectiveLegalLinks));
    const links = [...html.matchAll(/<a href="([^"]*)" target="_blank" rel="noopener"/g)].map((m) => m[1]);
    expect(links).toEqual(["/conditions#collective", "/confidentialite#traitements"]);
    for (const href of links) expect(routeExists(href.split("#")[0]), href).toBe(true);
    expect(renderToStaticMarkup(createElement(ConditionsPage))).toContain('id="collective"');
    expect(renderToStaticMarkup(createElement(ConfidentialitePage))).toContain('id="traitements"');
  });

  it("figurent dans l'avertissement d'entrée et dans le signalement", () => {
    for (const path of [
      "src/features/collective/components/WarningDialog.tsx",
      "src/features/collective/components/ReportDialog.tsx",
    ]) {
      expect(source(path), path).toContain("<CollectiveLegalLinks />");
    }
  });
});
