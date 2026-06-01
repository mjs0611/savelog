const DAILY_PROMO  = import.meta.env.VITE_DAILY_PROMO_CODE  ?? '01KT1WCAF6DRYGEKQFXVA48DPZ';
const RANK_PROMO   = import.meta.env.VITE_RANK_PROMO_CODE   ?? '01KSJNKQYZKXM8M7FTB3B601J2';
const FEED_PROMO   = import.meta.env.VITE_FEED_PROMO_CODE   ?? '01KSJNZP5GB4PZAQ6HZ5BK65VS';
const STREAK_PROMO = import.meta.env.VITE_STREAK_PROMO_CODE ?? '01KSJNJ16PG8SPY1JVRXYV9P5M';

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

// 게시글 반응 리워드 (직접 지급)
export async function grantFeedReward(amount: number): Promise<boolean> {
  return grant(FEED_PROMO, amount);
}

// 연속 기록 달성 리워드 (직접 지급)
export async function grantStreakReward(amount: number): Promise<boolean> {
  return grant(STREAK_PROMO, amount);
}

// 펜딩 포인트 일괄 지급 (소비기록/밸런스 투표 → 광고 시청 후)
export async function grantPendingReward(amount: number): Promise<boolean> {
  return grant(DAILY_PROMO, amount);
}
