import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL      ?? '';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpendingItem {
  category: string;
  emoji: string;
  amount: number; // 실제 지출액
  comment?: string;
  saved_amount?: number; // 절약(방어) 모드에서 방어한 금액
}

export interface Entry {
  id: string;
  user_id: string;
  nickname: string;
  date: string;
  week_key: string;
  items: SpendingItem[];
  total_amount: number;
  created_at: string;
  persona?: string;
  image?: string;
  is_balance_game?: boolean;
}

export interface BalanceEntry {
  id: string;
  user_id: string;
  nickname: string;
  items: SpendingItem[];
  total_amount: number;
  persona?: string;
  created_at: string;
}

export interface EntryWithReactions extends Entry {
  trust_count: number;
  doubt_count: number;
  my_reaction: 'trust' | 'doubt' | null;
}

export interface WeekRankRow {
  user_id: string;
  nickname: string;
  total: number;
  days: number;
  doubtCount: number; // 이번 주 entries에 달린 '진짜야?' 리액션 합계
  score?: number;     // 하이브리드 절약 점수
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function submitEntry(
  entry: Omit<Entry, 'id' | 'created_at'>,
): Promise<string | null> {
  if (!supabase) {
    console.log('[Supabase] mock submit', entry);
    return 'mock-' + Date.now();
  }
  const { data, error } = await supabase
    .from('entries')
    .insert(entry)
    .select('id')
    .single();
  if (error) { console.error(error); return null; }
  return (data as { id: string }).id;
}

export async function toggleReaction(
  entryId: string,
  userId: string,
  type: 'trust' | 'doubt',
): Promise<void> {
  if (!supabase) return;
  const { data: existing } = await supabase
    .from('reactions')
    .select('id, type')
    .eq('entry_id', entryId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    if ((existing as { type: string }).type === type) {
      await supabase.from('reactions').delete().eq('id', (existing as { id: string }).id);
    } else {
      await supabase
        .from('reactions')
        .update({ type })
        .eq('id', (existing as { id: string }).id);
    }
  } else {
    await supabase.from('reactions').insert({ entry_id: entryId, user_id: userId, type });
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function fetchFeed(userId: string, limit = 30): Promise<EntryWithReactions[] | null> {
  if (!supabase) return buildMockFeed(userId);

  const { data: entries, error } = await supabase
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !entries) return null; // 네트워크 오류 — 기존 피드 유지용 null
  if ((entries as Entry[]).length === 0) return [];

  const ids = (entries as Entry[]).map((e) => e.id);
  const { data: reactions } = await supabase
    .from('reactions')
    .select('entry_id, user_id, type')
    .in('entry_id', ids);

  const rxList = (reactions ?? []) as { entry_id: string; user_id: string; type: string }[];

  return (entries as Entry[]).map((e) => {
    const rx = rxList.filter((r) => r.entry_id === e.id);
    const mine = rx.find((r) => r.user_id === userId);
    return {
      ...e,
      trust_count: rx.filter((r) => r.type === 'trust').length,
      doubt_count: rx.filter((r) => r.type === 'doubt').length,
      my_reaction: mine ? (mine.type as 'trust' | 'doubt') : null,
    };
  });
}

export async function fetchWeekRank(weekKey: string): Promise<WeekRankRow[] | null> {
  if (!supabase) return MOCK_RANK;

  const { data, error } = await supabase
    .from('entries')
    .select('id, user_id, nickname, total_amount, date')
    .eq('week_key', weekKey);
  if (error || !data) return null; // 네트워크 오류 — null로 구분

  const typedData = data as { id: string; user_id: string; nickname: string; total_amount: number; date: string }[];

  const map = new Map<string, { user_id: string; nickname: string; total: number; dateSet: Set<string>; latestDate: string; earliestDate: string; entryIds: string[] }>();
  for (const row of typedData) {
    const prev = map.get(row.user_id) ?? { user_id: row.user_id, nickname: row.nickname, total: 0, dateSet: new Set<string>(), latestDate: '', earliestDate: row.date, entryIds: [] };
    prev.dateSet.add(row.date);
    prev.total += row.total_amount;
    prev.entryIds.push(row.id);
    // 가장 최신 날짜 기록의 닉네임을 사용 (주중 닉네임 변경 반영)
    if (row.date > prev.latestDate) {
      prev.nickname = row.nickname;
      prev.latestDate = row.date;
    }
    // 이번 주 첫 기록일 추적 (세 번째 정렬 기준용)
    if (row.date < prev.earliestDate) {
      prev.earliestDate = row.date;
    }
    map.set(row.user_id, prev);
  }

  // '진짜야?' 리액션 집계 — 허위 무지출 감지에 활용
  const allEntryIds = typedData.map((r) => r.id);
  const doubtByUser = new Map<string, number>();
  if (allEntryIds.length > 0) {
    // entry_id → user_id 역매핑을 Map으로 미리 인덱싱 (O(n) → find 루프 제거)
    const entryUserMap = new Map<string, string>(typedData.map((e) => [e.id, e.user_id]));
    const { data: rxData } = await supabase
      .from('reactions')
      .select('entry_id, type')
      .in('entry_id', allEntryIds)
      .eq('type', 'doubt');
    if (rxData) {
      for (const rx of rxData as { entry_id: string; type: string }[]) {
        const userId = entryUserMap.get(rx.entry_id);
        if (userId) {
          doubtByUser.set(userId, (doubtByUser.get(userId) ?? 0) + 1);
        }
      }
    }
  }

  return Array.from(map.values())
    .map(({ dateSet, latestDate: _ld, earliestDate, entryIds: _ids, ...rest }) => {
      const days = dateSet.size;
      const recordScore = days * 800;
      const budgetRatio = Math.max(0, 100000 - rest.total) / 100000;
      const savingScore = Math.round(budgetRatio * 4400);
      const score = recordScore + savingScore;
      return {
        ...rest,
        days,
        earliestDate,
        doubtCount: doubtByUser.get(rest.user_id) ?? 0,
        score
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.earliestDate < b.earliestDate ? -1 : a.earliestDate > b.earliestDate ? 1 : 0;
    })
    .map(({ earliestDate: _ed, ...row }) => row);
}

export async function fetchBalanceGameEntry(userId: string): Promise<BalanceEntry | null> {
  if (!supabase) {
    // mock: 목업 피드에서 지출이 있는 항목 하나 반환
    const mock = buildMockFeed(userId).find(e => e.total_amount > 0 && e.user_id !== userId);
    if (!mock) return null;
    return { id: mock.id, user_id: mock.user_id, nickname: mock.nickname, items: mock.items, total_amount: mock.total_amount, persona: mock.persona, created_at: mock.created_at };
  }

  // 이미 투표한 entry_id 목록
  const { data: voted } = await supabase
    .from('balance_votes')
    .select('entry_id')
    .eq('user_id', userId);
  const votedIds = new Set((voted ?? []).map((v: { entry_id: string }) => v.entry_id));

  const { data, error } = await supabase
    .from('entries')
    .select('id, user_id, nickname, items, total_amount, persona, created_at')
    .eq('is_balance_game', true)
    .neq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error || !data || data.length === 0) return null;

  const unvoted = (data as BalanceEntry[]).filter(e => !votedIds.has(e.id));
  if (unvoted.length === 0) return null;

  return unvoted[Math.floor(Math.random() * unvoted.length)];
}

export async function submitBalanceVote(
  entryId: string,
  userId: string,
  vote: 'over' | 'ok',
): Promise<{ over: number; ok: number }> {
  if (!supabase) {
    const overPct = 55 + Math.floor(Math.random() * 30);
    return { over: overPct, ok: 100 - overPct };
  }

  await supabase
    .from('balance_votes')
    .upsert({ entry_id: entryId, user_id: userId, vote }, { onConflict: 'entry_id,user_id' });

  const { data } = await supabase
    .from('balance_votes')
    .select('vote')
    .eq('entry_id', entryId);

  const votes = (data ?? []) as { vote: string }[];
  const total = votes.length;
  if (total === 0) return { over: 50, ok: 50 };
  const overCount = votes.filter(v => v.vote === 'over').length;
  const overPct = Math.round((overCount / total) * 100);
  return { over: overPct, ok: 100 - overPct };
}

// ── Follow ────────────────────────────────────────────────────────────────────

export async function fetchFollows(userId: string): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('follows')
    .select('followed_id, followed_nickname')
    .eq('follower_id', userId);
  if (error || !data) return {};
  return Object.fromEntries(
    (data as { followed_id: string; followed_nickname: string }[]).map(r => [r.followed_id, r.followed_nickname])
  );
}

// 결과: { following, error } — error가 있으면 호출측에서 롤백 + 토스트 처리
export async function toggleFollowSupabase(
  followerId: string,
  followedId: string,
  followedNickname: string,
  followerNickname?: string,
): Promise<{ following: boolean; error?: string }> {
  if (!supabase) return { following: false, error: 'supabase 미설정' };
  const { data: existing, error: selErr } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('followed_id', followedId)
    .maybeSingle();
  if (selErr) {
    console.error('[follow] select error', selErr);
    return { following: false, error: selErr.message };
  }

  if (existing) {
    const { error: delErr } = await supabase.from('follows').delete().eq('id', (existing as { id: string }).id);
    if (delErr) {
      console.error('[follow] delete error', delErr);
      return { following: true, error: delErr.message }; // 기존 상태 유지
    }
    return { following: false };
  } else {
    const { error: insErr } = await supabase
      .from('follows')
      .insert({ follower_id: followerId, followed_id: followedId, followed_nickname: followedNickname });
    if (insErr) {
      console.error('[follow] insert error', insErr);
      return { following: false, error: insErr.message };
    }
    // 팔로우 시 상대방에게 알림 전송 (best-effort)
    sendFollowNotification(followerId, followedId, followerNickname || '익명').catch(() => {});
    return { following: true };
  }
}

// ── Notifications ─────────────────────────────────────────────────────────────
// follow / cheer 알림. recipient_id 기준 SELECT, 본인 알림만 읽음 처리.
export interface NotificationRow {
  id: string;
  recipient_id: string;
  sender_id: string;
  sender_nickname: string;
  type: 'follow' | 'cheer';
  message?: string;
  read: boolean;
  created_at: string;
}

export async function sendFollowNotification(
  senderId: string,
  recipientId: string,
  senderNickname: string,
): Promise<void> {
  if (!supabase) return;
  await supabase.from('notifications').insert({
    recipient_id: recipientId,
    sender_id: senderId,
    sender_nickname: senderNickname,
    type: 'follow',
  });
}

export async function fetchMyNotifications(userId: string, limit = 30): Promise<NotificationRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as NotificationRow[];
}

