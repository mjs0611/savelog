import { loadFullScreenAd, showFullScreenAd, TossAds } from '@apps-in-toss/web-framework';

const INTERSTITIAL_AD_ID = 'ait.v2.live.053f92000a934368';
const REWARD_AD_ID = 'ait.v2.live.903cd8fed5b3414d';
// 배너 광고 그룹 ID
export const BANNER_AD_ID = 'ait.v2.live.65961476dd6544a3';       // 리스트형 배너 (홈)
export const FEED_BANNER_AD_ID = 'ait.v2.live.da678a1789cb4454';  // 이미지(피드형) 배너

const IS_AIT = (import.meta.env.VITE_PLATFORM ?? 'ait') === 'ait';

let bannerInitialized = false;
let bannerInitializing = false;

export function initBannerAds() {
  if (!IS_AIT || !TossAds.initialize.isSupported()) return;
  if (bannerInitialized || bannerInitializing) return;
  bannerInitializing = true;
  TossAds.initialize({
    callbacks: {
      onInitialized: () => { bannerInitialized = true; bannerInitializing = false; },
      onInitializationFailed: (e) => { console.warn('[BannerAd] init failed', e); bannerInitializing = false; },
    },
  });
}

export function isBannerReady() {
  return bannerInitialized;
}

let interstitialLoaded = false;
let interstitialLoading = false;
let rewardLoaded = false;
let rewardLoading = false;

export function preloadInterstitial() {
  if (!IS_AIT || !loadFullScreenAd.isSupported() || interstitialLoaded || interstitialLoading) return;
  interstitialLoading = true;
  loadFullScreenAd({
    options: { adGroupId: INTERSTITIAL_AD_ID },
    onEvent: (event) => {
      if (event.type === 'loaded') { interstitialLoaded = true; interstitialLoading = false; }
    },
    onError: (e) => { console.warn('[Ad] interstitial load error', e); interstitialLoading = false; },
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
      preloadInterstitial();
    },
  });
}

export function preloadReward() {
  if (!IS_AIT || !loadFullScreenAd.isSupported() || rewardLoaded || rewardLoading) return;
  rewardLoading = true;
  loadFullScreenAd({
    options: { adGroupId: REWARD_AD_ID },
    onEvent: (event) => {
      if (event.type === 'loaded') { rewardLoaded = true; rewardLoading = false; }
    },
    onError: (e) => { console.warn('[Ad] reward load error', e); rewardLoading = false; },
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
      preloadReward();
    },
  });
}
