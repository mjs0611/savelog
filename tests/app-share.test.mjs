import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('app share uses a plain link with an https OG image and no reward copy', () => {
  const share = read('src/lib/share.ts');
  const og = share.match(/APP_SHARE_OG_IMAGE = '([^']+)'/)?.[1];
  const message = share.match(/APP_SHARE_MESSAGE = '([^']+)'/)?.[1];
  assert.match(og, /^https:\/\/.+\/og\/savelog\/.+\.png$/);
  assert.ok(read('index.html').includes(`content="${og}"`), 'index.html og:image matches the share image');
  assert.doesNotMatch(message, /보호권|포인트|보상|받기|리워드|적립/);
  assert.match(share, /shareExternal\(APP_SHARE_MESSAGE, undefined, APP_SHARE_OG_IMAGE\)/);
  assert.doesNotMatch(share, /contactsViral|openContactsInvite|moduleId/);
});

test('former share-reward menu slot now opens the plain app share', () => {
  const profile = read('src/screens/ProfileScreen.tsx');
  assert.match(profile, /shareApp\('legacy_settings'\)[\s\S]{0,200}친구에게 세이브로그 알려주기/);
  assert.doesNotMatch(profile, /스트릭 보호권 받기|openContactsInvite|onShieldEarned/);
});
