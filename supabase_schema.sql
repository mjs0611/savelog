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

-- ── users (토스 로그인 연동, 연결 끊기 검증용) ────────────────────────────────
-- toss-login Edge Function이 upsert, toss-unlink Edge Function이 delete (service role)
-- 클라이언트는 연동 유효성 검증(SELECT)만 허용
create table if not exists users (
  user_key bigint primary key
);

alter table users enable row level security;
create policy "Anyone can read users" on users for select using (true);

-- ── chat_messages (실시간 짠톡방 메시지 저장용) ──────────────────────────
create table if not exists chat_messages (
  id         uuid default gen_random_uuid() primary key,
  user_id    text not null,
  nickname   text not null,
  persona    text,
  type       text not null check (type in ('text', 'entry_share')),
  message    text,
  entry_data jsonb,
  room_id    text not null default 'global',
  created_at timestamptz default now()
);

alter table chat_messages enable row level security;
create policy "Anyone can read chat_messages"   on chat_messages for select using (true);
create policy "Anyone can insert chat_messages" on chat_messages for insert with check (true);

-- ── notifications (팔로우/응원 알림) ──────────────────────────────────────
create table if not exists notifications (
  id              uuid default gen_random_uuid() primary key,
  recipient_id    text not null,
  sender_id       text not null,
  sender_nickname text not null,
  type            text not null check (type in ('follow', 'cheer')),
  message         text,
  read            boolean not null default false,
  created_at      timestamptz default now()
);
create index if not exists on notifications (recipient_id, created_at desc);

alter table notifications enable row level security;
create policy "Anyone can read notifications"   on notifications for select using (true);
create policy "Anyone can insert notifications" on notifications for insert with check (true);
create policy "Anyone can update notifications" on notifications for update using (true);

-- ── stories (24시간 만료 인스타식 스토리) ────────────────────────────────
create table if not exists stories (
  id          uuid default gen_random_uuid() primary key,
  user_id     text not null,
  nickname    text not null,
  persona     text,
  text        text,
  image       text,
  bg_gradient text,
  created_at  timestamptz default now()
);
create index if not exists stories_user_id_idx on stories (user_id, created_at desc);
create index if not exists stories_created_at_idx on stories (created_at desc);

alter table stories enable row level security;
create policy "Anyone can read stories"   on stories for select using (true);
create policy "Anyone can insert stories" on stories for insert with check (true);
create policy "Anyone can delete stories" on stories for delete using (true);

-- ── community (블라인드식 글 + 좋아요 + 댓글) ────────────────────────────
-- 카테고리: together(같이 해요), tip(꿀팁), recipe(레시피), daily(일상), question(질문), free(자유)
create table if not exists community_posts (
  id            uuid default gen_random_uuid() primary key,
  user_id       text not null,
  nickname      text not null,
  persona       text,
  category      text not null check (category in ('together', 'tip', 'recipe', 'daily', 'question', 'free')),
  title         text not null,
  content       text not null,
  image         text,
  like_count    integer not null default 0,
  comment_count integer not null default 0,
  created_at    timestamptz default now()
);
create index if not exists community_posts_category_idx on community_posts (category, created_at desc);
create index if not exists community_posts_created_at_idx on community_posts (created_at desc);
create index if not exists community_posts_user_idx on community_posts (user_id, created_at desc);

alter table community_posts enable row level security;
create policy "Anyone can read posts"   on community_posts for select using (true);
create policy "Anyone can insert posts" on community_posts for insert with check (true);
create policy "Anyone can update posts" on community_posts for update using (true);
create policy "Anyone can delete posts" on community_posts for delete using (true);

create table if not exists community_likes (
  id         uuid default gen_random_uuid() primary key,
  post_id    uuid references community_posts(id) on delete cascade,
  user_id    text not null,
  created_at timestamptz default now(),
  unique (post_id, user_id)
);
create index if not exists community_likes_post_idx on community_likes (post_id);
create index if not exists community_likes_user_idx on community_likes (user_id);

