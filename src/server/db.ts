import "server-only";
import postgres from "postgres";

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
    state.ready = migrate(sql).catch((e) => {
      state.ready = null;
      throw e;
    });
  }
  await state.ready;
  return sql;
}

async function migrate(sql: Sql) {
  await sql`
    create table if not exists anfragen (
      id              bigserial primary key,
      reference       text not null unique,
      status          text not null default 'neu',
      environment     text not null,
      idempotency_key text not null unique,
      dedupe_key      text not null,
      created_at      timestamptz not null default now(),
      updated_at      timestamptz not null default now(),
      start_date      date not null,
      end_date        date not null,
      start_time      text not null,
      end_time        text not null,
      occasion        text not null,
      guests          integer not null,
      message         text not null default '',
      overnight       boolean not null default false,
      name            text not null,
      email           text not null,
      company         text not null default '',
      phone           text not null default '',
      availability_checked_at timestamptz not null,
      internal_note   text not null default ''
    )`;
  await sql`create index if not exists anfragen_dedupe_idx on anfragen (dedupe_key, created_at desc)`;
  await sql`create index if not exists anfragen_created_idx on anfragen (created_at desc)`;
  await sql`
    create table if not exists anfrage_emails (
      id          bigserial primary key,
      anfrage_id  bigint not null references anfragen(id) on delete cascade,
      kind        text not null,
      recipient   text not null,
      status      text not null default 'ausstehend',
      attempts    integer not null default 0,
      last_error  text,
      provider_id text,
      sent_at     timestamptz,
      updated_at  timestamptz not null default now(),
      unique (anfrage_id, kind)
    )`;
  await sql`
    create table if not exists anfrage_rate_limits (
      bucket      text not null,
      window_start timestamptz not null,
      hits        integer not null default 0,
      primary key (bucket, window_start)
    )`;
}
