// ── 관계 자본 (Relational Capital) ──────────────────────────────────────────
// 소셜의 moat = '사람 사이의 관계 그 자체'. 특정 사람과의 교류를 축적해
// 관계 스트릭/친밀도를 만든다. 로컬(즉시 반영) + 서버(양방향 공유) 이중 기록 —
// 서버 interactions 테이블 덕에 상대방도 같은 교류 스트릭을 본다.
import { getTodayStr } from './utils';
import { getUserId, getUserKey, getNickname } from './storage';
import { recordInteractionServer } from './supabase';

const RELATIONS_KEY = 'savelog_relations';

export interface Relation {
  userId: string;
  nickname: string;
  count: number;       // 누적 교류 횟수 (리액션/응원/투표/댓글)
  streak: number;      // 연속 교류 일수 (스냅챗식 불꽃)
  lastDate: string;    // 마지막 교류 날짜 (YYYY-MM-DD)
  firstDate: string;   // 첫 교류 날짜
}

type RelationMap = Record<string, Relation>;

function load(): RelationMap {
  try { const v = localStorage.getItem(RELATIONS_KEY); return v ? JSON.parse(v) : {}; } catch { return {}; }
}
function save(map: RelationMap): void {
  try {
    localStorage.setItem(RELATIONS_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event('savelog_relations_updated'));
  } catch {}
}

function yesterdayStr(today: string): string {
  const d = new Date(today + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 특정 사람과 교류 1회 기록 → 관계 자본 누적 (로컬 즉시 + 서버 best-effort)
export function recordInteraction(userId: string, nickname?: string): void {
  if (!userId) return;
  const today = getTodayStr();

  // 서버 양방향 기록 — 상대도 같은 교류 스트릭을 보게 된다
  const meId = getUserKey() ?? getUserId();
  recordInteractionServer(meId, getNickname() || '짠친', userId, nickname || '짠친', today).catch(() => {});

  const map = load();
  const r = map[userId];
  if (!r) {
    map[userId] = { userId, nickname: nickname || '짠친', count: 1, streak: 1, lastDate: today, firstDate: today };
  } else {
    if (nickname) r.nickname = nickname;
    r.count += 1;
    if (r.lastDate !== today) {
      r.streak = r.lastDate === yesterdayStr(today) ? r.streak + 1 : 1;
      r.lastDate = today;
    }
  }
  save(map);
}

export function getRelation(userId: string): Relation | null {
  return load()[userId] ?? null;
}

export function getAllRelations(): Relation[] {
  return Object.values(load());
}

export function getTopRelations(n = 3): Relation[] {
  return getAllRelations().sort((a, b) => b.count - a.count).slice(0, n);
}

// 오늘 또는 어제 교류가 없으면 스트릭은 0으로 간주 (stale 표시 방지)
export function getEffectiveStreak(r: Relation): number {
  const today = getTodayStr();
  if (r.lastDate === today || r.lastDate === yesterdayStr(today)) return r.streak;
  return 0;
}
