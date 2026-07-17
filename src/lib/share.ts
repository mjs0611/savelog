// ── 외부 공유 (바이럴 루프) ──────────────────────────────────────────────────
// 네이티브 공유 시트(share)로 앱 딥링크를 함께 내보내, 받은 사람이 한 번에
// savelog로 진입하게 한다. 링크 생성/공유 실패 시 클립보드 복사로 폴백.
import { share, getTossShareLink, contactsViral } from '@apps-in-toss/web-framework';

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

// ── 토스 연락처 초대 (contactsViral) ─────────────────────────────────────────
// 실제로 발송된 초대 수만큼 모달이 닫힐 때 onInvited(count) 콜백(보상 지급 지점).
// 모듈 오픈 직후 브릿지가 과거 sendViral 이벤트를 재생하는 경우가 있어(모달이 뜨기도
// 전에 "초대 완료" 토스트가 뜨는 문제), 오픈 후 유예 시간 내 이벤트는 무시한다.
// 모달이 떠 있는 동안 토스트는 가려져 보이지 않으므로 보상 통지도 close 시점으로 미룬다.
const CONTACTS_VIRAL_MODULE_ID = 'f92f08bb-0044-4762-bbdd-25d8458a1a07';
const SEND_VIRAL_GRACE_MS = 1200;
let contactsInviteActive = false;

export function openContactsInvite(onInvited?: (count: number) => void): void {
  if (contactsInviteActive) return;
  contactsInviteActive = true;
  const openedAt = Date.now();
  let sentCount = 0;
  let cleanup: (() => void) | null = null;
  const done = () => { contactsInviteActive = false; cleanup?.(); cleanup = null; };
  try {
    cleanup = contactsViral({
      options: { moduleId: CONTACTS_VIRAL_MODULE_ID },
      onEvent: (event) => {
        if (event.type === 'sendViral') {
          if (Date.now() - openedAt > SEND_VIRAL_GRACE_MS) sentCount += 1;
        } else if (event.type === 'close') {
          if (sentCount > 0) onInvited?.(sentCount);
          done();
        }
      },
      onError: () => {
        if (sentCount > 0) onInvited?.(sentCount);
        done();
      },
    });
  } catch {
    done();
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
    `너의 이번 주는 어땠어? 같이 기록해 보자 👇`,
  ].join('\n');
}

export function buildTempBragMessage(temperature: number): string {
  return [
    `🌡️ 오늘 내 절약 온도 ${temperature}도!`,
    `${gaugeBar(temperature)}`,
    `안 쓴 만큼 뜨거워지는 지갑 수비력, 너도 재 볼래? 👇`,
  ].join('\n');
}
