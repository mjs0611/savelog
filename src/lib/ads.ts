import { loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework';

const INTERSTITIAL_AD_ID = 'ait.v2.live.053f92000a934368';
const REWARD_AD_ID = 'ait.v2.live.903cd8fed5b3414d';

const IS_AIT = (import.meta.env.VITE_PLATFORM ?? 'ait') === 'ait';

let interstitialLoaded = false;
let rewardLoaded = false;

export function preloadInterstitial() {
  if (!IS_AIT || !loadFullScreenAd.isSupported()) return;
  loadFullScreenAd({
    options: { adGroupId: INTERSTITIAL_AD_ID },
    onEvent: (event) => {
      if (event.type === 'loaded') interstitialLoaded = true;
    },
    onError: (e) => console.warn('[Ad] interstitial load error', e),
  });
}

export function showInterstitial(onDismissed: () => void) {
  if (!IS_AIT || !showFullScreenAd.isSupported() || !interstitialLoaded) {
    onDismissed();
    return;
  }
  interstitialLoaded = false;
  showFullScreenAd({
    options: { adGroupId: INTERSTITIAL_AD_ID },
    onEvent: (event) => {
      if (event.type === 'dismissed' || event.type === 'failedToShow') {
        onDismissed();
        preloadInterstitial();
      }
    },
    onError: (e) => {
      console.warn('[Ad] interstitial show error', e);
      onDismissed();
    },
  });
}

export function preloadReward() {
  if (!IS_AIT || !loadFullScreenAd.isSupported()) return;
  loadFullScreenAd({
    options: { adGroupId: REWARD_AD_ID },
    onEvent: (event) => {
      if (event.type === 'loaded') rewardLoaded = true;
    },
    onError: (e) => console.warn('[Ad] reward load error', e),
  });
}

export function showReward(onEarned: () => void, onSkipped?: () => void) {
  if (!IS_AIT || !showFullScreenAd.isSupported() || !rewardLoaded) {
    // 개발 환경 또는 미지원 환경: 바로 보상 지급
    onEarned();
    return;
  }
  rewardLoaded = false;
  let earned = false;
  showFullScreenAd({
    options: { adGroupId: REWARD_AD_ID },
    onEvent: (event) => {
      if (event.type === 'userEarnedReward') {
        earned = true;
        onEarned();
      }
      if (event.type === 'dismissed') {
        if (!earned) onSkipped?.();
        preloadReward();
      }
      if (event.type === 'failedToShow') {
        onSkipped?.();
        preloadReward();
      }
    },
    onError: (e) => {
      console.warn('[Ad] reward show error', e);
      onSkipped?.();
    },
  });
}
