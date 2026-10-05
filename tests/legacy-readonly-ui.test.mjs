import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';

const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const parse = file => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function walk(node, fn) { fn(node); ts.forEachChild(node, child => walk(child, fn)); }
const db = parse('src/lib/supabase.ts');
const writers = new Set(db.statements.filter(ts.isFunctionDeclaration)
  .filter(fn => fn.body?.statements[0]?.getText(db).includes('assertLegacyWritable()'))
  .map(fn => fn.name.text));

// Trace UI handlers back to the frozen data boundary, including indirect handlers
// such as double taps. This discovers additional writer functions automatically.
const files = ['src/LegacyApp.tsx', 'src/screens/FeedScreen.tsx',
  'src/screens/CommunityScreen.tsx', 'src/screens/ProfileScreen.tsx',
  'src/screens/RankScreen.tsx', 'src/components/MyCockpit.tsx'];
for (const file of files) test(`${file}: write entry points are disabled or absent`, () => {
  const ast = parse(file);
  const blocked = new Set([...writers, 'onRecord', 'onQuickRecord', 'onQuickZeroSpend',
    'sendCheeringMessage', 'openCompose', 'handleInviteDuo', 'handleShareCircleInvite']);
  const functions = new Map();
  walk(ast, node => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) functions.set(node.name.text, node.body);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) functions.set(node.name.text, node.initializer.body);
  });
  function referencesBlocked(node) {
    let found = false;
    walk(node, child => { if (ts.isIdentifier(child) && blocked.has(child.text)) found = true; });
    return found;
  }
  let changed;
  do {
    changed = false;
    for (const [name, body] of functions) if (!blocked.has(name) && referencesBlocked(body)) { blocked.add(name); changed = true; }
  } while (changed);
  walk(ast, node => {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    if (!['button', 'Button', 'div', 'span', 'input', 'textarea'].includes(node.tagName.getText(ast))) return;
    const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
    const events = attrs.filter(a => /^on(Click|DoubleClick|KeyDown|Submit)$/.test(a.name.text));
    for (const event of events.filter(referencesBlocked)) {
      const disabled = attrs.find(a => a.name.text === 'disabled')?.getText(ast).includes('LEGACY_READONLY');
      const removedHandler = /LEGACY_READONLY\s*\?\s*undefined/.test(event.getText(ast));
      let hidden = false;
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isJsxExpression(parent) && parent.expression?.getText(ast).startsWith('!LEGACY_READONLY &&')) hidden = true;
      }
      const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
      assert.ok(disabled || removedHandler || hidden, `${file}:${line} exposes ${event.getText(ast)}`);
    }
  });
});

test('read-only notice and important browsing controls remain present', () => {
  assert.match(read('src/LegacyRoot.tsx'), /role="status">\{LEGACY_READONLY_NOTICE\}/);
  assert.match(read('src/legacyReadonly.ts'), /LEGACY_READONLY = true/);
  const feed = read('src/screens/FeedScreen.tsx');
  assert.match(feed, /fetchWeeklyBoss\(key\)/);
  assert.doesNotMatch(feed, /fetchOrCreateWeeklyBoss/);
  assert.match(feed, /onClick=\{\(\) => setCommentExpanded/);
  assert.match(feed, /onClick=\{\(\) => setLightboxImage/);
  assert.doesNotMatch(read('src/screens/ProfileScreen.tsx'), /markNotificationsRead/);
  assert.match(read('src/screens/CommunityScreen.tsx'), /onClick=\{\(\) => openDetail\(post\)/);
  assert.match(read('src/screens/ProfileScreen.tsx'), /fetchMyAllEntries\(userId\)/);
});

test('legacy invitation effects do not consume pending invitations', () => {
  const app = read('src/LegacyApp.tsx');
  for (const key of ['duo', 'mutual', 'circle']) {
    assert.match(app, new RegExp(`if \\(LEGACY_READONLY \\|\\| !nickname\\) return;[\\s\\S]*?localStorage.getItem\\('savelog_pending_${key}'\\)`));
  }
});


test('frozen Toss login never sends oldUserId to the service-role endpoint', async () => {
  const ast = parse('src/LegacyApp.tsx');
  let login;
  walk(ast, node => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'handleTossLogin') login = node;
  });
  assert.ok(login);
  const requests = [];
  const errors = [];
  const code = ts.transpileModule(login.getText(ast), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({
    LEGACY_READONLY: true, loginLoading: false, userId: 'old-owner',
    SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'test',
    appLogin: async () => ({ authorizationCode: 'code', referrer: 'DEFAULT' }),
    fetch: async (url, options) => { requests.push({ url, ...options }); return { ok: true, json: async () => ({ userKey: 42 }) }; },
    setLoginLoading() {}, setLoginError(error) { if (error) errors.push(error); },
    setUserKeyStorage() {}, setAnonymousKey() {}, setTossLinked() {},
    localStorage: { setItem() {} }, console,
  });
  await vm.runInContext(code + ';handleTossLogin()', context);
  assert.deepEqual(errors, []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://test.invalid/functions/v1/toss-login');
  const body = JSON.parse(requests[0].body);
  assert.equal(Object.hasOwn(body, 'oldUserId'), false);
  assert.deepEqual(body, { authorizationCode: 'code', referrer: 'DEFAULT' });
});

test('archive without a circle stays on the readable feed and hides onboarding', () => {
  const feed = read('src/screens/FeedScreen.tsx');
  assert.match(feed, /if \(LEGACY_READONLY && !myCircle\) \{ setFeedTab\('all'\); return; \}/);
  assert.match(feed, /!LEGACY_READONLY && feedTab === 'all' && circleLoaded && !myCircle/);
  assert.match(feed, /!LEGACY_READONLY && \(<div[^>]*>[\s\S]*?짠 서클/);
  for (const copy of ['첫 자백을 남겨보세요', '한 줄이면 절약 요정이', '오늘 첫 기록을 남기거나']) assert.ok(!feed.includes(copy));
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.ok(!profile.includes('팔로우해 보세요'));
  assert.ok(!profile.includes('피드에서 책갈피를 누르면'));
  assert.match(read('src/screens/RankScreen.tsx'), /LEGACY_READONLY \? '예전 기록으로 계산한 점수예요'/);
});
