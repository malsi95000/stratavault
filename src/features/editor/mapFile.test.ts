import { describe, expect, it, vi } from "vitest";
import { BETA_EXPORT } from "@/features/map-doc/fixtures";
import { blankDoc, parseMapDoc } from "@/features/map-doc/schema";
import type { MapDoc } from "@/features/map-doc/types";
import {
  EXPORT_FILE_NAME,
  EXPORT_MIME_TYPE,
  IMPORT_INVALID,
  IMPORT_TOO_LARGE,
  MAX_IMPORT_BYTES,
  exportBlob,
  readMapFile,
  serializeMapDoc,
} from "./mapFile";
import type { ReadableFile } from "./mapFile";

const jsonFile = (value: unknown, indent?: number) =>
  new Blob([JSON.stringify(value, null, indent)], { type: EXPORT_MIME_TYPE });

/** Fichier factice d'une taille donnée, dont on peut vérifier s'il a été lu. */
const fakeFile = (size: number, content: string): ReadableFile => ({ size, text: vi.fn(async () => content) });

const importedDoc = async (file: ReadableFile): Promise<MapDoc> => {
  const result = await readMapFile(file);
  if (!result.ok) throw new Error(result.error);
  return result.doc;
};

describe("export d'une carte", () => {
  it("produit le fichier de la bêta : JSON indenté d'un espace", async () => {
    const doc = parseMapDoc(BETA_EXPORT);
    if (!doc) throw new Error("fixture invalide");
    const blob = exportBlob(doc);
    expect(EXPORT_FILE_NAME).toBe("stratavault-carte.json");
    expect(blob.type).toBe(EXPORT_MIME_TYPE);
    expect(await blob.text()).toBe(JSON.stringify(doc, null, 1));
    expect(serializeMapDoc(blankDoc())).toBe(JSON.stringify(blankDoc(), null, 1));
  });

  it("un export puis un import redonnent la même carte", async () => {
    const doc = parseMapDoc(BETA_EXPORT);
    if (!doc) throw new Error("fixture invalide");
    expect(await importedDoc(exportBlob(doc))).toEqual(doc);
    expect(await importedDoc(exportBlob(blankDoc()))).toEqual(blankDoc());
  });
});

describe("import d'un fichier", () => {
  it("accepte un export de la bêta tel quel (indenté ou non) et le normalise", async () => {
    for (const indent of [undefined, 1]) {
      const doc = await importedDoc(jsonFile(BETA_EXPORT, indent));
      expect(doc).toEqual(parseMapDoc(BETA_EXPORT));
      // Ancien format de lien : code pays sans préfixe.
      expect(doc.links[0]).toMatchObject({ a: "c:FRA", b: "c:DEU" });
      expect(doc.pings).toHaveLength(BETA_EXPORT.pings.length);
    }
  });

  it("accepte un fichier UTF-8 avec BOM", async () => {
    const file = new Blob(["﻿" + JSON.stringify(BETA_EXPORT, null, 1)]);
    expect(await importedDoc(file)).toEqual(parseMapDoc(BETA_EXPORT));
  });

  it("refuse un fichier trop volumineux sans le lire", async () => {
    const file = fakeFile(MAX_IMPORT_BYTES + 1, JSON.stringify(BETA_EXPORT));
    expect(await readMapFile(file)).toEqual({ ok: false, error: IMPORT_TOO_LARGE });
    expect(file.text).not.toHaveBeenCalled();
  });

  it("lit un fichier pile à la taille maximale", async () => {
    const file = fakeFile(MAX_IMPORT_BYTES, JSON.stringify(BETA_EXPORT));
    expect((await readMapFile(file)).ok).toBe(true);
    expect(file.text).toHaveBeenCalledOnce();
  });

  it.each([
    ["un fichier vide", ""],
    ["du texte qui n'est pas du JSON", "ceci n'est pas une carte"],
    ["un JSON tronqué", JSON.stringify(BETA_EXPORT).slice(0, 200)],
    ["un tableau", "[]"],
    ["null", "null"],
    ["un objet quelconque", '{"nom":"Stratavault"}'],
    ["une carte dont un lien pointe vers un élément absent", JSON.stringify({ ...blankDoc(), links: [{ id: "l1", a: "c:FRA", b: "p:absent", title: "", note: "" }] })],
    ["une carte avec un identifiant dangereux", JSON.stringify({ ...blankDoc(), points: [{ id: "<img src=x onerror=alert(1)>", ll: [0, 0], title: "", note: "" }] })],
  ])("refuse %s", async (_label, content) => {
    expect(await readMapFile(new Blob([content]))).toEqual({ ok: false, error: IMPORT_INVALID });
  });

  it("refuse proprement un fichier illisible", async () => {
    const file: ReadableFile = { size: 10, text: () => Promise.reject(new Error("lecture impossible")) };
    expect(await readMapFile(file)).toEqual({ ok: false, error: IMPORT_INVALID });
  });

  it("les messages reprennent ceux de la bêta", () => {
    expect(IMPORT_INVALID).toBe("Fichier invalide : ce n’est pas une carte Stratavault.");
    expect(IMPORT_TOO_LARGE).toContain("10 Mo");
  });
});
