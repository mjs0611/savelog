import test from 'node:test';
import assert from 'node:assert/strict';
import { JOURNAL_KEY, MAX_AMOUNT, todayKST, weekDates, parseJournal, readJournal, saveCheckIn, mergeJournal, weekSummary } from '../src/lib/journal.ts';

const entry = (date, amount = 0) => ({ date, amount, note: '', updatedAt: '2026-09-08T00:00:00Z' });
const memoryStore = () => {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
};

test('KST day rolls over at 15:00 UTC, independent of device timezone', () => {
  assert.equal(todayKST(new Date('2026-09-07T14:59:59Z')), '2026-09-07');
  assert.equal(todayKST(new Date('2026-09-07T15:00:00Z')), '2026-09-08');
});
test('Monday week crosses month and year boundaries', () => {
  assert.deepEqual(weekDates('2027-01-01'), ['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
});
test('editing a day replaces its total, preserving other days and legacy keys', () => {
  const store = memoryStore(); store.setItem('savelog_pending_points', '3');
  saveCheckIn(store, entry('2026-09-07', 4500));
  saveCheckIn(store, entry('2026-09-08', 10000));
  const next = saveCheckIn(store, entry('2026-09-08', 15000));
  assert.equal(next.entries.length, 2);
  assert.equal(next.entries[0].amount, 15000);
  assert.equal(next.entries[1].amount, 4500);
  assert.equal(store.getItem('savelog_pending_points'), '3');
});
test('missing days are never counted as zero; previous week is excluded', () => {
  const journal = { version: 1, entries: [entry('2026-09-06', 100000), entry('2026-09-07', 12000), entry('2026-09-08')] };
  const summary = weekSummary(journal, '2026-09-08');
  assert.equal(summary.recorded, 2); assert.equal(summary.zero, 1); assert.equal(summary.total, 12000);
});
test('backup validation rejects invalid dates, unsafe values and duplicate dates', () => {
  for (const bad of [entry('2026-02-30'), entry('2026-09-08', -1), entry('2026-09-08', 1.5), entry('2026-09-08', MAX_AMOUNT + 1), { ...entry('2026-09-08'), note: 'a'.repeat(121) }]) {
    assert.throws(() => parseJournal(JSON.stringify({ version: 1, entries: [bad] })));
  }
  assert.throws(() => parseJournal(JSON.stringify({ version: 1, entries: [entry('2026-09-08'), entry('2026-09-08')] })));
  assert.throws(() => parseJournal('{"version":2,"entries":[]}'));
});
test('backup import keeps existing dates, and a repeated import adds nothing', () => {
  const store = memoryStore(); saveCheckIn(store, entry('2026-09-08', 5000));
  const backup = { version: 1, entries: [entry('2026-09-08', 9000), entry('2026-09-07', 1000)] };
  const result = mergeJournal(store, backup);
  assert.equal(result.added, 1); assert.equal(result.journal.entries[0].amount, 5000);
  assert.equal(mergeJournal(store, backup).added, 0);
});
test('corrupt storage is preserved instead of silently replaced with an empty journal', () => {
  const store = memoryStore(); store.setItem(JOURNAL_KEY, '{broken');
  assert.throws(() => readJournal(store));
  assert.throws(() => saveCheckIn(store, entry('2026-09-08')));
  assert.equal(store.getItem(JOURNAL_KEY), '{broken');
});
test('quota failure is visible to the caller; no false successful save', () => {
  const store = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.throws(() => saveCheckIn(store, entry('2026-09-08')), /QuotaExceededError/);
});
test('writes re-read storage so another tab\'s different day is retained', () => {
  const store = memoryStore();
  readJournal(store); // First tab opens an empty journal.
  saveCheckIn(store, entry('2026-09-07', 1000)); // Other tab saves.
  assert.equal(saveCheckIn(store, entry('2026-09-08', 3000)).entries.length, 2);
});
