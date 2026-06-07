-- 짠물일기 Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에서 실행

create table entries (
  id           uuid default gen_random_uuid() primary key,
  user_id      text not null,
  nickname     text not null,
  date         text not null,       -- 'YYYY-MM-DD'
  week_key     text not null,       -- 'YYYY-WXX'
  items        jsonb not null default '[]',
  total_amount integer not null default 0,
  persona      text,
  image        text,
  created_at   timestamptz default now()
);

create table reactions (
  id         uuid default gen_random_uuid() primary key,
  entry_id   uuid references entries(id) on delete cascade,
  user_id    text not null,
  type       text not null check (type in ('trust', 'doubt')),
  created_at timestamptz default now(),
  unique (entry_id, user_id)
);

-- 인덱스
create index on entries (week_key);
create index on entries (user_id, week_key);
create index on entries (created_at desc);
create index on reactions (entry_id);

-- RLS 활성화
alter table entries   enable row level security;
alter table reactions enable row level security;

-- entries 정책
create policy "Anyone can read entries"   on entries for select using (true);
create policy "Anyone can insert entries" on entries for insert with check (true);
create policy "Anyone can update entries" on entries for update using (true);

-- reactions 정책
create policy "Anyone can read reactions"   on reactions for select using (true);
create policy "Anyone can insert reactions" on reactions for insert with check (true);
create policy "Anyone can delete reactions" on reactions for delete using (true);
create policy "Anyone can update reactions" on reactions for update using (true);

-- ── 밸런스 게임 (2025-06 추가) ──────────────────────────────────────────────────
-- entries 테이블에 밸런스 게임 opt-in 컬럼 추가
alter table entries add column if not exists is_balance_game boolean default false;
create index if not exists on entries (is_balance_game) where is_balance_game = true;

-- 밸런스 투표 테이블
create table if not exists balance_votes (
  id         uuid default gen_random_uuid() primary key,
  entry_id   uuid references entries(id) on delete cascade,
  user_id    text not null,
  vote       text not null check (vote in ('over', 'ok')),
  created_at timestamptz default now(),
  unique (entry_id, user_id)
);

create index if not exists on balance_votes (entry_id);

alter table balance_votes enable row level security;
create policy "Anyone can read balance_votes"   on balance_votes for select using (true);
create policy "Anyone can insert balance_votes" on balance_votes for insert with check (true);
create policy "Anyone can update balance_votes" on balance_votes for update using (true);

-- ── 팔로우 (2025-06 추가) ──────────────────────────────────────────────────────
create table if not exists follows (
  id                  uuid default gen_random_uuid() primary key,
  follower_id         text not null,
  followed_id         text not null,
  followed_nickname   text not null,
  created_at          timestamptz default now(),
  unique (follower_id, followed_id)
);

create index if not exists on follows (follower_id);
create index if not exists on follows (followed_id);

alter table follows enable row level security;
create policy "Anyone can read follows"   on follows for select using (true);
create policy "Anyone can insert follows" on follows for insert with check (true);
create policy "Anyone can delete follows" on follows for delete using (true);
