// Base PostgreSQL de test (PGlite) avec les migrations de supabase/migrations/ appliquées.
// Le schéma « auth » de Supabase est simulé : auth.users, auth.uid() et auth.jwt(), qui lisent les
// claims du jeton comme chez Supabase (`request.jwt.claim.sub`, ou `request.jwt.claims` en JSON).
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Toutes les migrations, dans l'ordre de leur nom (horodatage), comme `supabase db push`.
const MIGRATIONS_DIR = new URL("../../supabase/migrations/", import.meta.url);
export const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort();
export const MIGRATIONS = MIGRATION_FILES.map((file) => readFileSync(new URL(file, MIGRATIONS_DIR), "utf8"));

/** Migrations jusqu'au fichier `last` inclus (état d'un projet qui n'a pas encore appliqué les suivantes). */
export const migrationsUpTo = (last: string) => MIGRATIONS.slice(0, MIGRATION_FILES.indexOf(last) + 1);

// Ce que Supabase met en place avant toute migration (rôles, schéma auth, droits par défaut).
export const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  grant usage on schema auth to anon, authenticated;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    )::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`;

export type TestDb = {
  db: PGlite;
  /**
   * Exécute une requête avec le rôle de l'API : utilisateur connecté (`userId`), utilisateur
   * « authenticated » sans claim sub (`""`), ou visiteur anonyme (`null`).
   */
  as: <T>(userId: string | null, sql: string, params?: unknown[]) => Promise<T[]>;
  /**
   * Exécute une requête avec le rôle authenticated et les claims complets d'un jeton (`sub`,
   * `session_id`, `amr`…), lus par auth.uid() et auth.jwt().
   */
  asClaims: <T>(claims: Record<string, unknown>, sql: string, params?: unknown[]) => Promise<T[]>;
  /** Crée des utilisateurs dans auth.users. */
  addUsers: (...ids: string[]) => Promise<void>;
};

/** Ouvre une base neuve avec `migrations` appliquées (toutes par défaut). */
export async function openTestDb(migrations: readonly string[] = MIGRATIONS): Promise<TestDb> {
  const db = await PGlite.create();
  await db.exec(SUPABASE_STUB);
  for (const migration of migrations) await db.exec(migration);

  async function as<T>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    await db.exec(`set role ${userId === null ? "anon" : "authenticated"}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
    }
  }

  async function asClaims<T>(claims: Record<string, unknown>, sql: string, params: unknown[] = []): Promise<T[]> {
    await db.exec("set role authenticated");
    try {
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims', '', false)");
    }
  }

  async function addUsers(...ids: string[]) {
    for (const id of ids) await db.query("insert into auth.users (id) values ($1)", [id]);
  }

  return { db, as, asClaims, addUsers };
}

/** Contenu d'une carte vide, au format envoyé par l'application (JSON compact). */
export const BLANK_DOC = {
  notes: {},
  dates: {},
  links: [],
  pings: [],
  points: [],
  zones: [],
  texts: [],
  flux: {},
  fluxFiches: {},
};
