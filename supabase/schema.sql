-- $FARM game leaderboard schema
--
-- Run this once in your Supabase project's SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- This creates a public "players" table used for the level/XP
-- leaderboard. Players are identified by their Solana wallet address.
-- Row Level Security is enabled with open policies so the game's
-- publishable (anon) key can read and write scores directly from the
-- browser — fine for a fun, pre-launch leaderboard.

create table if not exists players (
  wallet text primary key,
  username text,
  level integer not null default 1,
  xp numeric not null default 0,
  balance numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table players add column if not exists username text;

alter table players enable row level security;

drop policy if exists "Public read access" on players;
create policy "Public read access" on players
  for select using (true);

drop policy if exists "Public insert access" on players;
create policy "Public insert access" on players
  for insert with check (true);

drop policy if exists "Public update access" on players;
create policy "Public update access" on players
  for update using (true);
