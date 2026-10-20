// ── 외부 공유 (바이럴 루프) ──────────────────────────────────────────────────
// 네이티브 공유 시트(share)로 앱 딥링크를 함께 내보내, 받은 사람이 한 번에
// savelog로 진입하게 한다. 링크 생성/공유 실패 시 클립보드 복사로 폴백.
import { share, getTossShareLink } from '@apps-in-toss/web-framework';

const APP_SCHEME = 'intoss://savelog';

// deepLinkQuery 예: 'room=AB12CD&rn=우리집짠테크' (인코딩된 쿼리스트링)
export async function shareExternal(message: string, deepLinkQuery?: string): Promise<boolean> {
  const rawLink = deepLinkQuery ? `${APP_SCHEME}?${deepLinkQuery}` : APP_SCHEME;
  let link = rawLink;
  try {
    link = await getTossShareLink(rawLink);
  } catch { /* 공유 링크 발급 실패 시 raw 딥링크 사용 */ }
  const full = `${message}\n${link}`;
  try {
    await share({ message: full });
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(full);
      return true;
    } catch {
      return false;
    }
  }
}

// ── 메시지 빌더 ──────────────────────────────────────────────────────────────

export function buildCircleInviteMessage(myNickname: string, circleName: string, code: string): string {
  return [
    `${myNickname}: 우리 거지방 팠다 💸`,
    `「${circleName}」 서로 오늘 얼마 썼는지 보고 판정하는 방. 들어와서 쓴 거 자백해`,
    `초대 코드: ${code}`,
  ].join('\n');
}

export function buildDuoInviteMessage(myNickname: string): string {
  return [
    `${myNickname}님이 머니 듀오를 신청했어요 💞`,
    `둘 다 매일 기록하면 공동 불꽃🔥이 자라고, 한 명이 빼먹으면 꺼져요.`,
    `자신 있으면 수락 👇`,
  ].join('\n');
}

// 절약 게이지를 이모지 막대로 (스포일러 없는 자랑 카드)
function gaugeBar(pct: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(pct / 20)));
  return '🟩'.repeat(filled) + '⬜'.repeat(5 - filled);
}

export function buildRankBragMessage(rank: number, total: number, statLine: string): string {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🏅';
  return [
    `${medal} savelog 주간 절약 랭킹 ${rank}위 / ${total}명`,
    statLine,
    `나보다 짠내나게 아낄 수 있으면 도전해 봐 👇`,
  ].join('\n');
}

export function buildWrappedBragMessage(savedText: string, recordedDays: number, zeroDays: number, streak: number): string {
  const pct = Math.min(100, recordedDays * 15);
  return [
    `📅 이번 주 나의 절약 Wrapped`,
    `${gaugeBar(pct)}`,
    `💰 지킨 돈 ${savedText} · ✍️ ${recordedDays}일 기록 · 🌿 무지출 ${zeroDays}일${streak > 0 ? ` · 🔥 ${streak}일 연속` : ''}`,
    `너의 이번 주는 어땠어? 같이 인증해 보자 👇`,
  ].join('\n');
}

export function buildTempBragMessage(temperature: number): string {
  return [
    `🌡️ 오늘 내 절약 온도 ${temperature}도!`,
    `${gaugeBar(temperature)}`,
    `안 쓴 만큼 뜨거워지는 지갑 수비력, 너도 재 볼래? 👇`,
  ].join('\n');
}

export function buildRecordBragMessage(myNickname: string, noteText: string, isZero: boolean, amountText?: string): string {
  return [
    isZero ? `${myNickname}: 오늘 무지출 성공 🌿` : `${myNickname}: 오늘 ${amountText} 쓰고 자백했다 💸`,
    noteText ? `"${noteText}"` : '',
    `savelog에서 짠친들 판정 기다리는 중. 너도 와서 인증해 봐`,
  ].filter(Boolean).join('\n');
}
