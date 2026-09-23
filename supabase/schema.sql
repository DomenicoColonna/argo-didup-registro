-- Run once in the Supabase SQL editor (or with the supabase CLI).

-- ---------- homework state ----------
-- One row per student and homework item. The server uses the service role
-- key, which bypasses row level security; RLS is on with no policy so the
-- anon key can read nothing.
create table if not exists public.homework (
  student    text        not null,
  key        text        not null,
  done       boolean     not null default false,
  note       text        not null default '',
  updated_at timestamptz not null default now(),
  primary key (student, key)
);
alter table public.homework enable row level security;

-- ---------- timetable ----------
-- One row per student, the whole week as JSON: { mon: [{start, end, subject}], ... fri }.
create table if not exists public.timetable (
  student    text        primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.timetable enable row level security;

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
