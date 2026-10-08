import test from 'node:test';
import assert from 'node:assert/strict';
import { JOURNAL_KEY, readJournal, saveCheckIn, todayKST } from '../src/lib/journal.ts';
import { REFLECTION_KEY, emptyReflection, monthSummary, nextWeekStart, parseReflection, promiseForDate,
  readReflection, saveMonthReflection, savePromiseCheck, saveWeeklyPromise, shiftMonth } from '../src/lib/reflection.ts';
import { importPersonalBackup, personalBackup } from '../src/lib/journalBackup.ts';
const stamp = '2026-10-08T00:00:00Z';
const day = (date, amount = 0, extensions = {}) => ({ date, amount, note: '합성 메모', updatedAt: stamp, ...extensions });
const memory = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
};
const promise = (weekStart = '2026-10-12', text = '결제 전에 생각하기') => ({ weekStart, text, sourceMonth: '2026-10', sourceDate: '2026-10-01', updatedAt: stamp });

test('monthly sums distinguish missing days, 0원 and future days', () => {
  const journal = { version: 1, entries: [day('2026-09-30', 9000), day('2026-10-01', 7000), day('2026-10-03'), day('2026-10-09', 5000)] };
  const result = monthSummary(journal, '2026-10', '2026-10-08');
  assert.equal(result.total, 7000); assert.equal(result.recorded, 2); assert.equal(result.zero, 1); assert.equal(result.missing, 6);
  assert.equal(monthSummary(journal, '2026-09', '2026-10-08').missing, 29);
});
test('month navigation and leap-month totals cross year boundaries', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01'); assert.equal(shiftMonth('2027-01', -1), '2026-12');
  assert.equal(monthSummary({ version: 1, entries: [day('2024-02-29')] }, '2024-02', '2024-03-01').missing, 28);
});
test('next week uses KST today and Monday across month/year, independent of viewed month', () => {
  assert.equal(nextWeekStart('2026-12-31'), '2027-01-04');
  assert.equal(nextWeekStart(todayKST(new Date('2026-10-11T14:59:59Z'))), '2026-10-12');
  assert.equal(nextWeekStart(todayKST(new Date('2026-10-11T15:00:00Z'))), '2026-10-19');
});
test('monthly remember/edit and promise save round-trip without touching daily or legacy keys', () => {
  const store = memory(); saveCheckIn(store, day('2026-10-01', 5000)); store.setItem('savelog_pending_points', '47');
  const original = store.getItem(JOURNAL_KEY);
  saveMonthReflection(store, { month: '2026-10', memorableDate: '2026-10-01', note: '기억할 합성 지출', updatedAt: stamp });
  saveWeeklyPromise(store, promise()); saveMonthReflection(store, { month: '2026-10', memorableDate: '2026-10-01', note: '회고 수정', updatedAt: stamp });
  assert.equal(readReflection(store).months.length, 1); assert.equal(readReflection(store).months[0].note, '회고 수정');
  assert.equal(readReflection(store).promises[0].text, promise().text);
  assert.equal(store.getItem(JOURNAL_KEY), original); assert.equal(store.getItem('savelog_pending_points'), '47');
});
test('new daily record does not automatically complete any promise; only its target week links', () => {
  const store = memory(); saveWeeklyPromise(store, promise());
  assert.equal(promiseForDate(readReflection(store), '2026-10-11'), undefined);
  assert.equal(promiseForDate(readReflection(store), '2026-10-12').weekStart, '2026-10-12');
  saveCheckIn(store, day('2026-10-12', 8000));
  assert.equal(readReflection(store).promises[0].checkIns.length, 0);
});
test('self-reflection requires a saved date in the target week and can be revised without duplication', () => {
  const store = memory(); saveWeeklyPromise(store, promise());
  assert.throws(() => savePromiseCheck(store, readJournal(store), '2026-10-12', 'tried', stamp), /먼저 저장/);
  saveCheckIn(store, day('2026-10-12')); saveCheckIn(store, day('2026-10-11'));
  assert.throws(() => savePromiseCheck(store, readJournal(store), '2026-10-11', 'tried', stamp), /정한 약속/);
  savePromiseCheck(store, readJournal(store), '2026-10-12', 'tried', stamp);
  savePromiseCheck(store, readJournal(store), '2026-10-12', 'adjust', stamp);
  assert.equal(readReflection(store).promises[0].checkIns.length, 1); assert.equal(readReflection(store).promises[0].checkIns[0].answer, 'adjust');
});
test('promise edit preserves earlier self-reflections against the original wording', () => {
  const store = memory(); saveWeeklyPromise(store, promise()); saveCheckIn(store, day('2026-10-12'));
  savePromiseCheck(store, readJournal(store), '2026-10-12', 'tried', stamp);
  saveWeeklyPromise(store, promise('2026-10-12', '장보기 목록 적기'));
  const saved = readReflection(store).promises[0];
  assert.equal(saved.text, '장보기 목록 적기'); assert.equal(saved.checkIns[0].promiseText, '결제 전에 생각하기');
});
test('multiple-tab writes re-read other month/week work rather than replacing a snapshot', () => {
  const store = memory(); readReflection(store);
  saveMonthReflection(store, { month: '2026-09', note: '지난달', updatedAt: stamp });
  saveWeeklyPromise(store, promise()); saveWeeklyPromise(store, promise('2026-10-19'));
  saveMonthReflection(store, { month: '2026-10', note: '이번달', updatedAt: stamp });
  assert.equal(readReflection(store).months.length, 2); assert.equal(readReflection(store).promises.length, 2);
});
test('invalid reflection dates, weeks, duplicate targets and oversized strings never validate', () => {
  const value = { version: 1, months: [], promises: [{ ...promise(), checkIns: [] }] };
  for (const patch of [{ weekStart: '2026-10-13' }, { sourceMonth: '2026-13' }, { sourceDate: '2026-09-30' }, { text: 'x'.repeat(81) }, { checkIns: [{ date: '2026-10-19', answer: 'tried', updatedAt: stamp }] }]) {
    assert.throws(() => parseReflection(JSON.stringify({ ...value, promises: [{ ...value.promises[0], ...patch }] })));
  }
  assert.throws(() => parseReflection(JSON.stringify({ ...value, promises: [value.promises[0], value.promises[0]] })));
  assert.throws(() => parseReflection(JSON.stringify({ version: 1, months: [{ month: '2026-02', memorableDate: '2026-02-30', note: '', updatedAt: stamp }], promises: [] })));
});
test('corrupt reflection remains byte-exact while daily recording still works', () => {
  const store = memory(); store.setItem(REFLECTION_KEY, '{broken');
  assert.throws(() => saveWeeklyPromise(store, promise())); saveCheckIn(store, day('2026-10-08', 2000));
  assert.equal(store.getItem(REFLECTION_KEY), '{broken'); assert.equal(readJournal(store).entries[0].amount, 2000);
});
test('reflection quota failure does not mutate daily records or claim success', () => {
  const store = memory(); saveCheckIn(store, day('2026-10-08', 2000)); const before = store.getItem(JOURNAL_KEY);
  assert.throws(() => saveWeeklyPromise({ getItem: store.getItem, setItem: () => { throw new Error('QuotaExceededError'); } }, promise()), /QuotaExceededError/);
  assert.equal(store.getItem(JOURNAL_KEY), before); assert.equal(store.getItem(REFLECTION_KEY), null);
});
test('opaque photo/memo additions survive read, editing another field, backup and import', () => {
  const store = memory(); const opaque = { photo: { data: 'data:image/png;base64,SYNTHETIC', order: [2, 1], caption: '합성 사진' }, extraMemo: ['합성 추가 메모'] };
  saveCheckIn(store, day('2026-10-01', 1000, opaque)); saveCheckIn(store, day('2026-10-01', 2000));
  store.setItem(JOURNAL_KEY, JSON.stringify({ ...readJournal(store), album: { label: '합성 앨범', order: [2, 1] } }));
  assert.deepEqual(readJournal(store).entries[0].photo, opaque.photo);
  const copy = memory(); importPersonalBackup(copy, personalBackup(store), '2026-10-08');
  assert.deepEqual(readJournal(copy).entries[0].photo, opaque.photo); assert.deepEqual(readJournal(copy).entries[0].extraMemo, opaque.extraMemo);
  assert.deepEqual(readJournal(copy).album, { label: '합성 앨범', order: [2, 1] });
});
test('new backup restores both keys, repeated import preserves current daily/month/week edits', () => {
  const store = memory(); saveCheckIn(store, day('2026-10-01', 1000)); saveWeeklyPromise(store, promise());
  saveMonthReflection(store, { month: '2026-10', memorableDate: '2026-10-01', note: '월간 회고', updatedAt: stamp });
  const backup = personalBackup(store); const copy = memory(); const first = importPersonalBackup(copy, backup, '2026-10-08');
  assert.equal(first.reflectionFailed, false); assert.equal(first.added, 1); assert.equal(readReflection(copy).months[0].note, '월간 회고');
  assert.equal(readJournal(copy).personalReflection, undefined);
  saveCheckIn(copy, day('2026-10-01', 9000)); saveWeeklyPromise(copy, promise('2026-10-12', '수정한 약속'));
  assert.equal(importPersonalBackup(copy, backup, '2026-10-08').added, 0);
  assert.equal(readJournal(copy).entries[0].amount, 9000); assert.equal(readReflection(copy).promises[0].text, '수정한 약속');
});
test('old daily-only backups remain supported without writing a reflection key', () => {
  const store = memory(); const result = importPersonalBackup(store, JSON.stringify({ version: 1, entries: [day('2026-10-01', 1000)] }), '2026-10-08');
  assert.equal(result.added, 1); assert.equal(store.getItem(REFLECTION_KEY), null);
});
test('malformed reflection backup rejects before either key is written', () => {
  const store = memory(); saveCheckIn(store, day('2026-10-01', 1000)); const before = store.getItem(JOURNAL_KEY);
  assert.throws(() => importPersonalBackup(store, JSON.stringify({ version: 1, entries: [day('2026-10-02')], personalReflection: { version: 99 } }), '2026-10-08'));
  assert.equal(store.getItem(JOURNAL_KEY), before); assert.equal(store.getItem(REFLECTION_KEY), null);
});
test('second-key import failure reports partial success while preserving original reflection and all daily entries', () => {
  const store = memory(); saveCheckIn(store, day('2026-10-01', 7000)); saveWeeklyPromise(store, promise()); const original = store.getItem(REFLECTION_KEY);
  const failing = { getItem: store.getItem, setItem: (key, value) => { if (key === REFLECTION_KEY) throw new Error('Full'); store.setItem(key, value); } };
  const result = importPersonalBackup(failing, JSON.stringify({ version: 1, entries: [day('2026-10-02', 2000)], personalReflection: emptyReflection() }), '2026-10-08');
  assert.equal(result.reflectionFailed, true); assert.equal(result.added, 1); assert.equal(readJournal(store).entries.length, 2); assert.equal(store.getItem(REFLECTION_KEY), original);
});
test('first-key import failure leaves both keys intact and raises to the UI', () => {
  const store = memory(); saveCheckIn(store, day('2026-10-01', 7000)); saveWeeklyPromise(store, promise()); const daily = store.getItem(JOURNAL_KEY), reflected = store.getItem(REFLECTION_KEY);
  assert.throws(() => importPersonalBackup({ getItem: store.getItem, setItem: () => { throw new Error('Full'); } }, personalBackup(store), '2026-10-08'), /Full/);
  assert.equal(store.getItem(JOURNAL_KEY), daily); assert.equal(store.getItem(REFLECTION_KEY), reflected);
});
