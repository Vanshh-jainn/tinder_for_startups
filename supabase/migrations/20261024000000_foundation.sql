-- Phase 1: foundation tables.
-- All access goes through the Next.js server with the secret (service-role) key.
-- RLS is on with no policies, so anon/authenticated clients can read or write nothing.

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Minimal participant record so admins can issue login codes (OQ-4: admin-issued codes).
-- Profile fields (skills, preferences, summary) arrive in Phase 2; further identity fields are OQ-3.
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  number integer generated always as identity unique, -- shown as P<number>, used to log in
  display_name text not null check (char_length(display_name) between 1 and 80),
  code_hash text not null, -- bcrypt; the raw code is never stored
  created_at timestamptz not null default now()
);

create table public.sessions (
  token_hash text primary key, -- sha256 of the cookie token
  subject_type text not null check (subject_type in ('admin', 'participant')),
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index sessions_subject_idx on public.sessions (subject_type, subject_id);

-- Failed logins only; used for per-key lockout.
create table public.login_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_key_idx on public.login_attempts (key, attempted_at);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
alter table public.participants enable row level security;
alter table public.sessions enable row level security;
alter table public.login_attempts enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.admins, public.participants, public.sessions, public.login_attempts, public.audit_log
  from anon, authenticated;

-- Audit log is append-only, even for the server.
revoke update, delete, truncate on public.audit_log from service_role;
