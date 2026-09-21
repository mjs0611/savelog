// Personal check-ins never enter the public social tables.
export const JOURNAL_KEY = 'savelog_personal_journal_v1';
export const MAX_AMOUNT = 99999999;
export interface CheckIn { date: string; amount: number; note: string; updatedAt: string }
export interface Journal { version: 1; entries: CheckIn[] }
export const EMPTY_JOURNAL: Journal = { version: 1, entries: [] };
export type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function todayKST(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekDates(date: string): string[] {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const monday = shiftDate(date, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
}
export function validDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
export function parseJournal(raw: string): Journal {
  const input: unknown = JSON.parse(raw);
  if (!input || typeof input !== 'object' || !('version' in input) || input.version !== 1 ||
      !('entries' in input) || !Array.isArray(input.entries) || input.entries.length > 10000) {
    throw new Error('올바른 세이브로그 백업 파일이 아니에요.');
  }
  const dates = new Set<string>();
  const entries: CheckIn[] = input.entries.map((e: unknown) => {
    if (!e || typeof e !== 'object' || !('date' in e) || !validDate(e.date) ||
        !('amount' in e) || typeof e.amount !== 'number' || !Number.isSafeInteger(e.amount) || e.amount < 0 || e.amount > MAX_AMOUNT ||
        !('note' in e) || typeof e.note !== 'string' || e.note.length > 120 ||
        !('updatedAt' in e) || typeof e.updatedAt !== 'string' || !Number.isFinite(Date.parse(e.updatedAt)) || dates.has(e.date)) {
      throw new Error('기록 형식을 확인할 수 없어요. 원본 파일을 그대로 보관해 주세요.');
    }
    dates.add(e.date);
    return { date: e.date, amount: e.amount, note: e.note, updatedAt: e.updatedAt };
  });
  return { version: 1, entries: entries.sort((a, b) => b.date.localeCompare(a.date)) };
}
export function readJournal(storage: Store): Journal {
  const raw = storage.getItem(JOURNAL_KEY);
  return raw === null ? { version: 1, entries: [] } : parseJournal(raw);
}
export function saveCheckIn(storage: Store, entry: CheckIn): Journal {
  // Re-read before writing so an older tab does not replace other dates.
  const current = readJournal(storage);
  const next = parseJournal(JSON.stringify({ version: 1, entries: [entry, ...current.entries.filter(e => e.date !== entry.date)] }));
  storage.setItem(JOURNAL_KEY, JSON.stringify(next));
  return next;
}
export function mergeJournal(storage: Store, imported: Journal): { journal: Journal; added: number } {
  const current = readJournal(storage);
  const dates = new Set(current.entries.map(e => e.date));
  // Existing days win: importing never silently replaces current work.
  const additions = imported.entries.filter(e => !dates.has(e.date));
  const journal = parseJournal(JSON.stringify({ version: 1, entries: [...current.entries, ...additions] }));
  storage.setItem(JOURNAL_KEY, JSON.stringify(journal));
  return { journal, added: additions.length };
}
export function weekSummary(journal: Journal, date: string) {
  const dates = weekDates(date);
  const entries = journal.entries.filter(e => dates.includes(e.date) && e.date <= date);
  return { entries, total: entries.reduce((sum, e) => sum + e.amount, 0),
    recorded: entries.length, zero: entries.filter(e => e.amount === 0).length };
}
