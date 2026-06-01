const DAILY_PROMO = import.meta.env.VITE_DAILY_PROMO_CODE ?? 'TEST_01KT1WCAF6DRYGEKQFXVA48DPZ';
const RANK_PROMO  = import.meta.env.VITE_RANK_PROMO_CODE  ?? 'PLACEHOLDER_RANK';

const IS_AIT = (import.meta.env.VITE_PLATFORM ?? 'ait') === 'ait';

interface AitModule {
  grantPromotionReward?: (params: {
    params: { promotionCode: string; amount: number };
  }) => Promise<unknown>;
  generateHapticFeedback?: (params: { type: 'success' | 'error' | 'warning' }) => Promise<void>;
}

let ait: AitModule | null = null;

export async function initAit(): Promise<void> {
  if (!IS_AIT) return;
  try {
    const m = await import('@apps-in-toss/web-framework');
    ait = m as unknown as AitModule;
  } catch {
    console.warn('[TossPoint] AIT framework load failed');
  }
}

async function grant(promoCode: string, amount: number): Promise<boolean> {
  const isPlaceholder = promoCode.startsWith('PLACEHOLDER');
  if (isPlaceholder) {
    console.log(`[TossPoint] test – would grant ${amount}p via ${promoCode}`);
    return true;
  }
  if (!ait?.grantPromotionReward) return false;
  try {
    const result = await ait.grantPromotionReward({
      params: { promotionCode: promoCode, amount },
    });
    const ok = result != null && typeof result === 'object' && 'key' in result;
    if (ok) ait.generateHapticFeedback?.({ type: 'success' }).catch(() => {});
    return ok;
  } catch {
    return false;
  }
}

// 주간 순위 리워드
export async function grantRankReward(amount: number): Promise<boolean> {
  return grant(RANK_PROMO, amount);
}

// 펜딩 포인트 일괄 지급 (광고 시청 후)
export async function grantPendingReward(amount: number): Promise<boolean> {
  return grant(DAILY_PROMO, amount);
}
