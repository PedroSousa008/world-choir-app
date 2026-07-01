-- World Choir database schema
-- Run in Supabase SQL editor or via: supabase db push

create table if not exists events (
  id text primary key,
  title text not null,
  song_title text not null,
  artist text not null,
  theme text not null,
  starts_at_utc timestamptz not null,
  ends_at_utc timestamptz not null,
  hashtag text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists users (
  id text primary key,
  display_name text not null default 'World Choir Member',
  email text,
  city text default '',
  country text default '',
  latitude double precision,
  longitude double precision,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists pledges (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  event_id text not null references events(id) on delete cascade,
  display_name text not null,
  city text not null,
  country text not null,
  latitude double precision,
  longitude double precision,
  reason text,
  created_at timestamptz default now(),
  unique (user_id, event_id)
);

create table if not exists promises (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  event_id text not null references events(id) on delete cascade,
  display_name text not null,
  city text not null,
  country text not null,
  latitude double precision,
  longitude double precision,
  text text not null,
  created_at timestamptz default now(),
  unique (user_id, event_id)
);

create table if not exists gathering_places (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  name text not null,
  city text not null,
  country text not null,
  latitude double precision not null,
  longitude double precision not null,
  created_at timestamptz default now()
);

create table if not exists gathering_interests (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  gathering_place_id text not null references gathering_places(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, gathering_place_id)
);

create table if not exists friends (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  friend_user_id text not null references users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (user_id, friend_user_id)
);

create table if not exists memories (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  user_id text references users(id) on delete set null,
  type text not null check (type in ('video', 'photo', 'promise', 'clip')),
  media_url text,
  caption text not null,
  city text,
  country text,
  approved boolean default false,
  created_at timestamptz default now()
);

-- Seed the current event (configuration, not participation data)
insert into events (id, title, song_title, artist, theme, starts_at_utc, ends_at_utc, hashtag)
values (
  'world-choir-2027',
  'World Choir 2027',
  'Imagine',
  'John Lennon',
  'Peace',
  '2027-07-01T16:00:00+00',
  '2027-07-01T16:08:00+00',
  '#WorldChoir2027'
) on conflict (id) do nothing;

-- RLS: allow public read, authenticated-style open insert for anonymous users
alter table events enable row level security;
alter table users enable row level security;
alter table pledges enable row level security;
alter table promises enable row level security;
alter table gathering_places enable row level security;
alter table gathering_interests enable row level security;
alter table friends enable row level security;
alter table memories enable row level security;

create policy "events_read" on events for select using (true);
create policy "users_read" on users for select using (true);
create policy "users_upsert" on users for insert with check (true);
create policy "users_update" on users for update using (true);
create policy "pledges_read" on pledges for select using (true);
create policy "pledges_insert" on pledges for insert with check (true);
create policy "promises_read" on promises for select using (true);
create policy "promises_insert" on promises for insert with check (true);
create policy "gathering_places_read" on gathering_places for select using (true);
create policy "gathering_interests_read" on gathering_interests for select using (true);
create policy "gathering_interests_insert" on gathering_interests for insert with check (true);
create policy "gathering_interests_delete" on gathering_interests for delete using (true);
create policy "friends_read" on friends for select using (true);
create policy "friends_insert" on friends for insert with check (true);
create policy "memories_read" on memories for select using (approved = true);
create policy "memories_insert" on memories for insert with check (true);
