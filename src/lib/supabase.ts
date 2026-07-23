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
  // 거지방 스탬프 — reactions 테이블에 type='stamp:{key}' 행으로 저장 (리액션과 별도 1인 1개)
  stamp_counts: Record<string, number>;
  my_stamp: string | null; // stamp key (예: 'nope')
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
  // 스탬프 행(type='stamp:*')과 별개로 관리 — 반드시 trust/doubt만 조회 (스탬프 병존 시 maybeSingle 다중행 오류 방지)
  const { data: existing } = await supabase
    .from('reactions')
    .select('id, type')
    .eq('entry_id', entryId)
    .eq('user_id', userId)
    .in('type', ['trust', 'doubt'])
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

// 거지방 스탬프 토글 — 1인 1글 1스탬프 (같은 스탬프 다시 누르면 취소, 다른 스탬프면 교체)
export async function toggleStamp(entryId: string, userId: string, stampKey: string): Promise<void> {
  if (!supabase) return;
  const type = `stamp:${stampKey}`;
  const { data: existing } = await supabase
    .from('reactions')
    .select('id, type')
    .eq('entry_id', entryId)
    .eq('user_id', userId)
    .like('type', 'stamp:%')
    .maybeSingle();

  if (existing) {
    if ((existing as { type: string }).type === type) {
      await supabase.from('reactions').delete().eq('id', (existing as { id: string }).id);
    } else {
      await supabase.from('reactions').update({ type }).eq('id', (existing as { id: string }).id);
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
    const plain = rx.filter((r) => !r.type.startsWith('stamp:'));
    const stamps = rx.filter((r) => r.type.startsWith('stamp:'));
    const mine = plain.find((r) => r.user_id === userId);
    const myStampRow = stamps.find((r) => r.user_id === userId);
    const stamp_counts: Record<string, number> = {};
    for (const s of stamps) {
      const key = s.type.slice(6);
      stamp_counts[key] = (stamp_counts[key] ?? 0) + 1;
    }
    return {
      ...e,
      trust_count: plain.filter((r) => r.type === 'trust').length,
      doubt_count: plain.filter((r) => r.type === 'doubt').length,
      my_reaction: mine ? (mine.type as 'trust' | 'doubt') : null,
      stamp_counts,
      my_stamp: myStampRow ? myStampRow.type.slice(6) : null,
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

// 여러 소비 고민 글의 실제 투표 집계를 한 번에 조회 (seed 가짜값 대체용)
export async function fetchDilemmaVoteCounts(
  entryIds: string[],
): Promise<Record<string, { over: number; ok: number; total: number }>> {
  if (!supabase || entryIds.length === 0) return {};
  const { data, error } = await supabase
    .from('balance_votes')
    .select('entry_id, vote')
    .in('entry_id', entryIds);
  if (error || !data) return {};
  const result: Record<string, { over: number; ok: number; total: number }> = {};
  for (const row of data as { entry_id: string; vote: string }[]) {
    const r = result[row.entry_id] ?? { over: 0, ok: 0, total: 0 };
    if (row.vote === 'over') r.over += 1; else if (row.vote === 'ok') r.ok += 1;
    r.total += 1;
    result[row.entry_id] = r;
  }
  return result;
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

// 받은 평판 정체성 — 남들이 내 글에 준 '짠내 인정(trust)' 누적. 사회적으로 구성된 정체성.
export async function fetchReceivedReputation(userId: string): Promise<{ trust: number; doubt: number }> {
  if (!supabase) return { trust: 0, doubt: 0 };
  const { data: ents } = await supabase.from('entries').select('id').eq('user_id', userId);
  const ids = (ents ?? []).map((e: { id: string }) => e.id);
  if (ids.length === 0) return { trust: 0, doubt: 0 };
  const { data: rx } = await supabase.from('reactions').select('type').in('entry_id', ids);
  const list = (rx ?? []) as { type: string }[];
  return {
    trust: list.filter(r => r.type === 'trust').length,
    doubt: list.filter(r => r.type === 'doubt').length,
  };
}

// 나를 팔로우하는 사람들의 id (상호 짝꿍 도출용). 닉네임은 내가 팔로우하는 쪽(fetchFollows)에서 채운다.
export async function fetchFollowerIds(userId: string): Promise<string[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('follows')
    .select('follower_id')
    .eq('followed_id', userId);
  if (error || !data) return [];
  return (data as { follower_id: string }[]).map(r => r.follower_id);
}

// 친구의 친구 추천 (삼각 폐쇄 — 그래프 densify의 핵심). 내 짠친들이 팔로우하는 사람을 빈도순으로.
export interface FofCandidate { id: string; nickname: string; count: number; viaId: string; }
export async function fetchFriendsOfFriends(userId: string, myFollowedIds: string[]): Promise<FofCandidate[]> {
  if (!supabase || myFollowedIds.length === 0) return [];
  const { data, error } = await supabase
    .from('follows')
    .select('followed_id, followed_nickname, follower_id')
    .in('follower_id', myFollowedIds);
  if (error || !data) return [];
  const followedSet = new Set(myFollowedIds);
  const agg: Record<string, { nickname: string; count: number; viaId: string }> = {};
  for (const r of data as { followed_id: string; followed_nickname: string; follower_id: string }[]) {
    if (r.followed_id === userId || followedSet.has(r.followed_id)) continue; // 나 + 이미 팔로우 제외
    if (!agg[r.followed_id]) agg[r.followed_id] = { nickname: r.followed_nickname, count: 0, viaId: r.follower_id };
    agg[r.followed_id].count += 1;
  }
  return Object.entries(agg)
    .map(([id, v]) => ({ id, nickname: v.nickname, count: v.count, viaId: v.viaId }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// 나를 팔로우하는 사람들을 닉네임과 함께 (맞팔 추천용). 닉네임은 entries에서 최신 조회.
export async function fetchFollowersWithNickname(userId: string): Promise<{ id: string; nickname: string }[]> {
  const ids = await fetchFollowerIds(userId);
  if (ids.length === 0) return [];
  if (!supabase) return ids.map(id => ({ id, nickname: '짠친' }));
  const { data } = await supabase
    .from('entries')
    .select('user_id, nickname, created_at')
    .in('user_id', ids)
    .order('created_at', { ascending: false });
  const nickMap: Record<string, string> = {};
  for (const e of (data ?? []) as { user_id: string; nickname: string }[]) {
    if (!nickMap[e.user_id]) nickMap[e.user_id] = e.nickname;
  }
  return ids.map(id => ({ id, nickname: nickMap[id] || '짠친' }));
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

// ── 머니 듀오 (짝꿍과 펫·목표·스트릭 공동 소유) ──────────────────────────────
export interface Duo {
  id: string;
  member_a: string; member_b: string;
  nickname_a: string | null; nickname_b: string | null;
  goal_name: string | null; goal_emoji: string | null; goal_target: number;
  saved_a: number; saved_b: number;
  last_record_a: string | null; last_record_b: string | null;
  streak: number; last_both_date: string | null;
  status: string;
}

function duoYesterday(today: string): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 내 활성 듀오 (member_a 또는 member_b가 나). 1인 1듀오.
export async function fetchMyDuo(userId: string): Promise<Duo | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('duos')
    .select('*')
    .or(`member_a.eq.${userId},member_b.eq.${userId}`)
    .eq('status', 'active')
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as Duo;
}

// 짝꿍과 머니 듀오 맺기 (이미 있으면 기존 반환). 상호 짝꿍 전제라 즉시 active.
export async function createDuo(me: string, meNick: string, buddyId: string, buddyNick: string): Promise<Duo | null> {
  if (!supabase) return null;
  const existing = await fetchMyDuo(me);
  if (existing) return existing;
  const id = `duo-${Date.now()}`;
  const { data, error } = await supabase
    .from('duos')
    .insert({ id, member_a: me, member_b: buddyId, nickname_a: meNick, nickname_b: buddyNick, status: 'active' })
    .select()
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return data[0] as Duo;
}

// 오늘 안 쓴 돈을 듀오 공동 목표에 기여 + 공동 스트릭 갱신 (기록 시 호출, 하루 첫 기록만)
export async function contributeToDuo(userId: string, savedAmount: number, today: string): Promise<void> {
  if (!supabase || savedAmount < 0) return;
  const duo = await fetchMyDuo(userId);
  if (!duo) return;
  const isA = duo.member_a === userId;
  const otherLast = isA ? duo.last_record_b : duo.last_record_a;
  const update: Record<string, unknown> = {};
  update[isA ? 'saved_a' : 'saved_b'] = (isA ? duo.saved_a : duo.saved_b) + savedAmount;
  update[isA ? 'last_record_a' : 'last_record_b'] = today;
  // 둘 다 오늘 기록 → 공동 스트릭 (하루 1회만 증가)
  if (otherLast === today && duo.last_both_date !== today) {
    update.streak = duo.last_both_date === duoYesterday(today) ? duo.streak + 1 : 1;
    update.last_both_date = today;
  }
  await supabase.from('duos').update(update).eq('id', duo.id);
}

export async function setDuoGoal(duoId: string, name: string, emoji: string, target: number): Promise<void> {
  if (!supabase) return;
  await supabase.from('duos').update({ goal_name: name, goal_emoji: emoji, goal_target: target }).eq('id', duoId);
}

export async function leaveDuo(duoId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('duos').delete().eq('id', duoId);
}

// ── 초대 자동 맞팔 ────────────────────────────────────────────────────────────
// 초대 링크로 맺어진 두 사람을 서로 팔로우(=짝꿍) 처리. 이미 팔로우 중이면 건너뜀.
export async function ensureMutualFollow(meId: string, meNick: string, otherId: string, otherNick: string): Promise<boolean> {
  if (!supabase || !meId || !otherId || meId === otherId) return false;
  const ensure = async (followerId: string, followedId: string, followedNickname: string) => {
    const { data } = await supabase!
      .from('follows')
      .select('id')
      .eq('follower_id', followerId)
      .eq('followed_id', followedId)
      .maybeSingle();
    if (!data) {
      await supabase!.from('follows').insert({ follower_id: followerId, followed_id: followedId, followed_nickname: followedNickname });
    }
  };
  try {
    await Promise.all([ensure(meId, otherId, otherNick), ensure(otherId, meId, meNick)]);
    return true;
  } catch {
    return false;
  }
}

// ── 관계 자본 서버화 (interactions) ──────────────────────────────────────────
// 두 사람의 교류(리액션·투표·응원)를 pair 단위 한 행으로 누적 — 양쪽이 같은 스트릭을 본다.
// 테이블 미적용 환경에서는 조용히 실패하고 localStorage(relations.ts) 동작만 유지된다.
export interface ServerRelation {
  userId: string;   // 상대방
  nickname: string; // 상대방 닉네임
  count: number;
  streak: number;
  lastDate: string;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join('__');
}

function interactionYesterday(today: string): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function recordInteractionServer(meId: string, meNick: string, otherId: string, otherNick: string, today: string): Promise<void> {
  if (!supabase || !meId || !otherId || meId === otherId) return;
  try {
    const id = pairKey(meId, otherId);
    const [aId, bId] = [meId, otherId].sort();
    const { data } = await supabase.from('interactions').select('*').eq('id', id).maybeSingle();
    if (!data) {
      await supabase.from('interactions').insert({
        id, a_id: aId, b_id: bId,
        a_nick: aId === meId ? meNick : otherNick,
        b_nick: bId === meId ? meNick : otherNick,
        count: 1, streak: 1, last_date: today, last_actor: meId,
      });
      return;
    }
    const row = data as { count: number; streak: number; last_date: string | null };
    const update: Record<string, unknown> = {
      count: (row.count || 0) + 1,
      last_actor: meId,
      // 닉네임 최신화
      [aId === meId ? 'a_nick' : 'b_nick']: meNick,
      [aId === otherId ? 'a_nick' : 'b_nick']: otherNick,
    };
    if (row.last_date !== today) {
      update.streak = row.last_date === interactionYesterday(today) ? (row.streak || 0) + 1 : 1;
      update.last_date = today;
    }
    await supabase.from('interactions').update(update).eq('id', id);
  } catch { /* 테이블 미적용/네트워크 오류 — 로컬 관계 자본만 유지 */ }
}

export async function fetchMyInteractions(meId: string): Promise<ServerRelation[]> {
  if (!supabase || !meId) return [];
  try {
    const { data, error } = await supabase
      .from('interactions')
      .select('*')
      .or(`a_id.eq.${meId},b_id.eq.${meId}`)
      .order('count', { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return (data as any[]).map(r => {
      const otherIsA = r.b_id === meId;
      return {
        userId: otherIsA ? r.a_id : r.b_id,
        nickname: (otherIsA ? r.a_nick : r.b_nick) || '짠친',
        count: r.count || 0,
        streak: r.streak || 0,
        lastDate: r.last_date || '',
      };
    });
  } catch {
    return [];
  }
}

// ── 🐲 주간 공동 보스 — 전 유저 합동 레이드 (테이블 미적용 시 null 반환·UI 숨김) ──
export interface WeeklyBoss {
  week_key: string;
  boss_name: string;
  boss_emoji: string;
  max_hp: number;
  hp: number;
}

const WEEKLY_BOSSES = [
  { name: '과소비 대마왕 플렉스곤', emoji: '🐲' },
  { name: '배달비 흡혈귀 딜리버리아', emoji: '🧛' },
  { name: '충동구매 유령 지름신', emoji: '👻' },
  { name: '구독료 문어 서브스크립토', emoji: '🐙' },
];

// bossKey: 전역이면 weekKey, 서클 단위면 `${weekKey}__c__${circleId}` (같은 테이블 재사용)
export async function fetchOrCreateWeeklyBoss(bossKey: string, maxHp = 1000): Promise<WeeklyBoss | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.from('weekly_boss').select('*').eq('week_key', bossKey).maybeSingle();
    if (data) return data as WeeklyBoss;
    // 키 결정론적 보스 선택 — 어떤 클라이언트가 먼저 만들어도 같은 보스
    const hash = bossKey.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    const boss = WEEKLY_BOSSES[Math.abs(hash) % WEEKLY_BOSSES.length];
    const row = { week_key: bossKey, boss_name: boss.name, boss_emoji: boss.emoji, max_hp: maxHp, hp: maxHp };
    const { data: created, error } = await supabase.from('weekly_boss').insert(row).select('*').single();
    if (error) {
      // 동시 생성 경합(pk 충돌) — 재조회
      const { data: again } = await supabase.from('weekly_boss').select('*').eq('week_key', bossKey).maybeSingle();
      return (again as WeeklyBoss) ?? null;
    }
    return created as WeeklyBoss;
  } catch {
    return null;
  }
}

export async function attackWeeklyBoss(weekKey: string, damage: number): Promise<WeeklyBoss | null> {
  if (!supabase) return null;
  try {
    const boss = await fetchOrCreateWeeklyBoss(weekKey);
    if (!boss || boss.hp <= 0) return boss;
    const newHp = Math.max(0, boss.hp - damage);
    await supabase.from('weekly_boss').update({ hp: newHp, updated_at: new Date().toISOString() }).eq('week_key', weekKey);
    return { ...boss, hp: newHp };
  } catch {
    return null;
  }
}

// ── ⚔️ 1:1 오늘 배틀 — 듀오 짝꿍과 하루 덜 쓰기 대결 (pair당 하루 1판) ──────────
export interface Battle {
  id: string;
  challenger: string;
  opponent: string;
  challenger_nick: string | null;
  opponent_nick: string | null;
  date: string;
}

export async function createBattle(challenger: string, challengerNick: string, opponent: string, opponentNick: string, date: string): Promise<Battle | null> {
  if (!supabase) return null;
  const id = `battle-${date}-${[challenger, opponent].sort().join('__')}`;
  try {
    const { data, error } = await supabase
      .from('battles')
      .insert({ id, challenger, opponent, challenger_nick: challengerNick, opponent_nick: opponentNick, date })
      .select('*')
      .single();
    if (error) return null; // 이미 오늘 배틀 존재(pk 충돌) 또는 테이블 미적용
    return data as Battle;
  } catch {
    return null;
  }
}

export async function fetchMyBattle(userId: string, date: string): Promise<Battle | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from('battles')
      .select('*')
      .eq('date', date)
      .or(`challenger.eq.${userId},opponent.eq.${userId}`)
      .limit(1);
    return (data && data[0]) ? (data[0] as Battle) : null;
  } catch {
    return null;
  }
}

// ── 🔒 짠 서클 — 3~8명 초대제 닫힌 방 (제품의 기본 소셜 단위) ─────────────────
// 서클 = 사람 필터(누구의 글을 보고 누가 판정하는가). 글 자체는 공개(발견 탭) — v1은 주의 배분, 접근 제어 아님.
export interface Circle {
  id: string;
  name: string;
  emoji: string | null;
  owner_id: string;
  invite_code: string;
  is_open: boolean;
  season_week: string | null;
}
export interface CircleMember {
  user_id: string;
  nickname: string | null;
}
export interface MyCircle {
  circle: Circle;
  members: CircleMember[];
}
export const CIRCLE_MAX_MEMBERS = 8;
export const OPEN_CIRCLE_MAX = 5;

function genInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 혼동 문자(I/L/O/0/1) 제외
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function fetchMyCircle(userId: string): Promise<MyCircle | null> {
  if (!supabase || !userId) return null;
  try {
    const { data: mem } = await supabase.from('circle_members').select('circle_id').eq('user_id', userId).limit(1);
    if (!mem || mem.length === 0) return null;
    const circleId = (mem[0] as { circle_id: string }).circle_id;
    const [{ data: c }, { data: ms }] = await Promise.all([
      supabase.from('circles').select('*').eq('id', circleId).maybeSingle(),
      supabase.from('circle_members').select('user_id, nickname').eq('circle_id', circleId),
    ]);
    if (!c) return null;
    return { circle: c as Circle, members: (ms ?? []) as CircleMember[] };
  } catch {
    return null;
  }
}

export async function createCircle(userId: string, nickname: string, name: string, emoji: string): Promise<MyCircle | null> {
  if (!supabase) return null;
  try {
    const id = `circle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { data: c, error } = await supabase
      .from('circles')
      .insert({ id, name, emoji, owner_id: userId, invite_code: genInviteCode(), is_open: false })
      .select('*')
      .single();
    if (error || !c) return null;
    await supabase.from('circle_members').insert({ id: `${id}__${userId}`, circle_id: id, user_id: userId, nickname });
    return { circle: c as Circle, members: [{ user_id: userId, nickname }] };
  } catch {
    return null;
  }
}

export async function joinCircleByCode(code: string, userId: string, nickname: string): Promise<{ ok: boolean; reason?: string; circle?: Circle }> {
  if (!supabase) return { ok: false, reason: '서버 미설정' };
  try {
    const { data: c } = await supabase.from('circles').select('*').eq('invite_code', code.trim().toUpperCase()).maybeSingle();
    if (!c) return { ok: false, reason: '초대 코드를 찾을 수 없어요' };
    const circle = c as Circle;
    const { data: ms } = await supabase.from('circle_members').select('user_id').eq('circle_id', circle.id);
    const members = (ms ?? []) as { user_id: string }[];
    if (members.some(m => m.user_id === userId)) return { ok: true, circle };
    if (members.length >= CIRCLE_MAX_MEMBERS) return { ok: false, reason: '서클 정원(8명)이 가득 찼어요' };
    const { error } = await supabase.from('circle_members').insert({ id: `${circle.id}__${userId}`, circle_id: circle.id, user_id: userId, nickname });
    if (error) return { ok: false, reason: '참여에 실패했어요. 잠시 후 다시 시도해 주세요' };
    return { ok: true, circle };
  } catch {
    return { ok: false, reason: '네트워크 오류' };
  }
}

// 공개 서클 — 주 시즌제 랜덤 매칭 (콜드스타트 완화: 모르는 사람이지만 소수·고정 멤버)
export async function joinOpenCircle(userId: string, nickname: string, weekKey: string): Promise<{ ok: boolean; circle?: Circle }> {
  if (!supabase) return { ok: false };
  try {
    const { data: opens } = await supabase.from('circles').select('*').eq('is_open', true).eq('season_week', weekKey).limit(10);
    for (const c of (opens ?? []) as Circle[]) {
      const { data: ms } = await supabase.from('circle_members').select('user_id').eq('circle_id', c.id);
      const members = (ms ?? []) as { user_id: string }[];
      if (members.length < OPEN_CIRCLE_MAX && !members.some(m => m.user_id === userId)) {
        const { error } = await supabase.from('circle_members').insert({ id: `${c.id}__${userId}`, circle_id: c.id, user_id: userId, nickname });
        if (!error) return { ok: true, circle: c };
      }
    }
    const id = `circle-open-${weekKey}-${Math.random().toString(36).slice(2, 7)}`;
    const { data: c, error } = await supabase
      .from('circles')
      .insert({ id, name: '이번 주 공개 서클', emoji: '🎲', owner_id: userId, invite_code: genInviteCode(), is_open: true, season_week: weekKey })
      .select('*')
      .single();
    if (error || !c) return { ok: false };
    await supabase.from('circle_members').insert({ id: `${id}__${userId}`, circle_id: id, user_id: userId, nickname });
    return { ok: true, circle: c as Circle };
  } catch {
    return { ok: false };
  }
}

export async function leaveCircle(circleId: string, userId: string): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from('circle_members').delete().eq('circle_id', circleId).eq('user_id', userId);
    return !error;
  } catch {
    return false;
  }
}

// 특정 날짜의 유저별 실지출 합계 (소셜 포스트·마일스톤 제외) — 배틀 정산용
export async function fetchDayTotals(userIds: string[], date: string): Promise<Record<string, { total: number; recorded: boolean }>> {
  const result: Record<string, { total: number; recorded: boolean }> = {};
  if (!supabase || userIds.length === 0) return result;
  try {
    const { data } = await supabase
      .from('entries')
      .select('user_id, total_amount, week_key')
      .eq('date', date)
      .in('user_id', userIds);
    for (const row of (data ?? []) as { user_id: string; total_amount: number; week_key: string }[]) {
      if (row.week_key.startsWith('social-') || row.week_key.startsWith('milestone-')) continue;
      const cur = result[row.user_id] ?? { total: 0, recorded: false };
      result[row.user_id] = { total: cur.total + (row.total_amount || 0), recorded: true };
    }
    return result;
  } catch {
    return result;
  }
}

// 짝꿍에게 1:1 메시지(소비 고민 등) 전송 — 돈 친밀 의식
export async function sendCheerNotification(
  senderId: string,
  recipientId: string,
  senderNickname: string,
  message: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('notifications').insert({
    recipient_id: recipientId,
    sender_id: senderId,
    sender_nickname: senderNickname,
    type: 'cheer',
    message,
  });
  return !error;
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
  const list: Array<Omit<EntryWithReactions, 'stamp_counts' | 'my_stamp'>> = [
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
  return list.map(e => ({ ...e, stamp_counts: {}, my_stamp: null }));
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
export type CommunityCategory = 'tip' | 'recipe' | 'together' | 'daily' | 'question' | 'free' | 'invest';

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

// 피드 엔트리 댓글 일괄 로드 — community_comments를 post_id=entry.id로 재사용
export async function fetchCommentsForPosts(postIds: string[]): Promise<Record<string, CommunityComment[]>> {
  if (!supabase || postIds.length === 0) return {};
  const { data, error } = await supabase
    .from('community_comments')
    .select('*')
    .in('post_id', postIds)
    .order('created_at', { ascending: true });
  if (error || !data) return {};
  const map: Record<string, CommunityComment[]> = {};
  for (const c of data as CommunityComment[]) {
    (map[c.post_id] ??= []).push(c);
  }
  return map;
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

// ── 소셜 프루프: 전체/주간 기록 수 (head+count, 실패 시 null 폴백 → UI 숨김) ──
export interface GlobalStats { totalRecords: number; weekRecords: number; }
export async function fetchGlobalStats(weekKey: string): Promise<GlobalStats | null> {
  if (!supabase) return null;
  try {
    const [t, w] = await Promise.all([
      supabase.from('entries').select('*', { count: 'exact', head: true }),
      supabase.from('entries').select('*', { count: 'exact', head: true }).eq('week_key', weekKey),
    ]);
    if (t.error || w.error) return null;
    return { totalRecords: t.count ?? 0, weekRecords: w.count ?? 0 };
  } catch { return null; }
}

// 오늘의 질문에 달린 답 수 (질문 프리필 제목 매칭)
export async function fetchQuestionAnswerCount(title: string): Promise<number> {
  if (!supabase) return 0;
  try {
    const { count, error } = await supabase
      .from('community_posts')
      .select('*', { count: 'exact', head: true })
      .eq('title', title);
    if (error) return 0;
    return count ?? 0;
  } catch { return 0; }
}

// ── 절약 요정 — 첫 반응 보장 장치 (시스템 페르소나임을 닉네임으로 정직하게 노출) ──
export const FAIRY_USER_ID = '__fairy__';
export const FAIRY_NICKNAME = '절약 요정';
const FAIRY_ZERO_LINES = [
  '무지출 인정! 오늘 지갑이 평화로웠네요',
  '한 푼도 안 썼다니, 요정이 다 뿌듯해요',
  '오늘도 지켰네요. 이 맛에 절약하죠',
  '무지출 도장 쾅. 내일도 볼 수 있죠?',
];
const FAIRY_SPEND_LINES = [
  '쓴 건 쓴 거고, 자백한 게 어디예요. 인정',
  '솔직한 자백 좋아요. 털어놨으니 반은 아낀 거예요',
  '적어도 어디에 썼는지는 아는 사람이 됐네요',
  '자백 접수. 짠친들이 곧 판정하러 올 거예요',
];
export async function addFairyResponse(entryId: string, isZero: boolean): Promise<void> {
  if (!supabase) return;
  const pool = isZero ? FAIRY_ZERO_LINES : FAIRY_SPEND_LINES;
  let h = 0;
  for (const c of entryId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const msg = pool[h % pool.length];
  try {
    await Promise.all([
      supabase.from('reactions').insert({ entry_id: entryId, user_id: FAIRY_USER_ID, type: 'trust' }),
      supabase.from('community_comments').insert({ post_id: entryId, user_id: FAIRY_USER_ID, nickname: FAIRY_NICKNAME, persona: null, content: msg }),
    ]);
  } catch { /* 요정 실패는 조용히 — 기록 플로우를 막지 않는다 */ }
}

// 자리 비운 사이 내 기록에 달린 반응·댓글 수 (재방문 순간의 보상 가시화)
export async function fetchFeedbackSince(userId: string, sinceISO: string): Promise<{ reactions: number; comments: number } | null> {
  if (!supabase) return null;
  try {
    const { data: myEntries, error: e1 } = await supabase
      .from('entries').select('id').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(20);
    if (e1 || !myEntries || myEntries.length === 0) return null;
    const ids = myEntries.map(r => r.id);
    const [r, c] = await Promise.all([
      supabase.from('reactions').select('*', { count: 'exact', head: true })
        .in('entry_id', ids).neq('user_id', userId).gt('created_at', sinceISO),
      supabase.from('community_comments').select('*', { count: 'exact', head: true })
        .in('post_id', ids).neq('user_id', userId).gt('created_at', sinceISO),
    ]);
    if (r.error || c.error) return null;
    return { reactions: r.count ?? 0, comments: c.count ?? 0 };
  } catch { return null; }
}
