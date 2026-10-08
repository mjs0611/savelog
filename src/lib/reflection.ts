import { shiftDate, validDate, weekDates, type Journal, type Store } from './journal.ts';

export const REFLECTION_KEY = 'savelog_personal_reflection_v1';
export type PromiseAnswer = 'tried' | 'adjust' | 'not-yet';
export interface MonthReflection { month: string; memorableDate?: string; note: string; updatedAt: string }
export interface PromiseCheck { date: string; answer: PromiseAnswer; updatedAt: string; promiseText?: string }
export interface WeeklyPromise {
  weekStart: string; text: string; sourceMonth: string; sourceDate?: string;
  updatedAt: string; checkIns: PromiseCheck[];
}
export interface Reflection { version: 1; months: MonthReflection[]; promises: WeeklyPromise[] }
export const emptyReflection = (): Reflection => ({ version: 1, months: [], promises: [] });
export function validMonth(month: unknown): month is string {
  return typeof month === 'string' && /^\d{4}-\d{2}$/.test(month) && validDate(`${month}-01`);
}
export function shiftMonth(month: string, count: number): string {
  const date = new Date(`${month}-01T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7);
}
export function nextWeekStart(today: string): string { return shiftDate(weekDates(today)[0], 7); }
export function monthSummary(journal: Journal, month: string, throughDate: string) {
  const entries = journal.entries.filter(e => e.date.startsWith(`${month}-`) && e.date <= throughDate);
  const days = new Date(`${shiftMonth(month, 1)}-01T12:00:00Z`);
  days.setUTCDate(0);
  const elapsed = month === throughDate.slice(0, 7) ? Number(throughDate.slice(8)) : days.getUTCDate();
  return { entries, recorded: entries.length, zero: entries.filter(e => e.amount === 0).length,
    total: entries.reduce((sum, e) => sum + e.amount, 0), missing: Math.max(0, elapsed - entries.length) };
}
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
function invalid(): never { throw new Error('회고 형식을 확인할 수 없어요. 기존 회고는 덮어쓰지 않아요.'); }
export function parseReflection(raw: string): Reflection {
  const input: unknown = JSON.parse(raw);
  if (!isObject(input) || input.version !== 1 || !Array.isArray(input.months) || !Array.isArray(input.promises) || input.months.length > 1200 || input.promises.length > 5200) invalid();
  const monthsSeen = new Set<string>();
  const months = input.months.map((value: unknown): MonthReflection => {
    if (!isObject(value) || !validMonth(value.month) || monthsSeen.has(value.month) || typeof value.note !== 'string' || value.note.length > 140 || !timestamp(value.updatedAt) ||
      (value.memorableDate !== undefined && (!validDate(value.memorableDate) || !value.memorableDate.startsWith(`${value.month}-`)))) invalid();
    monthsSeen.add(value.month);
    return { month: value.month, note: value.note, updatedAt: value.updatedAt, ...(value.memorableDate ? { memorableDate: value.memorableDate } : {}) };
  });
  const weeksSeen = new Set<string>();
  const promises = input.promises.map((value: unknown): WeeklyPromise => {
    if (!isObject(value) || !validDate(value.weekStart) || weekDates(value.weekStart)[0] !== value.weekStart || weeksSeen.has(value.weekStart) ||
      typeof value.text !== 'string' || !value.text.trim() || value.text.length > 80 || !validMonth(value.sourceMonth) || !timestamp(value.updatedAt) || !Array.isArray(value.checkIns) || value.checkIns.length > 7 ||
      (value.sourceDate !== undefined && (!validDate(value.sourceDate) || !value.sourceDate.startsWith(`${value.sourceMonth}-`)))) invalid();
    weeksSeen.add(value.weekStart);
    const datesSeen = new Set<string>();
    const checkIns = value.checkIns.map((check: unknown): PromiseCheck => {
      if (!isObject(check) || !validDate(check.date) || weekDates(check.date)[0] !== value.weekStart || datesSeen.has(check.date) ||
        !['tried', 'adjust', 'not-yet'].includes(String(check.answer)) || !timestamp(check.updatedAt) ||
        (check.promiseText !== undefined && (typeof check.promiseText !== 'string' || check.promiseText.length > 80))) invalid();
      datesSeen.add(check.date);
      return { date: check.date, answer: check.answer as PromiseAnswer, updatedAt: check.updatedAt, ...(typeof check.promiseText === 'string' ? { promiseText: check.promiseText } : {}) };
    });
    return { weekStart: value.weekStart, text: value.text, sourceMonth: value.sourceMonth, updatedAt: value.updatedAt, checkIns,
      ...(value.sourceDate ? { sourceDate: value.sourceDate } : {}) };
  });
  return { version: 1, months, promises };
}
export function readReflection(storage: Store): Reflection {
  const raw = storage.getItem(REFLECTION_KEY);
  return raw === null ? emptyReflection() : parseReflection(raw);
}
function write(storage: Store, value: Reflection): Reflection {
  const checked = parseReflection(JSON.stringify(value));
  storage.setItem(REFLECTION_KEY, JSON.stringify(checked));
  return checked;
}
export function saveMonthReflection(storage: Store, month: MonthReflection): Reflection {
  const current = readReflection(storage);
  return write(storage, { ...current, months: [...current.months.filter(e => e.month !== month.month), month] });
}
export function saveWeeklyPromise(storage: Store, promise: Omit<WeeklyPromise, 'checkIns'>): Reflection {
  const current = readReflection(storage);
  const previous = current.promises.find(e => e.weekStart === promise.weekStart);
  // Keep earlier self-reflections tied to the wording the person actually saw.
  const checkIns = previous?.checkIns.map(check => ({ ...check, promiseText: check.promiseText ?? previous.text })) ?? [];
  return write(storage, { ...current, promises: [...current.promises.filter(e => e.weekStart !== promise.weekStart), { ...promise, checkIns }] });
}
export function promiseForDate(reflection: Reflection, date: string): WeeklyPromise | undefined {
  return reflection.promises.find(e => e.weekStart === weekDates(date)[0]);
}
export function savePromiseCheck(storage: Store, journal: Journal, date: string, answer: PromiseAnswer, updatedAt: string): Reflection {
  if (!journal.entries.some(e => e.date === date)) throw new Error('하루 기록을 먼저 저장해 주세요.');
  const current = readReflection(storage);
  const promise = promiseForDate(current, date);
  if (!promise) throw new Error('이 주에 정한 약속이 없어요.');
  return write(storage, { ...current, promises: current.promises.map(e => e.weekStart !== promise.weekStart ? e :
    { ...e, checkIns: [...e.checkIns.filter(c => c.date !== date), { date, answer, updatedAt, promiseText: e.text }] }) });
}
// Existing month/week work wins on import, matching the daily backup contract.
export function mergeReflection(storage: Store, imported: Reflection): Reflection {
  const current = readReflection(storage);
  return write(storage, { version: 1,
    months: [...current.months, ...imported.months.filter(e => !current.months.some(c => c.month === e.month))],
    promises: [...current.promises, ...imported.promises.filter(e => !current.promises.some(c => c.weekStart === e.weekStart))] });
}
