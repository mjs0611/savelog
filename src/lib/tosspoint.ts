import { grantPromotionReward, generateHapticFeedback } from '@apps-in-toss/web-framework';

const DAILY_PROMO = import.meta.env.VITE_DAILY_PROMO_CODE ?? '01KT1WCAF6DRYGEKQFXVA48DPZ';
const RANK_PROMO  = import.meta.env.VITE_RANK_PROMO_CODE  ?? '01KSJNKQYZKXM8M7FTB3B601J2';
const FEED_PROMO  = import.meta.env.VITE_FEED_PROMO_CODE  ?? '01KSJNZP5GB4PZAQ6HZ5BK65VS';

const IS_AIT = (import.meta.env.VITE_PLATFORM ?? 'ait') === 'ait';

// initAit()는 더 이상 필요 없음 — static import로 대체됨.
// App.tsx의 initAit() 호출은 no-op으로 유지해서 호환성 보존.
export function initAit(): void {}

async function grant(promoCode: string, amount: number): Promise<boolean> {
  if (!IS_AIT) {
    console.log(`[TossPoint] non-AIT – would grant ${amount}p via ${promoCode}`);
    return true;
  }
  const isPlaceholder = promoCode.startsWith('PLACEHOLDER');
  if (isPlaceholder) {
    console.log(`[TossPoint] test – would grant ${amount}p via ${promoCode}`);
    return true;
  }
  try {
    const result = await grantPromotionReward({ params: { promotionCode: promoCode, amount } });

    if (result == null) {
      console.warn('[TossPoint] grant returned undefined – app version too old?', { promoCode, amount });
      return false;
    }
    if (result === 'ERROR') {
      console.error('[TossPoint] grant returned ERROR (unknown error)', { promoCode, amount });
      return false;
    }
    if ('key' in result) {
      generateHapticFeedback({ type: 'success' }).catch(() => {});
      return true;
    }
    if ('errorCode' in result) {
      console.error('[TossPoint] grant failed – errorCode:', result.errorCode, result.message, { promoCode, amount });
      return false;
    }
    if ('code' in result) {
      console.error('[TossPoint] grant failed – code:', (result as { code: string }).code, { promoCode, amount });
      return false;
    }
    console.error('[TossPoint] grant unexpected result', result, { promoCode, amount });
    return false;
  } catch (err) {
    console.error('[TossPoint] grant threw exception', err, { promoCode, amount });
    return false;
  }
}

// 주간 순위 리워드
export async function grantRankReward(amount: number): Promise<boolean> {
  return grant(RANK_PROMO, amount);
}

// 게시글 반응 리워드 (직접 지급)
export async function grantFeedReward(amount: number): Promise<boolean> {
  return grant(FEED_PROMO, amount);
}

// 펜딩 포인트 일괄 지급 (소비기록/밸런스 투표/연속완주 → 광고 시청 후)
export async function grantPendingReward(amount: number): Promise<boolean> {
  return grant(DAILY_PROMO, amount);
}