alter table community_likes enable row level security;
create policy "Anyone can read likes"   on community_likes for select using (true);
create policy "Anyone can insert likes" on community_likes for insert with check (true);
create policy "Anyone can delete likes" on community_likes for delete using (true);

create table if not exists community_comments (
  id         uuid default gen_random_uuid() primary key,
  post_id    uuid references community_posts(id) on delete cascade,
  user_id    text not null,
  nickname   text not null,
  persona    text,
  content    text not null,
  created_at timestamptz default now()
);
create index if not exists community_comments_post_idx on community_comments (post_id, created_at asc);

alter table community_comments enable row level security;
create policy "Anyone can read comments"   on community_comments for select using (true);
create policy "Anyone can insert comments" on community_comments for insert with check (true);
create policy "Anyone can delete comments" on community_comments for delete using (true);

-- ── duos (머니 듀오: 짝꿍과 펫·목표·스트릭 공동 소유) ─────────────────────────
create table if not exists duos (
  id              text primary key,
  member_a        text not null,
  member_b        text not null,
  nickname_a      text,
  nickname_b      text,
  goal_name       text,
  goal_emoji      text,
  goal_target     int  default 0,
  saved_a         int  default 0,
  saved_b         int  default 0,
  last_record_a   text,
  last_record_b   text,
  streak          int  default 0,
  last_both_date  text,
  status          text default 'active',
  created_at      timestamptz default now(),
  unique (member_a, member_b)
);
create index if not exists idx_duos_member_a on duos (member_a);
create index if not exists idx_duos_member_b on duos (member_b);

alter table duos enable row level security;
create policy "Anyone can read duos"   on duos for select using (true);
create policy "Anyone can insert duos" on duos for insert with check (true);
create policy "Anyone can update duos" on duos for update using (true);
create policy "Anyone can delete duos" on duos for delete using (true);

-- ── interactions (관계 자본 서버화: 두 사람의 교류를 pair 한 행으로 누적) ─────
-- 양쪽이 같은 교류 스트릭을 본다 (스냅챗 스트릭식 상호 책임). id = 정렬된 "aId__bId"
create table if not exists interactions (
  id          text primary key,
  a_id        text not null,
  b_id        text not null,
  a_nick      text,
  b_nick      text,
  count       int  not null default 0,
  streak      int  not null default 0,
  last_date   text,
  last_actor  text,
  created_at  timestamptz default now()
);
create index if not exists idx_interactions_a on interactions (a_id);
create index if not exists idx_interactions_b on interactions (b_id);

alter table interactions enable row level security;
create policy "Anyone can read interactions"   on interactions for select using (true);
create policy "Anyone can insert interactions" on interactions for insert with check (true);
create policy "Anyone can update interactions" on interactions for update using (true);

-- ── weekly_boss (주간 공동 보스 — 전 유저 합동 레이드, 기록=공격) ──────────────
create table if not exists weekly_boss (
  week_key   text primary key,
  boss_name  text not null,
  boss_emoji text,
  max_hp     int not null default 1000,
  hp         int not null default 1000,
  updated_at timestamptz default now()
);
alter table weekly_boss enable row level security;
create policy "Anyone can read weekly_boss"   on weekly_boss for select using (true);
create policy "Anyone can insert weekly_boss" on weekly_boss for insert with check (true);
create policy "Anyone can update weekly_boss" on weekly_boss for update using (true);

-- ── battles (1:1 오늘 하루 덜 쓰기 배틀 — pair당 하루 1판, 다음날 클라 정산) ──
create table if not exists battles (
  id              text primary key, -- 'battle-{date}-{sortedA__B}'
  challenger      text not null,
  opponent        text not null,
  challenger_nick text,
  opponent_nick   text,
  date            text not null,
  created_at      timestamptz default now()
);
create index if not exists idx_battles_date on battles (date);
alter table battles enable row level security;
create policy "Anyone can read battles"   on battles for select using (true);
create policy "Anyone can insert battles" on battles for insert with check (true);
