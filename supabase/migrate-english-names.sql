-- One off, for a database created before the tables had English names.
-- Run it after schema.sql: it copies the old compiti and orario rows into
-- homework and timetable, renaming the JSON keys of the week on the way.
-- Drop the old tables once the new code is live:
--   drop table public.compiti, public.orario;

begin;

insert into public.homework (student, key, done, note, updated_at)
select alunno, chiave, fatto, note, aggiornato
from public.compiti
on conflict (student, key) do nothing;

insert into public.timetable (student, data, updated_at)
select o.alunno,
  (select jsonb_object_agg(d.new_day, coalesce(
     (select jsonb_agg(jsonb_build_object(
                'start', s.slot->>'inizio',
                'end', s.slot->>'fine',
                'subject', s.slot->>'materia') order by s.n)
      from jsonb_array_elements(o.dati->d.old_day) with ordinality as s(slot, n)),
     '[]'::jsonb))
   from (values ('lun', 'mon'), ('mar', 'tue'), ('mer', 'wed'), ('gio', 'thu'), ('ven', 'fri'))
     as d(old_day, new_day)),
  o.aggiornato
from public.orario o
on conflict (student) do nothing;

commit;
