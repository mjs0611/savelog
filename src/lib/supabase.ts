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
    .select('user_id, nickname, total_amount, date')
    .eq('week_key', weekKey);
  if (error || !data) return null; // 네트워크 오류 — null로 구분

  const map = new Map<string, { user_id: string; nickname: string; total: number; dateSet: Set<string> }>();
  for (const row of data as { user_id: string; nickname: string; total_amount: number; date: string }[]) {
    const prev = map.get(row.user_id) ?? { user_id: row.user_id, nickname: row.nickname, total: 0, dateSet: new Set<string>() };
    prev.dateSet.add(row.date);
    prev.total += row.total_amount;
    map.set(row.user_id, prev);
  }
  return Array.from(map.values())
    .map(({ dateSet, ...rest }) => ({ ...rest, days: dateSet.size }))
    .sort((a, b) => a.total - b.total);
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

function buildMockFeed(userId: string): EntryWithReactions[] {
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
  { user_id: 'mock-c', nickname: '무지출챌린저', total: 0, days: 5 },
  { user_id: 'mock-a', nickname: '절약왕민지', total: 11500, days: 5 },
  { user_id: 'mock-b', nickname: '짠돌이홍길동', total: 24500, days: 4 },
];
