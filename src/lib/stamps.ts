// ── 거지방 스탬프 — 서비스의 유머 톤을 만드는 밈 판정 도장 ─────────────────────
// reactions 테이블에 type='stamp:{key}' 행으로 저장 (1인 1글 1스탬프, lib/supabase.toggleStamp)
export interface Stamp {
  key: string;
  emoji: string;
  label: string;
}

export const STAMPS: Stamp[] = [
  { key: 'nope', emoji: '🙅', label: '어림도 없지' },
  { key: 'chicken', emoji: '🍗', label: '그돈씨' },
  { key: 'approve', emoji: '✅', label: '합리적 소비' },
  { key: 'wallet-cry', emoji: '😭', label: '지갑이 우는 소리' },
  { key: 'salty', emoji: '🥄', label: '오늘의 짠수저' },
  { key: 'flex-arrest', emoji: '🚨', label: '플렉스 검거' },
];

export const STAMP_BY_KEY: Record<string, Stamp> = Object.fromEntries(STAMPS.map(s => [s.key, s]));

// 가장 많이 받은 스탬프 = 그 글의 '판결' (2개 이상 모여야 판결 성립)
export function topStamp(counts: Record<string, number>): { stamp: Stamp; count: number } | null {
  let best: { stamp: Stamp; count: number } | null = null;
  for (const [key, count] of Object.entries(counts)) {
    const stamp = STAMP_BY_KEY[key];
    if (!stamp || count < 2) continue;
    if (!best || count > best.count) best = { stamp, count };
  }
  return best;
}
