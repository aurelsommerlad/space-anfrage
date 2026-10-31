import "server-only";
import postgres from "postgres";
import { MIGRATION_LOCK_KEY, MIGRATIONS, MIGRATIONS_TABLE_SQL } from "./schema";

/**
 * Postgres-Anbindung (z. B. Neon über den Vercel Marketplace).
 * Tabellen werden beim ersten Zugriff angelegt (idempotent).
 */
type Sql = ReturnType<typeof postgres>;

const g = globalThis as unknown as { __spaceSql?: { url: string; sql: Sql; ready: Promise<void> | null } };

export function getSql(databaseUrl: string): Sql {
  if (!g.__spaceSql || g.__spaceSql.url !== databaseUrl) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(databaseUrl);
    const sql = postgres(databaseUrl, {
      max: 3,
      idle_timeout: 20,
      connect_timeout: 8,
      prepare: false, // kompatibel mit Connection-Poolern (PgBouncer/Neon)
      ssl: local ? false : "require",
      onnotice: () => {},
    });
    g.__spaceSql = { url: databaseUrl, sql, ready: null };
  }
  return g.__spaceSql.sql;
}

export async function ensureSchema(databaseUrl: string): Promise<Sql> {
  const sql = getSql(databaseUrl);
  const state = g.__spaceSql!;
  if (!state.ready) {
    state.ready = migrate(sql).then(() => undefined).catch((e) => {
      state.ready = null;
      throw e;
    });
  }
  await state.ready;
  return sql;
}

/**
 * Führt ausstehende Migrationen aus (siehe schema.ts). Läuft auch über
 * "npm run db:migrate"; hier zusätzlich beim ersten Zugriff, damit eine
 * frisch angelegte Datenbank sofort nutzbar ist. Idempotent, gegen
 * parallele Ausführung gesperrt.
 */
export async function migrate(sql: Sql): Promise<number[]> {
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
    await tx.unsafe(MIGRATIONS_TABLE_SQL);
    const done = new Set((await tx<{ id: number }[]>`select id from space_schema_migrations`).map((r) => r.id));
    const applied: number[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await tx.unsafe(m.sql);
      await tx`insert into space_schema_migrations (id, name) values (${m.id}, ${m.name})`;
      applied.push(m.id);
    }
    return applied;
  });
}
