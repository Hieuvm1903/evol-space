-- Unity-style Scene & Entity schema for Supabase.
-- Run in the Supabase SQL Editor if you want to create or migrate scene tables.

create table if not exists public.scenes (
  id                bigint generated always as identity primary key,
  user_id           uuid not null references auth.users (id) on delete cascade,
  name              text not null,
  model_set_name    text,
  model_set_version text,
  -- Version 3 JSON document:
  -- {
  --   "version": 3,
  --   "objects": [
  --     {
  --       "id": "...",
  --       "kind": "robot" | "obstacle" | "group" | "light",
  --       "label": "AMR-1",
  --       "parentId": null,
  --       "transform": { "position": [0,0,0], "rotation": [0,0,0], "scale": 1 },
  --       "components": {
  --         "renderer": { "asset": "robot", "static": false, "opacity": 1, "joints": {} },
  --         "robot": { "script": "..." },  -- ONLY present when kind = 'robot'
  --         "light": { ... }               -- ONLY present when kind = 'light'
  --       }
  --     }
  --   ],
  --   "zones": [...],
  --   "aiBlueprints": {...}
  -- }
  data              jsonb not null default '{"version":3,"objects":[]}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.scenes enable row level security;

drop policy if exists "scenes_owner_all" on public.scenes;
create policy "scenes_owner_all"
  on public.scenes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Optional normalized table if you want per-entity rows in Supabase:
-- Every entity has Transform; only kind = 'robot' may store a robot_script.
create table if not exists public.scene_entities (
  id           text primary key,
  scene_id     bigint not null references public.scenes (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  kind         text not null check (kind in ('robot', 'obstacle', 'group', 'light')),
  label        text not null,
  parent_id    text,
  transform    jsonb not null default '{"position":[0,0,0],"rotation":[0,0,0],"scale":1}'::jsonb,
  components   jsonb not null default '{}'::jsonb,
  robot_script text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint only_robot_has_script check (kind = 'robot' or robot_script is null)
);

create index if not exists idx_scene_entities_scene on public.scene_entities (scene_id);

alter table public.scene_entities enable row level security;

drop policy if exists "scene_entities_owner_all" on public.scene_entities;
create policy "scene_entities_owner_all"
  on public.scene_entities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
