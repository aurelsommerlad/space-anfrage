/**
 * Datenbankschema als versionierte Migrationen (Postgres ≥ 13).
 *
 * Bewusst ohne "server-only", damit auch scripts/db-migrate.mts sie nutzen kann.
 * Jede Migration ist idempotent formuliert und wird genau einmal in
 * space_schema_migrations vermerkt. Bestehende fremde Tabellen werden nie verändert.
 *
 * Row Level Security ist auf allen Tabellen aktiv, ohne Policies: Rollen, die
 * nicht Eigentümer sind (z. B. Supabase "anon"/"authenticated" über die
 * Daten-API), sehen keine Zeilen. Die App verbindet sich als Eigentümer.
 */
export interface Migration {
  id: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "anfragen_emails_ratelimit",
    sql: `
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
);
create index if not exists anfragen_dedupe_idx on anfragen (dedupe_key, created_at desc);
create index if not exists anfragen_created_idx on anfragen (created_at desc);

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
);

create table if not exists anfrage_rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (bucket, window_start)
);

alter table anfragen enable row level security;
alter table anfrage_emails enable row level security;
alter table anfrage_rate_limits enable row level security;

do $$
declare r text;
begin
  -- Supabase: Zugriff über die öffentliche Daten-API ausdrücklich entziehen
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on anfragen, anfrage_emails, anfrage_rate_limits from %I', r);
      execute format('revoke all on sequence anfragen_id_seq, anfrage_emails_id_seq from %I', r);
    end if;
  end loop;
end $$;
`,
  },
];

export const MIGRATIONS_TABLE_SQL = `
create table if not exists space_schema_migrations (
  id         integer primary key,
  name       text not null,
  applied_at timestamptz not null default now()
);
alter table space_schema_migrations enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on space_schema_migrations from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on space_schema_migrations from authenticated; end if;
end $$;
`;

/** Tabellen, die zu SPACE gehören. */
export const OWN_TABLES = ["anfragen", "anfrage_emails", "anfrage_rate_limits", "space_schema_migrations"];

/**
 * Fremde Tabellen im aktuellen Schema. Ist noch kein SPACE-Schema vorhanden, aber
 * es gibt fremde Tabellen, ist das vermutlich nicht die SPACE-Datenbank:
 * dann wird nichts angelegt.
 */
export const FOREIGN_TABLES_SQL = `
select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = current_schema() and c.relkind in ('r', 'p', 'v', 'm')
and c.relname <> all (array['anfragen','anfrage_emails','anfrage_rate_limits','space_schema_migrations'])
order by 1`;

export const HAS_MIGRATIONS_TABLE_SQL = `
select exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = current_schema() and c.relname = 'space_schema_migrations') as present`;

export const FOREIGN_DB_MESSAGE =
  "Die Datenbank enthält fremde Tabellen und noch kein SPACE-Schema. Vermutlich ist DATABASE_URL nicht die SPACE-Datenbank. Es wurde nichts angelegt.";

/** Schlüssel für pg_advisory_xact_lock, damit Migrationen nie parallel laufen. */
export const MIGRATION_LOCK_KEY = 7_302_026;
