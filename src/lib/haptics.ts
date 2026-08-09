// 햅틱 피드백 — 의미 있는 순간에만 (도장 압인·저금통 충전·기록 완료). 과용하면 사용자가 전부 무시하게 된다.
// 시각 효과와 같은 프레임에 호출할 것 (인과·조화). 미지원 환경은 조용히 무시.
// 햅틱 그래머: basicMedium=도장 압인 / softMedium=기록 완료(영수증 쾅) / tickMedium~basicMedium=저금통 무게 / success=지급
export type HapticKind =
  | 'tap' | 'success' | 'error' | 'confetti' | 'wiggle'
  | 'tickWeak' | 'tickMedium' | 'softMedium' | 'basicWeak' | 'basicMedium';

let fw: Promise<typeof import('@apps-in-toss/web-framework')> | null = null;

export function haptic(type: HapticKind = 'tap'): void {
  (fw ??= import('@apps-in-toss/web-framework'))
    .then(m => { void m.generateHapticFeedback({ type }); })
    .catch(() => { fw = null; /* 웹 미리보기 등 미지원 환경 */ });
}

// 돈의 무게 — 저금통 충전액이 클수록 촉각도 무겁다 (동전 < 지폐 < 뭉치)
export function hapticForAmount(krw: number): void {
  if (krw <= 0) return;
  haptic(krw < 5000 ? 'tickMedium' : krw < 30000 ? 'basicWeak' : 'basicMedium');
}
