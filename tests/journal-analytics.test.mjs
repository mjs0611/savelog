import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';

test('journal telemetry excludes runtime private fields and never blocks storage on failure', async () => {
  const sent = [];
  const code = stripTypeScriptTypes(readFileSync(new URL('../src/lib/journalAnalytics.ts', import.meta.url), 'utf8'))
    .replaceAll('export ', '').replaceAll('import.meta.env.PROD', 'true')
    .replace("import('@apps-in-toss/web-framework')", 'sdk()');
  let fail = false;
  const context = vm.createContext({ sdk: async () => ({ Analytics: { log: payload => {
    if (fail) throw Error('offline'); sent.push(payload);
  } } }) });
  vm.runInContext(code + ';globalThis.api = {trackJournal, getJournalAnalyticsHealth}', context);
  assert.equal(context.api.trackJournal('record_saved', { kind: 'spend', action: 'create', has_history: false, amount: 100, note: 'private' }), undefined);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].params)), { experience: 'personal_v1', kind: 'spend', action: 'create', has_history: false });
  fail = true;
  assert.doesNotThrow(() => context.api.trackJournal('record_saved', { kind: 'zero' }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(context.api.getJournalAnalyticsHealth().failed, 1);
  assert.equal(context.api.getJournalAnalyticsHealth().submitted, 1);
});
