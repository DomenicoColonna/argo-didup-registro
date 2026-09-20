-- Run once in the Supabase SQL editor (or with the supabase CLI).

-- ---------- homework state ----------
-- One row per student and homework item. The server uses the service role
-- key, which bypasses row level security; RLS is on with no policy so the
-- anon key can read nothing.
create table if not exists public.compiti (
  alunno     text        not null,
  chiave     text        not null,
  fatto      boolean     not null default false,
  note       text        not null default '',
  aggiornato timestamptz not null default now(),
  primary key (alunno, chiave)
);
alter table public.compiti enable row level security;

-- ---------- timetable ----------
-- One row per student, the whole week as JSON: { lun: [{inizio, fine, materia}], ... ven }.
create table if not exists public.orario (
  alunno     text        primary key,
  dati       jsonb       not null default '{}'::jsonb,
  aggiornato timestamptz not null default now()
);
alter table public.orario enable row level security;

-- ---------- keepalive ----------
-- A free project pauses after 7 days without activity. keepalive_ping() does a
-- small write and is callable with the anon key, so both the Netlify scheduled
-- function and the GitHub workflow can hit it.
create table if not exists public.keepalive (
  id        int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);
insert into public.keepalive default values on conflict do nothing;
alter table public.keepalive enable row level security;   -- no policy: only through the function

create or replace function public.keepalive_ping()
returns timestamptz language sql security definer set search_path = '' as $$
  update public.keepalive set pinged_at = now() where id = 1 returning pinged_at;
$$;
revoke execute on function public.keepalive_ping() from public, authenticated;
grant execute on function public.keepalive_ping() to anon, service_role;
