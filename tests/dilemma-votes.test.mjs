import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/screens/FeedScreen.tsx', import.meta.url), 'utf8');
const start = source.indexOf('          const realVotes = dilemmaVotes[entry.id];');
const end = source.indexOf('\n          return (', start);
const calc = source.slice(start, end).replace(/: number/g, '') + '\n({ hasRealVotes, overPct, okPct, totalFeedVotes })';
for (const votes of [undefined, { over: 0, ok: 0, total: 0 }]) {
  const result = vm.runInNewContext(calc, { dilemmaVotes: { a: votes }, entry: { id: 'a' } });
  assert.equal(result.hasRealVotes, false);
  assert.equal(result.totalFeedVotes, 0);
  assert.equal(result.overPct, 0);
}
const result = vm.runInNewContext(calc, { dilemmaVotes: { a: { over: 1, ok: 3, total: 4 } }, entry: { id: 'a' } });
assert.equal(result.overPct, 25); assert.equal(result.okPct, 75); assert.equal(result.totalFeedVotes, 4);
assert.match(source, /hasVoted && !hasRealVotes \? \([\s\S]*?아직 확인된 투표 결과가 없어요/);
console.log('missing/zero/real vote totals: passed');
