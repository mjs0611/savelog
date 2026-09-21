// Run against a production preview. No production database writes are allowed.
// PLAYWRIGHT_MODULE_PATH may point to an existing Playwright installation.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.JOURNAL_TEST_URL || 'http://127.0.0.1:5188';
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
const key = 'savelog_personal_journal_v1';
const results = [];
const captures = new URL('../.impeccable/review/', import.meta.url).pathname;
await mkdir(captures, { recursive: true });
const contexts = [];
async function newPage(width = 390, initial) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'America/Los_Angeles', reducedMotion: 'reduce' });
  contexts.push(context);
  const requests = [];
  context.on('request', request => { if (/\/rest\/v1\/|\/functions\/v1\//.test(request.url())) requests.push(request.method()); });
  await context.route('**/rest/v1/**', route => route.fulfill({ status: ['GET', 'HEAD'].includes(route.request().method()) ? 200 : 403, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' }));
  await context.route('**/functions/v1/**', route => route.fulfill({ status: 403, body: 'No live function calls during QA' }));
  if (initial) await context.addInitScript(({ key, initial }) => { localStorage.setItem(key, initial); }, { key, initial });
  const page = await context.newPage();
  page.auditRequests = requests;
  await page.clock.install({ time: new Date('2026-09-08T03:00:00Z') });
  await page.goto(base);
  await page.getByRole('heading', { name: '오늘, 어떻게 썼나요?' }).waitFor();
  return page;
}
try {
  const page = await newPage();
  await page.getByRole('button', { name: '돈을 썼어요' }).click();
  await page.getByRole('button', { name: '소비 기록하기', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '1원부터' }).waitFor();
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  await page.getByLabel('오늘 쓴 총액').fill('12000');
  await page.getByLabel('한 줄 메모').fill('브라우저 테스트용 점심');
  await page.getByRole('button', { name: '소비 기록하기', exact: true }).click();
  await page.getByRole('heading', { name: '오늘을 남겼어요.' }).waitFor();
  assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).entries[0].amount, 12000);
  results.push('fresh arrival → spend → validation → local save');
  await page.getByRole('button', { name: '수정하기' }).click();
  await page.getByLabel('오늘 쓴 총액').fill('15000');
  await page.getByRole('button', { name: '수정한 내용 저장' }).click();
  await page.reload();
  await page.getByRole('heading', { name: '오늘을 남겼어요.' }).waitFor();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(saved.entries.length, 1); assert.equal(saved.entries[0].amount, 15000);
  results.push('edit replaces total; refresh restores without login');
  await page.getByRole('button', { name: '수정하기' }).click();
  await page.getByRole('button', { name: '안 썼어요' }).click();
  await page.getByRole('button', { name: '수정한 내용 저장' }).click();
  await page.getByRole('button', { name: '9월 7일 월요일, 기록 없음' }).click();
  await page.getByRole('button', { name: '돈을 썼어요' }).click();
  await page.getByLabel('이날 쓴 총액').fill('1500');
  await page.getByRole('button', { name: '소비 기록하기', exact: true }).click();
  assert.match(await page.locator('.journal-week-summary').innerText(), /1,500원/);
  assert.match(await page.locator('.journal-week-summary').innerText(), /무지출은 1일/);
  results.push('0원 and missing dates remain distinct; real weekly sum');
  await page.getByRole('button', { name: '오늘', exact: true }).click();
  await page.getByRole('heading', { name: '오늘을 남겼어요.' }).waitFor();
  assert.match(await page.locator('.journal-date-line').innerText(), /9월 8일/);
  results.push('Today navigation returns from a historical day to current KST date');
  await page.getByRole('button', { name: '내 기록', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '백업 내보내기' }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^savelog-2026-09-08.json$/);
  assert.equal(JSON.parse(await page.getByLabel('파일 저장이 안 되면').inputValue()).entries.length, 2);
  await page.getByLabel('세이브로그 백업 파일').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, entries: [
    { date: '2026-09-08', amount: 9999, note: '', updatedAt: '2026-09-08T00:00:00Z' },
    { date: '2026-08-31', amount: 2000, note: '복원 테스트', updatedAt: '2026-09-08T00:00:00Z' },
  ] })) });
  await page.getByRole('status').filter({ hasText: '1일의 기록을 가져왔어요' }).waitFor();
  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  assert.equal(restored.entries.length, 3); assert.equal(restored.entries[0].amount, 0);
  await page.getByLabel('세이브로그 백업 파일').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":999}') });
  await page.getByRole('status').filter({ hasText: '올바른 세이브로그' }).waitFor();
  assert.equal((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).entries.length, 3);
  results.push('backup download / fallback text / safe merge / invalid backup rejection');
  assert.equal(page.auditRequests.length, 0);
  results.push('personal flow sends no Supabase reads or writes');

  const quota = await newPage();
  await quota.evaluate(() => { Storage.prototype.setItem = function() { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await quota.getByRole('button', { name: '안 썼어요' }).click();
  await quota.getByRole('button', { name: '0원으로 기록하기' }).click();
  await quota.getByRole('alert').filter({ hasText: '저장하지 못했어요' }).waitFor();
  assert.equal(await quota.evaluate(key => localStorage.getItem(key), key), null);
  results.push('quota failure keeps editor and reports failure');

  const corrupt = await newPage(390, '{broken');
  await corrupt.getByRole('alert').filter({ hasText: '기존 기록은 덮어쓰지 않아요' }).waitFor();
  assert.equal(await corrupt.getByRole('button', { name: '안 썼어요' }).isDisabled(), true);
  assert.equal(await corrupt.evaluate(key => localStorage.getItem(key), key), '{broken');
  results.push('corrupt saved data remains untouched');

  const midnight = await newPage();
  await midnight.getByRole('button', { name: '돈을 썼어요' }).click();
  await midnight.getByLabel('오늘 쓴 총액').fill('3000');
  await midnight.getByRole('button', { name: '9월 7일 월요일, 기록 없음' }).click();
  await midnight.getByRole('alert').filter({ hasText: '아직 저장하지 않은' }).waitFor();
  await midnight.getByRole('button', { name: '계속 작성하기' }).click();
  await midnight.clock.setSystemTime(new Date('2026-09-08T15:00:01Z'));
  await midnight.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await midnight.getByLabel('이날 쓴 총액').waitFor();
  assert.equal(await midnight.getByLabel('이날 쓴 총액').inputValue(), '3000');
  await midnight.getByRole('button', { name: '소비 기록하기', exact: true }).click();
  assert.equal((await midnight.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).entries[0].date, '2026-09-08');
  results.push('date switch guards unsaved input; midnight preserves original draft date');

  for (const [width, name] of [[320, 'small'], [390, 'mobile'], [1440, 'desktop']]) {
    const capture = await newPage(width);
    if (width === 1440) await capture.setViewportSize({ width, height: 1000 });
    await capture.screenshot({ path: captures + name + '.png', fullPage: true });
    assert.ok(await capture.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px horizontal overflow`);
    if (width === 390) {
      await capture.getByRole('button', { name: '안 썼어요' }).click();
      await capture.getByRole('button', { name: '0원으로 기록하기' }).click();
      await capture.clock.fastForward(5100);
      await capture.screenshot({ path: captures + 'saved.png', fullPage: true });
      await capture.getByRole('button', { name: '내 기록', exact: true }).click();
      await capture.screenshot({ path: captures + 'history.png', fullPage: true });
    }
  }
  results.push('320 / 390 / 1440px screenshots and overflow checks');

  const legacy = await newPage();
  await legacy.getByRole('link', { name: '기존 공개 기록' }).click();
  await legacy.getByRole('link', { name: '개인 소비 기록으로 돌아가기' }).waitFor();
  await legacy.getByRole('button', { name: '토스로 시작하기' }).waitFor();
  assert.equal(await legacy.getByText('기록과 포인트를 잃지 않게').count(), 0);
  await legacy.getByRole('link', { name: '개인 소비 기록으로 돌아가기' }).click();
  await legacy.getByRole('heading', { name: '오늘, 어떻게 썼나요?' }).waitFor();
  results.push('production legacy login and return; new user is not labelled migration');
  // Existing accounts with unclaimed balances must retain their data without payout CTAs.
  const former = await newPage();
  await former.context().route('**/rest/v1/users?**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user_key: 12345 }) }));
  await former.evaluate(() => {
    localStorage.setItem('savelog_user_key', '12345');
    localStorage.setItem('savelog_toss_linked', 'true');
    localStorage.setItem('savelog_nickname', '회귀검증');
    localStorage.setItem('savelog_pending_points', '47');
    localStorage.setItem('savelog_rank_claimed_2026-W36', 'true');
  });
  await former.goto(base + '/feed');
  await former.getByRole('button', { name: '마이 ›', exact: true }).waitFor();
  assert.equal(await former.locator('.feed-point-chip').count(), 0);
  await former.goto(base + '/mylog');
  await former.getByRole('button', { name: '주간 랭킹', exact: true }).waitFor();
  await former.getByRole('button', { name: '꾸미기', exact: true }).waitFor();
  assert.equal(await former.getByText('토스포인트', { exact: true }).count(), 0);
  await former.getByRole('button', { name: '주간 랭킹', exact: true }).click();
  await former.getByText('savelog 하이브리드 점수제', { exact: false }).waitFor();
  assert.equal(await former.locator('.rank-reward-btn, .reward-info-card').count(), 0);
  assert.equal(await former.getByText(/원 리워드|광고 보고.*원|전원 보상이/).count(), 0);
  assert.deepEqual(await former.evaluate(() => [localStorage.getItem('savelog_pending_points'), localStorage.getItem('savelog_rank_claimed_2026-W36')]), ['47', 'true']);
  results.push('legacy feed/profile/rank retain records and jelly access without payout; historical balance untouched');
  console.log(JSON.stringify({ passed: results.length, checks: results, captures }, null, 2));
} finally { await Promise.all(contexts.map(c => c.close())); await browser.close(); }
