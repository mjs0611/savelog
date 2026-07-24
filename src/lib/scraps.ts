// 짠수첩 — 남의 자백·꿀팁을 내 수첩에 담기 (Are.na 'Connect'의 savelog 번안)
// 판정(도장)이 '너에 대한 평가'라면 담기는 '내 삶에 가져갈 것' — 신호의 결이 다르다.
// 내 수첩의 원본은 localStorage. 서버(reactions type='scrap')는 담김 수 집계용
// best-effort라 supabase_migration_scrap.sql 적용 전에도 수첩 자체는 온전히 동작한다.

const KEY = 'savelog_scraps';
const MAX = 200;

export function getScrapIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

// 토글 후의 상태를 돌려준다 (true=담김). 최근에 담은 것이 배열 앞.
export function toggleScrapLocal(entryId: string): boolean {
  const ids = getScrapIds();
  const has = ids.includes(entryId);
  const next = has ? ids.filter((id) => id !== entryId) : [entryId, ...ids];
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX)));
  } catch { /* quota — 담기 실패해도 앱은 계속 */ }
  return !has;
}
