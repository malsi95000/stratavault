import { DEFAULT_COOKIE_OPTIONS } from "@supabase/ssr";
import { describe, expect, it } from "vitest";
import { EDITOR_TABS_CHANNEL } from "@/features/editor/otherTabs";
import { VIEW_STORAGE_KEY } from "@/features/editor/viewStore";
import { DB_NAME } from "@/features/storage/indexeddb";
import { DEMO_MODE, USER_DB_PREFIX, localDbName } from "@/features/storage/mode";
import { DEMO_COOKIE, SESSION_COOKIE_MAX_AGE, demoCookieOptions, isSessionCookie, secureCookieOptions } from "@/lib/supabase/cookies";
import { sourceFiles, stringConstant, type SourceFile } from "@/test/sourceFiles";
import {
  DEMO_COOKIE_MAX_AGE_S,
  STORAGE_INVENTORY,
  SUPABASE_COOKIE_MAX_AGE_S,
  SUPABASE_COOKIE_PREFIX,
  inventoryByKind,
  type StorageKind,
} from "./storageInventory";

const FILES = sourceFiles();

/** Noms déclarés pour un type de stockage. */
const declared = (kind: StorageKind) => STORAGE_INVENTORY.filter((item) => item.kind === kind).map((item) => item.name);

/** Fichiers dont le code (commentaires retirés) correspond à `pattern`. */
function filesUsing(pattern: RegExp): SourceFile[] {
  return FILES.filter(({ text }) => pattern.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")));
}

/** Valeur d'une constante, cherchée dans le fichier puis dans tout le code. */
function resolve(name: string, file: SourceFile): string | null {
  return stringConstant(file.text, name) ?? FILES.map((f) => stringConstant(f.text, name)).find((v) => v !== null) ?? null;
}

describe("inventaire des cookies et stockages", () => {
  it("chaque nom déclaré correspond aux constantes du code", () => {
    expect(declared("cookie")).toContain(DEMO_COOKIE);
    expect(declared("indexeddb")).toEqual([DB_NAME, `${USER_DB_PREFIX}<identifiant du compte>`]);
    expect(declared("localstorage")).toEqual([VIEW_STORAGE_KEY]);
    expect(declared("broadcastchannel")).toContain(EDITOR_TABS_CHANNEL);
  });

  it("les cookies de session Supabase déclarés sont bien ceux que l'application reconnaît", () => {
    const supabase = declared("cookie").filter((name) => name.startsWith(SUPABASE_COOKIE_PREFIX));
    expect(supabase).toHaveLength(2);
    for (const name of supabase) expect(isSessionCookie(name.replace("<réf. du projet>", "abcd"))).toBe(true);
  });

  it("les durées et options annoncées sont celles du code", () => {
    expect(demoCookieOptions(true).maxAge).toBe(DEMO_COOKIE_MAX_AGE_S);
    // Durée imposée par @supabase/ssr, plafonnée par secureCookieOptions.
    expect(secureCookieOptions({ maxAge: DEFAULT_COOKIE_OPTIONS.maxAge }, true).maxAge).toBe(SUPABASE_COOKIE_MAX_AGE_S);
    expect(SESSION_COOKIE_MAX_AGE).toBe(SUPABASE_COOKIE_MAX_AGE_S);
    expect(secureCookieOptions({}, true)).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/" });
    const demo = STORAGE_INVENTORY.find((item) => item.name === DEMO_COOKIE);
    expect(demo?.duration).toMatch(/^30 jours/);
    // clearDemo() est aussi appelé à la déconnexion (closeSession, src/features/auth/actions.ts).
    expect(demo?.duration).toContain("à la déconnexion");
    // Sans userStorage, auth-js enregistre la session entière, fiche du compte comprise.
    const session = STORAGE_INVENTORY.find((item) => item.name.startsWith(`${SUPABASE_COOKIE_PREFIX}<réf. du projet>-auth-token (`));
    expect(session?.content).toContain("fiche du compte");
    for (const item of STORAGE_INVENTORY.filter((i) => i.kind === "cookie")) {
      expect(item.options).toContain("HttpOnly");
      expect(item.options).toContain("SameSite=Lax");
    }
    for (const item of STORAGE_INVENTORY.filter((i) => i.name.startsWith(SUPABASE_COOKIE_PREFIX))) {
      expect(item.duration).toContain(`${SUPABASE_COOKIE_MAX_AGE_S / 86400} jours`);
    }
  });

  it("tout cookie écrit par le code est déclaré", () => {
    const writes = FILES.flatMap((file) =>
      [...file.text.matchAll(/(?:cookies\(\)\)|cookieStore|\.cookies)\.set\(\s*([A-Za-z_][\w]*|"[^"]*")/g)].map((m) => ({
        file,
        arg: m[1],
      })),
    );
    expect(writes.length).toBeGreaterThan(0);
    for (const { file, arg } of writes) {
      if (arg === "name") {
        // Cookies écrits par la bibliothèque @supabase/ssr (setAll) : seulement dans src/lib/supabase.
        expect(file.path).toMatch(/^src\/lib\/supabase\//);
        continue;
      }
      const value = arg.startsWith('"') ? arg.slice(1, -1) : resolve(arg, file);
      expect(declared("cookie"), `${file.path} : ${arg}`).toContain(value);
    }
  });

  it("aucun cookie n'est écrit depuis le navigateur, aucun sessionStorage", () => {
    expect(filesUsing(/document\.cookie|sessionStorage/).map((f) => f.path)).toEqual([]);
  });

  it("tout canal BroadcastChannel du code est déclaré", () => {
    const channels = FILES.flatMap((file) =>
      [...file.text.matchAll(/new BroadcastChannel\((\w+)\)/g)].map((m) => resolve(m[1], file)),
    );
    expect(channels.length).toBeGreaterThan(0);
    expect(new Set(channels)).toEqual(new Set(declared("broadcastchannel")));
  });

  it("le localStorage n'est utilisé que par la préférence de vue, sous le nom déclaré", () => {
    expect(filesUsing(/localStorage\.setItem/).map((f) => f.path)).toEqual(["src/features/editor/viewStore.ts"]);
    const persisted = FILES.flatMap((file) =>
      [...file.text.matchAll(/persist\([\s\S]*?\bname:\s*(\w+)/g)].map((m) => resolve(m[1], file)),
    );
    expect(persisted).toEqual(declared("localstorage"));
  });

  it("les bases IndexedDB ne sont ouvertes que par le dépôt local, sous les noms déclarés", () => {
    expect(filesUsing(/\bopenDB\b|indexedDB\.open\(/).map((f) => f.path)).toEqual(["src/features/storage/indexeddb.ts"]);
    expect(localDbName(DEMO_MODE)).toBe(DB_NAME);
    expect(localDbName({ kind: "account", userId: "u1" })).toBe(`${USER_DB_PREFIX}u1`);
  });

  it("regroupe l'inventaire par type sans rien perdre", () => {
    const groups = inventoryByKind();
    expect(groups.flatMap((g) => g.items)).toHaveLength(STORAGE_INVENTORY.length);
    expect(new Set(STORAGE_INVENTORY.map((i) => i.name)).size).toBe(STORAGE_INVENTORY.length);
  });
});
