// 소비 행동 교정 엔진 — Phase 1: self-benchmark (군중 의존 없음)
// 기존 entries만으로 "지난주의 나 vs 이번주의 나"를 카테고리별로 진단한다.
import type { Entry } from './supabase';
import { getWeekKey, getWeekRange } from './utils';

// 지출이 아닌 메타 카테고리 (한마디/자랑/팁/방어 등)는 진단에서 제외
const META_CATEGORIES = new Set([
  '한마디', '자랑하기', '꿀팁', '절약 방어', '무지출', '소비 고민',
]);

/** 주어진 week_key의 직전 주 키를 반환 */
export function getPrevWeekKey(weekKey: string): string {
  const { start } = getWeekRange(weekKey);
  const prev = new Date(start);
  prev.setDate(start.getDate() - 7);
  return getWeekKey(prev);
}

/** entries를 카테고리별 실제 지출액으로 집계 (amount>0 & 메타 제외) */
export function aggregateCategorySpend(entries: Entry[]): Map<string, { amount: number; emoji: string }> {
  const map = new Map<string, { amount: number; emoji: string }>();
  for (const e of entries) {
    for (const item of e.items) {
      if (META_CATEGORIES.has(item.category)) continue;
      if (!(item.amount > 0)) continue;
      const cur = map.get(item.category) || { amount: 0, emoji: item.emoji };
      map.set(item.category, { amount: cur.amount + item.amount, emoji: cur.emoji });
    }
  }
  return map;
}

export type DiagnosisStatus = 'up' | 'down' | 'same' | 'new';

export interface DiagnosisRow {
  category: string;
  emoji: string;
  current: number;
  previous: number;
  deltaPct: number | null; // previous=0이면 null (신규)
  status: DiagnosisStatus;
  isOverspend: boolean; // 지난주보다 늘어난 지출 = 절감 후보
}

export interface Diagnosis {
  rows: DiagnosisRow[];
  totalCurrent: number;
  totalPrevious: number;
  totalDeltaPct: number | null;
  topOverspend: DiagnosisRow | null; // 가장 크게 늘어난 카테고리
  hasPrevData: boolean;
}

/** 이번주 vs 지난주 카테고리별 진단 */
export function diagnoseWoW(thisWeek: Entry[], lastWeek: Entry[]): Diagnosis {
  const cur = aggregateCategorySpend(thisWeek);
  const prev = aggregateCategorySpend(lastWeek);
  const cats = new Set<string>([...cur.keys(), ...prev.keys()]);

  const rows: DiagnosisRow[] = [];
  for (const cat of cats) {
    const c = cur.get(cat)?.amount ?? 0;
    const pv = prev.get(cat)?.amount ?? 0;
    const emoji = cur.get(cat)?.emoji ?? prev.get(cat)?.emoji ?? '📦';

    let status: DiagnosisStatus;
    let deltaPct: number | null;
    if (pv === 0) {
      status = c > 0 ? 'new' : 'same';
      deltaPct = null;
    } else {
      deltaPct = Math.round(((c - pv) / pv) * 100);
      status = c > pv ? 'up' : c < pv ? 'down' : 'same';
    }
    rows.push({
      category: cat,
      emoji,
      current: c,
      previous: pv,
      deltaPct,
      status,
      isOverspend: c > pv,
    });
  }

  // 현재 지출액 큰 순으로 정렬 (진단 우선순위)
  rows.sort((a, b) => b.current - a.current);

  const totalCurrent = rows.reduce((s, r) => s + r.current, 0);
  const totalPrevious = rows.reduce((s, r) => s + r.previous, 0);
  const totalDeltaPct =
    totalPrevious === 0 ? null : Math.round(((totalCurrent - totalPrevious) / totalPrevious) * 100);

  // 절감 후보: 증가폭(절대액)이 가장 큰 카테고리
  const overspends = rows.filter((r) => r.isOverspend);
  overspends.sort((a, b) => b.current - b.previous - (a.current - a.previous));
  const topOverspend = overspends[0] ?? null;

  return {
    rows,
    totalCurrent,
    totalPrevious,
    totalDeltaPct,
    topOverspend,
    hasPrevData: lastWeek.length > 0,
  };
}
