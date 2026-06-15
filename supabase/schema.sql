-- $FARM game leaderboard schema
--
-- Run this once in your Supabase project's SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- This creates a public "players" table used for the level/XP
-- leaderboard. Players are identified by their Solana wallet address.
-- Row Level Security is enabled with open policies so the game's
-- publishable (anon) key can read and write scores directly from the
-- browser.
--
-- Because writes come straight from the browser with no server-side
-- session, a malicious user could otherwise call the anon API directly
-- (e.g. from devtools) and upsert an arbitrary xp/balance for any
-- wallet. The constraints and triggers below add a best-effort defense
-- in depth:
--   * new rows must start at level 1 / xp 0 / balance 0
--   * xp and balance can never go negative
--   * level must always match floor(xp / 100) + 1
--   * xp/balance can only increase at a rate consistent with normal
--     play (a few points per second), based on the time since the
--     row was last updated
--   * the wallet (primary key) can never be changed on update

create table if not exists players (
  wallet text primary key check (char_length(wallet) between 32 and 44),
  level integer not null default 1 check (level >= 1),
  xp numeric not null default 0 check (xp >= 0),
  balance numeric not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

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

-- New rows must represent a fresh player (level 1, 0 xp, 0 balance).
-- This stops someone from inserting a maxed-out row for a wallet that
-- hasn't played yet.
create or replace function enforce_player_insert() returns trigger as $$
begin
  if new.level <> 1 or new.xp <> 0 or new.balance <> 0 then
    raise exception 'new players must start at level 1 with 0 xp and 0 balance';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_player_insert on players;
create trigger trg_enforce_player_insert
  before insert on players
  for each row execute function enforce_player_insert();

-- Updates can only raise xp/balance at a rate consistent with normal
-- gathering (roughly 5 points/sec, with a small burst allowance), the
-- wallet can't change, and level must stay derived from xp.
create or replace function enforce_player_update() returns trigger as $$
declare
  elapsed_seconds numeric;
  max_gain numeric;
begin
  if new.wallet <> old.wallet then
    raise exception 'wallet cannot be changed';
  end if;

  elapsed_seconds := greatest(extract(epoch from (now() - old.updated_at)), 0);
  max_gain := elapsed_seconds * 5 + 20;

  if new.xp > old.xp + max_gain then
    raise exception 'xp increase too large for elapsed time';
  end if;

  if new.balance > old.balance + max_gain then
    raise exception 'balance increase too large for elapsed time';
  end if;

  if new.level <> floor(new.xp / 100) + 1 then
    raise exception 'level must equal floor(xp / 100) + 1';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_enforce_player_update on players;
create trigger trg_enforce_player_update
  before update on players
  for each row execute function enforce_player_update();
