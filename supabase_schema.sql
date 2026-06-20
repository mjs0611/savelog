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