export async function markNotificationsRead(userId: string): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('recipient_id', userId)
    .eq('read', false);
}

// ── 사용자 검색 (피드 entries 기준 닉네임 매칭) ─────────────────────────────
export interface SearchUser {
  user_id: string;
  nickname: string;
  persona: string | null;
}

export async function searchUsers(query: string, currentUserId: string, limit = 20): Promise<SearchUser[]> {
  if (!supabase) return [];
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  // entries 테이블에서 닉네임으로 유저 검색 (entries가 사용자별 닉네임 기록 보유)
  const { data, error } = await supabase
    .from('entries')
    .select('user_id, nickname, persona, created_at')
    .ilike('nickname', `%${trimmed}%`)
    .neq('user_id', currentUserId)
    .order('created_at', { ascending: false })
    .limit(limit * 4);
  if (error || !data) return [];

  // 동일 user_id 중복 제거 (최신 entry 기준 닉네임/페르소나)
  const seen = new Map<string, SearchUser>();
  for (const row of data as { user_id: string; nickname: string; persona?: string }[]) {
    if (!seen.has(row.user_id)) {
      seen.set(row.user_id, { user_id: row.user_id, nickname: row.nickname, persona: row.persona ?? null });
    }
  }
  return Array.from(seen.values()).slice(0, limit);
}

