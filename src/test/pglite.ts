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

/**
 * Schéma « storage » de Supabase Storage, réduit à ce que lisent les migrations : tables des
 * compartiments et des fichiers (RLS activé, sans politique : aucun accès tant qu'une migration n'en
 * ajoute pas), droits de l'API comme chez Supabase (tout est filtré par RLS) et storage.foldername().
 * Les écritures de l'API Storage sont simulées par TestDb.storageUpload et TestDb.storageRemove.
 */
const STORAGE_STUB = `
  create schema storage;
  grant usage on schema storage to anon, authenticated;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text,
    owner uuid,
    owner_id text default nullif(current_setting('request.jwt.claim.sub', true), ''),
    version text,
    metadata jsonb,
    created_at timestamptz default now(),
    unique (bucket_id, name)
  );
  alter table storage.buckets enable row level security;
  alter table storage.objects enable row level security;
  grant all on table storage.buckets, storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
  declare _parts text[];
  begin
    select string_to_array(name, '/') into _parts;
    return _parts[1:array_length(_parts, 1) - 1];
  end
  $$;
`;

// Ce que Supabase met en place avant toute migration (rôles, schéma auth, schéma storage, droits par défaut).
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
  ${STORAGE_STUB}
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
  /**
   * Envoi d'un fichier comme le fait l'API Storage (supabase/storage, `Uploader.canUpload` puis
   * `completeUpload`) : chaque vérification est une écriture « sonde » faite avec le rôle et le jeton
   * du compte (`userId`, ou anonyme avec `null`) dans un SAVEPOINT puis ANNULÉE (ROLLBACK TO
   * SAVEPOINT), avant que la ligne ne soit écrite avec le rôle de l'API (ici, le superutilisateur),
   * owner_id = sub. Tout ce qu'une politique écrit pendant la sonde est donc perdu. Refus : erreur
   * « row-level security » de la sonde, et rien n'est écrit.
   */
  storageUpload: (userId: string | null, bucket: string, name: string) => Promise<void>;
  /**
   * Suppression de fichiers comme le fait l'API Storage (`ObjectStorage.deleteObjects`) : la sonde
   * (DELETE avec le rôle du compte, annulé) dit quels fichiers la politique permet d'effacer, puis
   * ceux-là seulement sont supprimés avec le rôle de l'API. Les autres sont ignorés SANS erreur.
   * Renvoie les noms supprimés.
   */
  storageRemove: (userId: string | null, bucket: string, names: readonly string[]) => Promise<string[]>;
  /**
   * Création d'une adresse d'envoi signée (`createSignedUploadUrl`) : une seule sonde, avec le rôle et
   * le jeton du compte, annulée (INSERT, ou INSERT … ON CONFLICT DO UPDATE avec `upsert`). Rien n'est
   * écrit ; refus : erreur de la sonde.
   */
  storageSignUpload: (userId: string, bucket: string, name: string, upsert?: boolean) => Promise<void>;
  /**
   * Envoi par une adresse signée (`uploadToSignedUrl`) : écriture avec le rôle de l'API seulement,
   * SANS sonde ni politique, owner_id = propriétaire inscrit dans l'adresse ; avec `upsert`, un
   * fichier existant est réécrit (nouvelle version).
   */
  storageUploadToSignedUrl: (owner: string, bucket: string, name: string, upsert?: boolean) => Promise<void>;
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

  /** Exécute `probe` avec le rôle et le jeton du compte dans un SAVEPOINT, puis l'annule. */
  async function probeAs<T>(userId: string | null, probe: () => Promise<T>): Promise<T> {
    await db.exec("savepoint storage_probe");
    try {
      await db.exec(`set local role ${userId === null ? "anon" : "authenticated"}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
      return await probe();
    } finally {
      // Annule aussi le rôle et le jeton (SET LOCAL), comme l'API.
      await db.exec("rollback to savepoint storage_probe");
    }
  }

  /** Transaction avec le rôle de l'API ; annulée en cas d'erreur. */
  async function inTransaction<T>(run: () => Promise<T>): Promise<T> {
    await db.exec("begin");
    try {
      const result = await run();
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  }

  const INSERT_OBJECT = "insert into storage.objects (bucket_id, name, owner_id) values ($1, $2, $3)";
  const UPSERT_OBJECT =
    "insert into storage.objects (bucket_id, name, owner_id, version) values ($1, $2, $3, gen_random_uuid()::text) " +
    "on conflict (bucket_id, name) do update set owner_id = excluded.owner_id, version = excluded.version, metadata = excluded.metadata";
  const DELETE_OBJECTS = "delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name";

  async function storageUpload(userId: string | null, bucket: string, name: string) {
    const params = [bucket, name, userId];
    // canUpload : sonde avant de recevoir le fichier.
    await inTransaction(() => probeAs(userId, () => db.query(INSERT_OBJECT, params)));
    // completeUpload : nouvelle sonde dans la transaction de l'API, puis écriture réelle.
    await inTransaction(async () => {
      await probeAs(userId, () => db.query(INSERT_OBJECT, params));
      await db.query(INSERT_OBJECT, params);
    });
  }

  async function storageRemove(userId: string | null, bucket: string, names: readonly string[]) {
    return inTransaction(async () => {
      const probe = await probeAs(userId, () => db.query<{ name: string }>(DELETE_OBJECTS, [bucket, [...names]]));
      const allowed = probe.rows.map((row) => row.name);
      if (allowed.length === 0) return [];
      const { rows } = await db.query<{ name: string }>(DELETE_OBJECTS, [bucket, allowed]);
      return rows.map((row) => row.name).toSorted();
    });
  }

  async function storageSignUpload(userId: string, bucket: string, name: string, upsert = false) {
    await inTransaction(() => probeAs(userId, () => db.query(upsert ? UPSERT_OBJECT : INSERT_OBJECT, [bucket, name, userId])));
  }

  async function storageUploadToSignedUrl(owner: string, bucket: string, name: string, upsert = false) {
    await inTransaction(() => db.query(upsert ? UPSERT_OBJECT : INSERT_OBJECT, [bucket, name, owner]));
  }

  return { db, as, asClaims, addUsers, storageUpload, storageRemove, storageSignUpload, storageUploadToSignedUrl };
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
