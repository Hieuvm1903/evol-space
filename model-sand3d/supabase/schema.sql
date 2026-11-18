-- Run once in the Supabase SQL editor.
insert into storage.buckets (id, name, public) values ('models', 'models', true)
on conflict (id) do nothing;

create table if not exists model_sets (
  id         bigint generated always as identity primary key,
  name       text  not null,
  version    text  not null,
  base_path  text  not null,
  files      jsonb not null,
  created_at timestamptz default now(),
  unique (name, version)
);
alter table model_sets enable row level security;
drop policy if exists "public read" on model_sets;
create policy "public read" on model_sets for select using (true);
-- No insert policy: only the service-role key (CI) can write.
