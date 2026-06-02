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
