// 공유 링크 미리보기(OG) 이미지 생성 — 앱인토스 OG 규격 1200×600 PNG.
// 사용: node scripts/generate-og.mjs  (CHROME_PATH로 크롬 경로 지정 가능)
// 결과물 og/share-1200x600.png 를 공개 버킷(og/<app>/<버전>/share.png)에 올리고 share 코드의 URL과 맞춘다.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OG = {
  "logo": "public/images/app_icon.png",
  "logoRadius": 72,
  "background": "#F3F6F2",
  "primary": "#216554",
  "primaryWeak": "#E1ECE5",
  "primaryText": "#216554",
  "tag": "나만의 소비 기록",
  "title": "세이브로그",
  "slogan": "쓴 돈만 짧게 남겨요.\n평가는 하지 않아요"
};

const chrome = process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find(p => existsSync(p));
if (!chrome) throw new Error('Chrome을 찾지 못했어요. CHROME_PATH를 지정해 주세요.');

const esc = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const logo = `data:image/png;base64,${readFileSync(join(root, OG.logo)).toString('base64')}`;
const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:600px;overflow:hidden}
body{background:${OG.background};font-family:'Pretendard','Apple SD Gothic Neo','Gothic A1','Noto Sans KR',sans-serif;color:#191F28;display:flex;align-items:center;padding:0 96px;gap:72px;position:relative}
body::after{content:'';position:absolute;left:0;right:0;bottom:0;height:16px;background:${OG.primary}}
.logo{width:300px;height:300px;flex-shrink:0;border-radius:${OG.logoRadius}px;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,.12);background:#fff}
.logo img{width:100%;height:100%;object-fit:cover;display:block}
.tag{display:inline-block;padding:10px 20px;border-radius:999px;background:${OG.primaryWeak};color:${OG.primaryText};font-size:26px;font-weight:700;letter-spacing:-.5px}
h1{font-size:84px;font-weight:800;letter-spacing:-3px;line-height:1.15;margin:22px 0 18px}
p{font-size:34px;font-weight:600;color:#4E5968;letter-spacing:-1px;line-height:1.45;word-break:keep-all;white-space:pre-line}
</style><body><div class="logo"><img src="${logo}" alt=""></div><div><span class="tag">${esc(OG.tag)}</span><h1>${esc(OG.title)}</h1><p>${esc(OG.slogan)}</p></div></body></html>`;

const work = join(tmpdir(), `og-${Date.now()}`);
mkdirSync(work, { recursive: true });
const page = join(work, 'og.html'), shot = join(work, 'og.png');
writeFileSync(page, html);
const r = spawnSync(chrome, ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,600', `--user-data-dir=${join(work, 'profile')}`, `--screenshot=${shot}`, `file://${page}`], { stdio: 'inherit' });
if (r.status !== 0 || !existsSync(shot)) throw new Error('OG 이미지를 만들지 못했어요.');
const png = readFileSync(shot);
const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
if (width !== 1200 || height !== 600) throw new Error(`OG 크기가 1200×600이 아니에요: ${width}×${height}`);
mkdirSync(join(root, 'og'), { recursive: true });
writeFileSync(join(root, 'og/share-1200x600.png'), png);
rmSync(work, { recursive: true, force: true });
console.log(`og/share-1200x600.png 생성 (${png.length} bytes, 1200×600)`);
