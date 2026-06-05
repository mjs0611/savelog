import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = import.meta.env.VITE_SUPABASE_URL      ?? '';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SpendingItem {
  category: string;
  emoji: string;
  amount: number;
  comment: string;
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
    const { data: rxData } = await supabase
      .from('reactions')
      .select('entry_id, type')
      .in('entry_id', allEntryIds)
      .eq('type', 'doubt');
    if (rxData) {
      for (const rx of rxData as { entry_id: string; type: string }[]) {
        // entry_id → user_id 역매핑
        const entry = typedData.find((e) => e.id === rx.entry_id);
        if (entry) {
          doubtByUser.set(entry.user_id, (doubtByUser.get(entry.user_id) ?? 0) + 1);
        }
      }
    }
  }

  return Array.from(map.values())
    .map(({ dateSet, latestDate: _ld, earliestDate, entryIds: _ids, ...rest }) => ({
      ...rest,
      days: dateSet.size,
      earliestDate,
      doubtCount: doubtByUser.get(rest.user_id) ?? 0,
    }))
    .sort((a, b) => {
      // 의심 반응이 3개 이상인 무지출 기록은 정상 기록 뒤로 밀림
      const aSuspect = a.total === 0 && a.doubtCount >= 3;
      const bSuspect = b.total === 0 && b.doubtCount >= 3;
      if (aSuspect !== bSuspect) return aSuspect ? 1 : -1;
      if (a.total !== b.total) return a.total - b.total;
      // 동률이면 기록 일수가 많은 쪽이 상위
      if (a.days !== b.days) return b.days - a.days;
      // 일수도 같으면 이번 주 첫 기록일이 빠른 쪽이 상위 (더 일찍 도전 시작)
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
  return {
    over: Math.round((overCount / total) * 100),
    ok: Math.round(((total - overCount) / total) * 100),
  };
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
      id: 'mock-1', user_id: 'mock-a', nickname: '절약왕민지',
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
      id: 'mock-2', user_id: 'mock-b', nickname: '짠돌이홍길동',
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
      id: 'mock-3', user_id: 'mock-c', nickname: '무지출챌린저',
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
  { user_id: 'mock-c', nickname: '무지출챌린저', total: 0, days: 5, doubtCount: 0 },
  { user_id: 'mock-a', nickname: '절약왕민지', total: 11500, days: 5, doubtCount: 0 },
  { user_id: 'mock-b', nickname: '짠돌이홍길동', total: 24500, days: 4, doubtCount: 0 },
];
