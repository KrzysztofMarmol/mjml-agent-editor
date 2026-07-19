create table documents (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'New email',
  mjml text not null default '',
  project_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  section_id text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index comments_document_open_idx on comments (document_id) where status = 'open';

-- Spike: no RLS — local access via anon/service key.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
