/**
 * Legt das Datenbankschema an bzw. aktualisiert es (versionierte Migrationen).
 *
 *   DATABASE_URL=… npm run db:migrate -- --ziel=<hostname>
 *
 * --ziel muss dem Hostnamen aus DATABASE_URL entsprechen. Das verhindert, dass
 * versehentlich eine falsche Datenbank verändert wird. Zugangsdaten werden nicht
 * ausgegeben. Bestehende fremde Tabellen werden nicht verändert.
 */
import postgres from "postgres";
import { MIGRATION_LOCK_KEY, MIGRATIONS, MIGRATIONS_TABLE_SQL } from "../src/server/schema.ts";

const raw = (process.env.DATABASE_URL ?? "").trim();
if (!raw) {
  console.error("DATABASE_URL fehlt.");
  process.exit(1);
}
const url = new URL(raw);
const target = process.argv.find((a) => a.startsWith("--ziel="))?.slice(7);
if (target !== url.hostname) {
  console.error(`Abgebrochen: Bitte Ziel bestätigen mit --ziel=${url.hostname} (Datenbank "${url.pathname.slice(1)}").`);
  process.exit(1);
}
const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
const sql = postgres(raw, { max: 1, prepare: false, ssl: local ? false : "require", onnotice: () => {} });
try {
  const applied = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK_KEY})`;
    await tx.unsafe(MIGRATIONS_TABLE_SQL);
    const done = new Set((await tx<{ id: number }[]>`select id from space_schema_migrations`).map((r) => r.id));
    const out: string[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await tx.unsafe(m.sql);
      await tx`insert into space_schema_migrations (id, name) values (${m.id}, ${m.name})`;
      out.push(`${m.id} ${m.name}`);
    }
    return out;
  });
  const tables = await sql<{ table_name: string; rls: boolean }[]>`
    select c.relname as table_name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = current_schema() and c.relname in ('anfragen','anfrage_emails','anfrage_rate_limits','space_schema_migrations') order by 1`;
  console.log(applied.length ? `Angewendet: ${applied.join(", ")}` : "Schema ist aktuell, nichts zu tun.");
  for (const t of tables) console.log(`  ${t.table_name}: vorhanden, Row Level Security ${t.rls ? "aktiv" : "AUS"}`);
} catch (e) {
  console.error("Migration fehlgeschlagen:", (e as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