export async function fetchFollowedPersonas(followedIds: string[]): Promise<Record<string, string>> {
  if (!supabase || followedIds.length === 0) return {};
  const { data, error } = await supabase
    .from('entries')
    .select('user_id, persona, created_at')
    .in('user_id', followedIds)
    .order('created_at', { ascending: false });
  if (error || !data) return {};

  const personas: Record<string, string> = {};
  for (const entry of data as { user_id: string; persona?: string }[]) {
    if (entry.persona && !personas[entry.user_id]) {
      personas[entry.user_id] = entry.persona;
    }
  }
  return personas;
}

export async function fetchMyWeekEntries(userId: string, weekKey: string): Promise<Entry[] | null> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .eq('week_key', weekKey)
    .order('date', { ascending: false });
  if (error || !data) return null; // null = 네트워크 오류, []와 구분
  return data as Entry[];
}

export async function fetchMyAllEntries(userId: string): Promise<Entry[] | null> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .not('week_key', 'like', 'social-%')
    .not('week_key', 'like', 'milestone-%')
    .order('date', { ascending: false })
    .limit(200);
  if (error || !data) return null;
  return data as Entry[];
}

// 갤러리용 — image가 있는 모든 내 entries (social/milestone 포함)
export async function fetchMyImageEntries(userId: string): Promise<Entry[] | null> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('user_id', userId)
    .not('image', 'is', null)
    .order('date', { ascending: false })
    .limit(200);
  if (error || !data) return null;
  return data as Entry[];
}

