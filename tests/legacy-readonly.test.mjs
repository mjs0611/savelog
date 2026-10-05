import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('supabase.ts', source, ts.ScriptTarget.Latest, true);
const functions = new Map(ast.statements.filter(ts.isFunctionDeclaration).map(node => [node.name.text, node]));
const writes = new Set();
const dependencies = new Map();
const mutationMethods = new Set(['insert', 'update', 'delete', 'upsert', 'rpc']);
const exported = node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
function visit(node, callback) { callback(node); ts.forEachChild(node, child => visit(child, callback)); }
for (const [name, fn] of functions) {
  const calls = new Set();
  visit(fn.body, node => {
    // Property references are included: const mutate = table.insert must also be frozen.
    if ((ts.isPropertyAccessExpression(node) && mutationMethods.has(node.name.text)) ||
        (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) && mutationMethods.has(node.argumentExpression.text))) writes.add(name);
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) calls.add(node.expression.text);
  });
  dependencies.set(name, calls);
}
let changed;
do {
  changed = false;
  for (const [name, calls] of dependencies) if (!writes.has(name) && [...calls].some(c => writes.has(c))) { writes.add(name); changed = true; }
} while (changed);
const writerNames = [...writes].filter(name => exported(functions.get(name)));

function loadModule(client, configured = true) {
  const code = ts.transpileModule(source.replaceAll('import.meta.env', '__env'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const context = vm.createContext({ exports, __env: configured ? { VITE_SUPABASE_URL: 'https://test.invalid', VITE_SUPABASE_ANON_KEY: 'test' } : {},
    require: name => { assert.equal(name, '@supabase/supabase-js'); return { createClient: () => client }; },
    console, fetch: () => { throw Error('Unexpected network request'); },
  });
  vm.runInContext(code, context);
  return exports;
}

test('all public mutations and their exported callers have an unconditional first-statement guard', () => {
  assert.ok(writerNames.length >= 30, 'discovery must include all existing writers');
  for (const name of writes) {
    assert.equal(functions.get(name).body.statements[0].getText(ast), 'assertLegacyWritable();', name);
  }
  // The raw client cannot be imported around the boundary.
  assert.doesNotMatch(source, /export\s+(?:const|let|var)\s+supabase\b/);
  // No top-level mutation can escape function discovery.
  visit(ast, node => {
    if (!ts.isPropertyAccessExpression(node) || !mutationMethods.has(node.name.text)) return;
    let owner = node;
    while (owner.parent && !ast.statements.includes(owner)) owner = owner.parent;
    assert.ok(ts.isFunctionDeclaration(owner) && writes.has(owner.name.text), node.getText(ast));
  });
});

for (const configured of [true, false]) {
  test(`every discovered exported writer rejects without any client access (configured=${configured})`, async () => {
    let accesses = 0;
    const client = new Proxy({}, { get() { accesses++; throw Error('Writer touched client'); } });
    const api = loadModule(client, configured);
    for (const name of writerNames) {
      // Undefined arguments prove the guard runs even before inspecting caller input.
      await assert.rejects(api[name](), error => error.name === 'LegacyReadonlyError', name);
      await assert.rejects(api[name]('entry', 'user', 'trust', 'nickname', '2026-10-01'), error => error.name === 'LegacyReadonlyError', name);
    }
    assert.equal(accesses, 0);
  });
}

test('public archive reads still return rows; notifications [] is a normal result; boss lookup never inserts', async () => {
  const rows = {
    entries: [{ id: 'e', user_id: 'u', nickname: 'reader', total_amount: 0, items: [], date: '2026-10-01', created_at: '2026-10-01' }],
    reactions: [], community_likes: [], notifications: [],
    community_posts: [{ id: 'p', title: 'old post' }], community_comments: [{ id: 'c', post_id: 'p', content: 'old comment' }],
    users: { user_key: 123 }, weekly_boss: null,
  };
  const accessed = [];
  const client = { from(table) {
    accessed.push(table);
    let query;
    query = new Proxy({}, { get(_target, key) {
      assert.ok(!mutationMethods.has(key), `read called ${key}`);
      if (key === 'then') return resolve => resolve({ data: Object.hasOwn(rows, table) ? rows[table] : [], error: null });
      return () => query;
    } });
    return query;
  } };
  const api = loadModule(client);
  assert.equal((await api.fetchFeed('u'))[0].id, 'e');
  assert.equal((await api.fetchWeekRank('2026-W40'))[0].user_id, 'u');
  assert.equal((await api.fetchCommunityPosts('all', 'u'))[0].title, 'old post');
  assert.equal((await api.fetchCommunityComments('p'))[0].content, 'old comment');
  assert.equal((await api.fetchMyAllEntries('u'))[0].id, 'e');
  assert.equal((await api.fetchMyNotifications('u')).length, 0);
  assert.equal(await api.verifyUserLinked('123'), true);
  assert.equal(await api.fetchWeeklyBoss('2026-W40'), null);
  assert.ok(accessed.includes('notifications'));
});
