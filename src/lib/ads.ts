import { loadFullScreenAd, showFullScreenAd, TossAds } from '@apps-in-toss/web-framework';

const INTERSTITIAL_AD_ID = 'ait.v2.live.053f92000a934368';
// 배너 광고 그룹 ID
export const BANNER_AD_ID = 'ait.v2.live.65961476dd6544a3';       // 리스트형 배너 (홈)
export const FEED_BANNER_AD_ID = 'ait.v2.live.da678a1789cb4454';  // 이미지(피드형) 배너

const IS_AIT = (import.meta.env.VITE_PLATFORM ?? 'ait') === 'ait';

// 토스 웹뷰 밖(일반 브라우저)에서는 isSupported 호출 자체가 throw — 안전 래퍼
function supported(fn: { isSupported: () => boolean }): boolean {
  try { return fn.isSupported(); } catch { return false; }
}

let bannerInitialized = false;
let bannerInitializing = false;

export function initBannerAds() {
  if (!IS_AIT || !supported(TossAds.initialize)) return;
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

export function preloadInterstitial() {
  if (!IS_AIT || !supported(loadFullScreenAd) || interstitialLoaded || interstitialLoading) return;
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
  if (!IS_AIT || !supported(showFullScreenAd) || !interstitialLoaded) {
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