// ── Mock data (Supabase 미설정 시 개발용) ──────────────────────────────────────

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildMockFeed(_userId: string): EntryWithReactions[] {
  const today = localDateStr(new Date());
  const yesterday = localDateStr(new Date(Date.now() - 86400000));
  return [
    {
      id: 'mock-1', user_id: 'mock-a', nickname: '잔잔한민지',
      date: today,
      week_key: 'mock', items: [
        { category: '식비', emoji: '🍚', amount: 0, comment: '회사 도시락 싸옴' },
        { category: '교통', emoji: '🚇', amount: 0, comment: '자전거 출근' },
        { category: '카페', emoji: '☕', amount: 2300, comment: '참을 수 없었음...' },
      ],
      total_amount: 2300, created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      trust_count: 142, doubt_count: 3,
      my_reaction: null,
      persona: 'keeper',
      image: undefined,
    },
    {
      id: 'mock-2', user_id: 'mock-b', nickname: '든든길동',
      date: today,
      week_key: 'mock', items: [
        { category: '식비', emoji: '🍚', amount: 3500, comment: '편의점 삼각김밥 2개' },
        { category: '교통', emoji: '🚇', amount: 1400, comment: '버스' },
      ],
      total_amount: 4900, created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      trust_count: 87, doubt_count: 1, my_reaction: null,
      persona: 'hamster',
      image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80',
    },
    {
      id: 'mock-3', user_id: 'mock-c', nickname: '한줄러',
      date: yesterday,
      week_key: 'mock', items: [
        { category: '식비', emoji: '🍚', amount: 0, comment: '냉장고 털기 성공' },
        { category: '교통', emoji: '🚇', amount: 0, comment: '재택근무' },
        { category: '기타', emoji: '📦', amount: 0, comment: '인터넷 쇼핑 장바구니만 채움 ㅠ' },
      ],
      total_amount: 0, created_at: new Date(Date.now() - 86400000).toISOString(),
      trust_count: 201, doubt_count: 45, my_reaction: null,
      persona: 'cost_ai',
      image: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80',
    },
  ];
}

const MOCK_RANK: WeekRankRow[] = [
  { user_id: 'mock-c', nickname: '한줄러', total: 0, days: 5, doubtCount: 0, score: 8400 },
  { user_id: 'mock-a', nickname: '잔잔한민지', total: 11500, days: 5, doubtCount: 0, score: 7894 },
  { user_id: 'mock-b', nickname: '든든길동', total: 24500, days: 4, doubtCount: 0, score: 6522 },
];

// ── Stories (24시간 만료 인스타식) ────────────────────────────────────────────
export interface StoryRow {
  id: string;
  user_id: string;
  nickname: string;
  persona: string | null;
  text: string | null;
  image: string | null;
  bg_gradient: string | null;
  created_at: string;
}

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

// 피드용: 24시간 이내 모든 스토리 (본인 + 친구)
export async function fetchActiveStories(): Promise<StoryRow[]> {
  if (!supabase) return [];
  const cutoff = new Date(Date.now() - STORY_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as StoryRow[];
}

// 마이로그 보관함용: 본인이 올린 모든 스토리 (만료 무관)
export async function fetchMyStories(userId: string): Promise<StoryRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('stories')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as StoryRow[];
}

export async function createStory(input: {
  user_id: string;
  nickname: string;
  persona?: string | null;
  text?: string | null;
  image?: string | null;
  bg_gradient?: string | null;
}): Promise<StoryRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('stories')
    .insert({
      user_id: input.user_id,
      nickname: input.nickname,
      persona: input.persona ?? null,
      text: input.text ?? null,
      image: input.image ?? null,
      bg_gradient: input.bg_gradient ?? null,
    })
    .select('*')
    .single();
  if (error || !data) return null;
  return data as StoryRow;
}

export async function deleteStory(storyId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('stories').delete().eq('id', storyId);
  return !error;
}

// ── Community (블라인드식 게시판) ──────────────────────────────────────────
export type CommunityCategory = 'tip' | 'recipe' | 'together' | 'daily' | 'question' | 'free';

export interface CommunityPost {
  id: string;
  user_id: string;
  nickname: string;
  persona: string | null;
  category: CommunityCategory;
  title: string;
  content: string;
  image: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
}

export interface CommunityPostWithMyLike extends CommunityPost {
  liked_by_me: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string;
  nickname: string;
  persona: string | null;
  content: string;
  created_at: string;
}

