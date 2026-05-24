const DAILY_PROMO   = import.meta.env.VITE_DAILY_PROMO_CODE  ?? 'PLACEHOLDER_DAILY';
const STREAK_PROMO  = import.meta.env.VITE_STREAK_PROMO_CODE ?? 'PLACEHOLDER_STREAK';
const RANK_PROMO    = import.meta.env.VITE_RANK_PROMO_CODE   ?? 'PLACEHOLDER_RANK';

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

// 매일 기록 3원
export async function grantDailyPoint(): Promise<boolean> {
  return grant(DAILY_PROMO, 3);
}

// 연속 기록 완주 보너스 (7일 +20원)
export async function grantStreakBonus(): Promise<boolean> {
  return grant(STREAK_PROMO, 20);
}

// 주간 순위 리워드
export async function grantRankReward(amount: number): Promise<boolean> {
  return grant(RANK_PROMO, amount);
}