export async function fetchCommunityPosts(
  category: CommunityCategory | 'all',
  userId: string,
  limit = 30,
): Promise<CommunityPostWithMyLike[] | null> {
  if (!supabase) return [];
  let query = supabase
    .from('community_posts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (category !== 'all') query = query.eq('category', category);
  const { data: posts, error } = await query;
  if (error || !posts) return null;
  if ((posts as CommunityPost[]).length === 0) return [];

  const ids = (posts as CommunityPost[]).map(p => p.id);
  const { data: myLikes } = await supabase
    .from('community_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', ids);
  const likedSet = new Set((myLikes ?? []).map((l: { post_id: string }) => l.post_id));
  return (posts as CommunityPost[]).map(p => ({ ...p, liked_by_me: likedSet.has(p.id) }));
}

export async function createCommunityPost(input: {
  user_id: string;
  nickname: string;
  persona?: string | null;
  category: CommunityCategory;
  title: string;
  content: string;
  image?: string | null;
}): Promise<CommunityPost | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      user_id: input.user_id,
      nickname: input.nickname,
      persona: input.persona ?? null,
      category: input.category,
      title: input.title,
      content: input.content,
      image: input.image ?? null,
    })
    .select('*')
    .single();
  if (error || !data) return null;
  return data as CommunityPost;
}

export async function deleteCommunityPost(postId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('community_posts').delete().eq('id', postId);
  return !error;
}

// 좋아요 토글 — 결과 like_count 반환 (낙관적 UI는 호출측에서)
export async function toggleCommunityLike(
  postId: string,
  userId: string,
): Promise<{ liked: boolean; like_count: number } | null> {
  if (!supabase) return null;
  const { data: existing } = await supabase
    .from('community_likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle();

  // 현재 like_count 조회
  const { data: postRow } = await supabase
    .from('community_posts')
    .select('like_count')
    .eq('id', postId)
    .maybeSingle();
  const current = (postRow as { like_count: number } | null)?.like_count ?? 0;

  if (existing) {
    const { error: delErr } = await supabase.from('community_likes').delete().eq('id', (existing as { id: string }).id);
    if (delErr) return null;
    const next = Math.max(0, current - 1);
    await supabase.from('community_posts').update({ like_count: next }).eq('id', postId);
    return { liked: false, like_count: next };
  } else {
    const { error: insErr } = await supabase.from('community_likes').insert({ post_id: postId, user_id: userId });
    if (insErr) return null;
    const next = current + 1;
    await supabase.from('community_posts').update({ like_count: next }).eq('id', postId);
    return { liked: true, like_count: next };
  }
}

export async function fetchCommunityComments(postId: string): Promise<CommunityComment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('community_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return data as CommunityComment[];
}

export async function addCommunityComment(input: {
  post_id: string;
  user_id: string;
  nickname: string;
  persona?: string | null;
  content: string;
}): Promise<CommunityComment | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('community_comments')
    .insert({
      post_id: input.post_id,
      user_id: input.user_id,
      nickname: input.nickname,
      persona: input.persona ?? null,
      content: input.content,
    })
    .select('*')
    .single();
  if (error || !data) return null;
  // comment_count 증가
  const { data: postRow } = await supabase
    .from('community_posts')
    .select('comment_count')
    .eq('id', input.post_id)
    .maybeSingle();
  const current = (postRow as { comment_count: number } | null)?.comment_count ?? 0;
  await supabase.from('community_posts').update({ comment_count: current + 1 }).eq('id', input.post_id);
  return data as CommunityComment;
}

export async function deleteCommunityComment(commentId: string, postId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('community_comments').delete().eq('id', commentId);
  if (error) return false;
  const { data: postRow } = await supabase
    .from('community_posts')
    .select('comment_count')
    .eq('id', postId)
    .maybeSingle();
  const current = (postRow as { comment_count: number } | null)?.comment_count ?? 0;
  await supabase.from('community_posts').update({ comment_count: Math.max(0, current - 1) }).eq('id', postId);
  return true;
}

// ── Toss 연동 상태 검증 ────────────────────────────────────────────────────────
// users 테이블에 user_key가 존재하는지 확인 (연결 끊기 후 재진입 방지)
export async function verifyUserLinked(userKey: string): Promise<boolean> {
  if (!supabase) return true;
  const numericKey = Number(userKey);
  // 숫자가 아닌 key(익명 hash)는 검증 대상 아님
  if (isNaN(numericKey) || numericKey === 0) return true;
  const { data } = await supabase
    .from('users')
    .select('user_key')
    .eq('user_key', numericKey)
    .maybeSingle();
  return data !== null;
}
