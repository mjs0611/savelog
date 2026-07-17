import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@toss/tds-mobile';
import { appLogin, getAnonymousKey } from '@apps-in-toss/web-framework';
import {
  getUserId,
  getUserKey,
  setUserKey as setUserKeyStorage,
  getNickname,
  setNickname,
  generateNickname,
  loadDailyState,
  saveDailyState,
  getEffectiveStreak,
  updateStreak,
  getPersona,
  getDailyMission,
  completeDailyMission,
  setRecordedDate,
  getPendingPoints,
  addPendingPoints,
  consumePendingPoints,
  cleanupStaleKeys,
  getStreakShields,
  addStreakShield,
  getMilestonePosted,
  setMilestonePosted,
  getClaimedRankReward,
  setClaimedRankReward,
  type StreakData,
  type DailyState,
  updateJellyPocketSpent,
  addJelly,
  getIntentTrigger,
  setIntentTrigger,
  getWeeklyBudget,
  addToGoal,
  getFollowedUsers,
  saveFollowedUsers,
  addRouletteSpins,
  checkAndResetDailyPhysics,
  resolveSkeleton,
  getZeigarnikSkeletons,
  reduceBudgetEntropy,
} from './lib/storage';
import { initAit, grantPendingReward, grantRankReward } from './lib/tosspoint';
import { preloadReward, showReward, initBannerAds } from './lib/ads';
import { submitEntry, fetchWeekRank, isSupabaseConfigured, verifyUserLinked, contributeToDuo, fetchMyDuo, createDuo, ensureMutualFollow, attackWeeklyBoss, joinCircleByCode, fetchGlobalStats, type GlobalStats, type SpendingItem, type WeekRankRow } from './lib/supabase';
import { getTodayStr, getWeekKey, getPrevWeekKey, formatAmount } from './lib/utils';
import FeedScreen from './screens/FeedScreen';
import RankScreen from './screens/RankScreen';
import ProfileScreen from './screens/ProfileScreen';
import RecordScreen from './screens/RecordScreen';
import PersonaTest from './screens/PersonaTest';
import CommunityScreen from './screens/CommunityScreen';
import CustomIcon from './components/CustomIcon';
import { IconTabFeed, IconTabPlaza, IconTabMy } from './components/Icons';
import GuideModal from './components/GuideModal';

type Tab = 'feed' | 'community' | 'mylog';

// ── 딥링크 초대 파라미터 파싱 (모듈 로드 시 1회) ──────────────────────────────
// 공유 링크(intoss://savelog?room=… / ?duo=…)로 진입한 경우 pending으로 저장해 두고,
// 로그인·닉네임 설정이 끝난 뒤 자동 입장/듀오 수락 플로우가 소비한다.
try {
  const bootParams = new URLSearchParams(window.location.search);
  const bootDuo = bootParams.get('duo');
  const bootCircle = bootParams.get('circle'); // 짠 서클 초대 코드
  const bootInviter = bootParams.get('by'); // 초대자 — 자동 맞팔(짝꿍) 대상
  if (bootCircle) {
    localStorage.setItem('savelog_pending_circle', bootCircle);
  }
  if (bootDuo) {
    localStorage.setItem('savelog_pending_duo', JSON.stringify({ id: bootDuo, nick: bootParams.get('dn') || '' }));
  } else if (bootInviter) {
    // 초대 링크로 들어온 유저는 초대자와 자동 맞팔 (그래프 시딩) — duo는 수락 플로우에서 함께 처리
    localStorage.setItem('savelog_pending_mutual', JSON.stringify({ id: bootInviter, nick: bootParams.get('bn') || '' }));
  }
  if (bootDuo || bootCircle) {
    // 재실행 시 중복 트리거 방지를 위해 주소에서 파라미터 제거
    window.history.replaceState(null, '', window.location.pathname);
  }
} catch { /* URL 파싱 실패는 무시 */ }

const TAB_ICONS: Record<Tab, React.ComponentType<{ size?: number; filled?: boolean }>> = {
  feed: IconTabFeed,
  community: IconTabPlaza,
  mylog: IconTabMy,
};
const TABS: { key: Tab; label: string }[] = [
  { key: 'feed', label: '피드' },
  { key: 'community', label: '광장' },
  { key: 'mylog', label: '마이로그' },
];


export default function App() {
  const fallbackId = useRef(getUserId()).current;

  const [anonymousKey, setAnonymousKey] = useState<string | null>(() => getUserKey());
  const [tossLinked, setTossLinked] = useState(() => localStorage.getItem('savelog_toss_linked') === 'true');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const userId = anonymousKey ?? fallbackId;

  // 닉네임 관문 제거 — 없으면 임의 짠네임 자동 생성 (마이로그 설정에서 변경 가능)
  const [nickname, setNicknameState] = useState<string>(() => {
    const existing = getNickname();
    if (existing) return existing;
    const generated = generateNickname();
    setNickname(generated);
    return generated;
  });
  const [tab, setTab]           = useState<Tab>(() => {
    const path = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (path === 'chat' || path === 'community') return 'community';
    if (path === 'mylog' || path === 'profile') return 'mylog';
    return 'feed';
  });
  const [daily, setDaily]       = useState<DailyState>(() => loadDailyState(getTodayStr()));
  const [streak, setStreak]     = useState<StreakData>(() => getEffectiveStreak());
  const [weekRank, setWeekRank] = useState<WeekRankRow[]>([]);
  const [prevWeekRank, setPrevWeekRank] = useState<WeekRankRow[]>([]);
  const [rankLoading, setRankLoading] = useState(true);
  const [rankLoadFailed, setRankLoadFailed] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [showZeroNote, setShowZeroNote] = useState(false);
  const [zeroNoteText, setZeroNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingClaiming, setPendingClaiming] = useState(false);
  const [rankClaiming, setRankClaiming] = useState(false);
  const [showPointToast, setShowPointToast] = useState<string | null>(null);
  const [showPersonaTest, setShowPersonaTest] = useState(false);
  // 인텐트 트리거 — 온보딩 관문에서 빼서 첫 기록 완료 후 1회 모달로 (습관 장치는 유지, 장벽은 제거)
  const [showTriggerPicker, setShowTriggerPicker] = useState(false);
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [pendingPoints, setPendingPoints] = useState<number>(() => getPendingPoints());
  const [feedRefreshToken, setFeedRefreshToken] = useState(0);
  const [profileRefreshToken, setProfileRefreshToken] = useState(0);
  const [streakShields, setStreakShields] = useState<number>(() => getStreakShields());
  // 첫 실행 사용법 안내 — 온보딩 완료 후 메인 화면에서 1회 표시
  const [showFirstGuide, setShowFirstGuide] = useState<boolean>(() => {
    try { return !localStorage.getItem('savelog_seen_guide'); } catch { return false; }
  });
  function closeFirstGuide() {
    try { localStorage.setItem('savelog_seen_guide', '1'); } catch {}
    setShowFirstGuide(false);
  }
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const pendingClaimingRef = useRef(false);
  const rankClaimingRef = useRef(false);
  const rankLoadIdRef = useRef(0);

  // 키보드가 바텀시트/입력을 가리지 않도록 visualViewport 높이 차를 --kb로 노출.
  // iOS 웹뷰는 키보드가 레이아웃 뷰포트를 줄이지 않아 fixed 시트 하단이 가려진다.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${Math.round(kb)}px`);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    checkAndResetDailyPhysics(getTodayStr());
    fetchGlobalStats(getWeekKey()).then(setGlobalStats).catch(() => {});
    initAit();
    initBannerAds();
    preloadReward(); // 항상 리워드 광고 미리 로드
    loadRank();
    // 지난 주 순위 로드 (리워드 수령 판단용)
    fetchWeekRank(getPrevWeekKey()).then(data => { if (data) setPrevWeekRank(data); }).catch(() => {});
    cleanupStaleKeys();

    // 연결 끊기 후 재진입 방지 + non-numeric key 재로그인 강제
    const currentKey = getUserKey();
    const isLinked = localStorage.getItem('savelog_toss_linked') === 'true';
    if (currentKey && isLinked) {
      const numericKey = Number(currentKey);
      if (isNaN(numericKey) || numericKey === 0) {
        // non-numeric = proper Toss login 미완료 → 재로그인 강제
        localStorage.removeItem('savelog_toss_linked');
        setTossLinked(false);
      } else {
        // numeric = users 테이블 검증
        verifyUserLinked(currentKey).then(valid => {
          if (!valid) {
            localStorage.removeItem('savelog_user_key');
            localStorage.removeItem('savelog_toss_linked');
            setAnonymousKey(null);
            setTossLinked(false);
          }
        }).catch(() => {});
      }
    }
  }, []);

  // 자정 넘어 앱으로 돌아올 때 daily 상태 갱신 (날짜 staleness 방지)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        const currentDay = getTodayStr();
        checkAndResetDailyPhysics(currentDay);
        setDaily(prev => prev.date !== currentDay ? loadDailyState(currentDay) : prev);
        setStreak(getEffectiveStreak());
        setStreakShields(getStreakShields());
        loadRank();
        // 주차가 바뀌었을 때 prevWeekRank도 갱신 (리워드 판단 staleness 방지)
        fetchWeekRank(getPrevWeekKey()).then(data => { if (data) setPrevWeekRank(data); }).catch(() => {});
        // 백그라운드 복귀 시 피드·프로필 갱신 (stale 데이터 방지)
        setFeedRefreshToken(t => t + 1);
        setProfileRefreshToken(t => t + 1);
        preloadReward(); // 백그라운드 복귀 시 광고 재로드
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // 듀오 초대 링크(?duo=) 수락 — 온보딩(로그인·닉네임·트리거) 완료 후 1회 처리
  useEffect(() => {
    if (!nickname) return;
    if ((!anonymousKey || !tossLinked) && import.meta.env.PROD) return;
    const raw = localStorage.getItem('savelog_pending_duo');
    if (!raw) return;
    localStorage.removeItem('savelog_pending_duo');
    (async () => {
      try {
        const { id: inviterId, nick: inviterNick } = JSON.parse(raw);
        if (!inviterId || inviterId === userId) return;
        const buddyNick = inviterNick || '짠친';
        const [mine, theirs] = await Promise.all([fetchMyDuo(userId), fetchMyDuo(inviterId)]);
        if (mine) { showToast('이미 맺어진 머니 듀오가 있어요. 해제 후 다시 수락할 수 있어요.'); return; }
        if (theirs) { showToast(`${buddyNick}님은 이미 다른 듀오가 있어요.`); return; }
        const duo = await createDuo(userId, nickname, inviterId, buddyNick);
        if (duo) {
          showToast(`💞 ${buddyNick}님과 머니 듀오를 맺었어요! 마이로그에서 확인하세요.`);
          window.dispatchEvent(new Event('savelog_duo_updated'));
          // 듀오 = 짝꿍의 정점 — 팔로우 관계도 함께 맺어 그래프 정합성 유지
          applyMutualFollow(inviterId, buddyNick, false);
        }
      } catch { /* 초대 수락 실패는 조용히 무시 */ }
    })();
  }, [nickname, anonymousKey, tossLinked, userId]);

  // 초대자와 자동 맞팔 처리 (서버 양방향 + 로컬 팔로잉 목록 반영)
  function applyMutualFollow(otherId: string, otherNick: string, withToast: boolean) {
    if (!otherId || otherId === userId) return;
    ensureMutualFollow(userId, nickname || '짠친', otherId, otherNick || '짠친').then(ok => {
      if (!ok) return;
      const followed = getFollowedUsers();
      if (!followed[otherId]) {
        saveFollowedUsers({ ...followed, [otherId]: otherNick || '짠친' });
      }
      setFeedRefreshToken(t => t + 1);
      if (withToast) showToast(`🤝 ${otherNick || '초대한 친구'}님과 짝꿍이 되었어요!`);
    }).catch(() => {});
  }

  // 톡방 초대 링크(?room=&by=)로 들어온 경우 — 초대자와 자동 맞팔 (그래프 시딩)
  useEffect(() => {
    if (!nickname) return;
    if ((!anonymousKey || !tossLinked) && import.meta.env.PROD) return;
    const raw = localStorage.getItem('savelog_pending_mutual');
    if (!raw) return;
    localStorage.removeItem('savelog_pending_mutual');
    try {
      const { id, nick } = JSON.parse(raw);
      applyMutualFollow(id, nick, true);
    } catch { /* 파싱 실패 무시 */ }
  }, [nickname, anonymousKey, tossLinked, userId]);

  // 서클 초대 링크(?circle=코드) — 온보딩 완료 후 자동 합류
  useEffect(() => {
    if (!nickname) return;
    if ((!anonymousKey || !tossLinked) && import.meta.env.PROD) return;
    const code = localStorage.getItem('savelog_pending_circle');
    if (!code) return;
    localStorage.removeItem('savelog_pending_circle');
    joinCircleByCode(code, userId, nickname).then(res => {
      if (res.ok && res.circle) {
        showToast(`🔒 서클 「${res.circle.name}」에 합류했어요!`);
        setFeedRefreshToken(t => t + 1);
      } else if (res.reason) {
        showToast(`서클 합류 실패: ${res.reason}`);
      }
    }).catch(() => {});
  }, [nickname, anonymousKey, tossLinked, userId]);

  function navigateTo(next: Tab) {
    setTab(next);
    if (next === 'feed') setFeedRefreshToken(t => t + 1);
    if (next === 'mylog') setProfileRefreshToken(t => t + 1);
    const path = '/' + next;
    window.history.replaceState(null, '', path);
  }

  async function loadRank() {
    const loadId = ++rankLoadIdRef.current;
    setRankLoading(true);
    try {
      const data = await fetchWeekRank(getWeekKey());
      if (loadId !== rankLoadIdRef.current) return; // 더 최신 요청이 진행 중 → 결과 버림
      if (data === null) {
        setRankLoadFailed(true);
        return; // 기존 데이터 유지
      }
      setRankLoadFailed(false);
      setWeekRank(data);
    } catch {
      if (loadId !== rankLoadIdRef.current) return;
      setRankLoadFailed(true);
    } finally {
      if (loadId === rankLoadIdRef.current) setRankLoading(false);
    }
  }

  // ── 토스 로그인 ─────────────────────────────────────────────────────────────
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
  const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

  async function handleTossLogin() {
    if (loginLoading) return;
    setLoginLoading(true);
    setLoginError(null);
    // Step 1: 토스 로그인 SDK (약관 동의 + 인가코드 발급)
    let authorizationCode: string;
    let referrer: string | undefined;
    try {
      const result = await appLogin();
      authorizationCode = result.authorizationCode;
      referrer = result.referrer ?? undefined;
    } catch (e) {
      console.error('[TossLogin] appLogin failed', e);
      setLoginError('토스 로그인을 완료할 수 없어요. 잠시 후 다시 시도해 주세요.');
      setLoginLoading(false);
      return;
    }

    try {
      // Step 2: Supabase Edge Function으로 토큰 교환 → userKey 획득
      const res = await fetch(`${SUPABASE_URL}/functions/v1/toss-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ authorizationCode, referrer, oldUserId: userId }),
      });
      const data = await res.json();

      if (res.ok && data.userKey) {
        // userKey를 문자열로 변환하여 기존 userId 체계와 호환
        const userKeyStr = String(data.userKey);
        setUserKeyStorage(userKeyStr);
        setAnonymousKey(userKeyStr);
        localStorage.setItem('savelog_terms_agreed', 'true');
        localStorage.setItem('savelog_toss_linked', 'true');
        setTossLinked(true);
      } else {
        // Edge Function 실패 (mTLS 등) — 사용자 차단하지 않고 anonymous fallback
        console.warn('[TossLogin] Edge Function failed, fallback to anonymous', res.status, data);
        const anonResult = await getAnonymousKey();
        if (anonResult && typeof anonResult === 'object' && anonResult.type === 'HASH') {
          if (!anonymousKey) {
            setUserKeyStorage(anonResult.hash);
            setAnonymousKey(anonResult.hash);
          }
          localStorage.setItem('savelog_terms_agreed', 'true');
          localStorage.setItem('savelog_toss_linked', 'true');
          setTossLinked(true);
        } else {
          setLoginError('로그인 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.');
        }
      }
    } catch (e) {
      console.error('[TossLogin] error', e);
      setLoginError(`네트워크 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoginLoading(false);
    }
  }

  if ((!anonymousKey || !tossLinked) && import.meta.env.PROD) {
    const isMigration = !!nickname;
    return (
      <div className="app-root">
        <div className="screen setup-screen">
          <div className="setup-hero">
            <img src="/images/savelog_main_character.png" alt="Savelog Piggy" className="setup-hero-img" />
            <h1 className="setup-title">savelog</h1>
            {isMigration ? (
              <p className="setup-desc">더 안전한 서비스 이용을 위해<br />토스 계정 연동이 필요해요</p>
            ) : (
              <p className="setup-desc">커피 한 잔 참은 것도<br />자랑이 되는 곳</p>
            )}
            {!isMigration && globalStats !== null && globalStats.totalRecords >= 30 && (
              <p className="setup-proof">지금까지 쌓인 짠 기록 {globalStats.totalRecords.toLocaleString('ko-KR')}개</p>
            )}
          </div>
          <Button size="xlarge" display="full" color="primary" variant="fill" onClick={handleTossLogin} disabled={loginLoading}>
            {loginLoading ? '연동 중...' : isMigration ? '토스 계정 연동하기' : '토스로 시작하기'}
          </Button>
          {loginError && <p className="login-error-msg">{loginError}</p>}
        </div>
      </div>
    );
  }

  function handleSubmitRecord(items: SpendingItem[], image?: string): Promise<void> {
    return handleCloseAdAndSubmit(items, image);
  }

  async function handleCloseAdAndSubmit(items: SpendingItem[], image?: string) {
    const today = getTodayStr();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    // 꿀팁·소비 고민은 소셜 포스트 — 순위·스트릭·daily 상태에서 분리
    const isSocialPost = items.some(it => it.category === '꿀팁' || it.category === '소비 고민');
    const isFirstRecord = !isSocialPost && (!daily.recorded || daily.date !== today);
    try {
      const total = items.reduce((s, i) => s + i.amount, 0);
      const weekKey = getWeekKey();
      const currentPersona = getPersona() ?? undefined;

      const entryId = await submitEntry({
        user_id: userId,
        nickname: nickname!,
        date: today,
        // 소셜 포스트는 별도 week_key로 주간 순위에서 제외
        week_key: isSocialPost ? 'social-' + weekKey : weekKey,
        items,
        total_amount: total,
        persona: currentPersona,
        image,
      });

      if (!entryId && isSupabaseConfigured) {
        showToast('기록 저장에 실패했어요. 다시 시도해 주세요.');
        return;
      }

      // 1. 젤리 저금통 예산 차감 및 몬스터 레이드 연동 (소셜 포스트 제외)
      if (!isSocialPost) {
        items.forEach(item => {
          updateJellyPocketSpent(item.category, item.amount);
        });

        const hasZero = items.some(it => it.amount === 0 && it.category !== '마일스톤');
        const hasSave = items.some(it => it.category === '절약 방어');

        // 자이가르닉 스켈레톤 과제 해소 연동
        const skeletons = getZeigarnikSkeletons();
        items.forEach(it => {
          const cat = it.category ? it.category.split('/')[0] : '';
          if (cat === '식비' && skeletons.some(s => s.id === 'sk-lunch' && s.status === 'pending')) {
            resolveSkeleton('sk-lunch');
          } else if (cat === '카페' && skeletons.some(s => s.id === 'sk-cafe' && s.status === 'pending')) {
            resolveSkeleton('sk-cafe');
          } else if (skeletons.some(s => s.id === 'sk-commute' && s.status === 'pending')) {
            resolveSkeleton('sk-commute');
          }
        });

        // 예산 엔트로피 차감 연동
        if (hasZero) {
          reduceBudgetEntropy(15);
        } else if (hasSave) {
          reduceBudgetEntropy(10);
        }
      }

      if (isSocialPost) {
        showToast('공유 완료');
      } else if (isFirstRecord) {
        // 첫 기록에만 미션·스트릭·포인트 처리
        const mission = getDailyMission(today);
        let missionCleared = false;
        if (!mission.completed) {
          if (mission.category === '기타') {
            if (total === 0) missionCleared = true;
          } else if (mission.category === '식비') {
            const foodSpend = items.filter(x => x.category === '식비').reduce((s, x) => s + x.amount, 0);
            const hasFoodRecord = items.some(x => x.category === '식비');
            if (!hasFoodRecord || foodSpend <= 5000) missionCleared = true;
          } else if (mission.category === '교통') {
            const transportSpend = items.filter(x => x.category === '교통').reduce((s, x) => s + x.amount, 0);
            const hasTransportRecord = items.some(x => x.category === '교통');
            if (!hasTransportRecord || transportSpend <= 2000) missionCleared = true;
          } else {
            const categorySpend = items.filter(x => x.category === mission.category).reduce((s, x) => s + x.amount, 0);
            const hasCategoryRecord = items.some(x => x.category === mission.category);
            if (!hasCategoryRecord || categorySpend === 0) missionCleared = true;
          }
        }
        if (missionCleared) completeDailyMission(today);

        const newStreak = updateStreak(today);
        setRecordedDate(today);
        setStreak(newStreak);

        // 7일 완주 마일스톤 자동 피드 공유
        if (newStreak.streak > 0 && newStreak.streak % 7 === 0) {
          const milestoneKey = `${weekKey}-streak${newStreak.streak}`;
          if (!getMilestonePosted(milestoneKey)) {
            setMilestonePosted(milestoneKey);
            submitEntry({
              user_id: userId,
              nickname: nickname!,
              date: today,
              week_key: 'milestone-' + weekKey,
              items: [{ category: '마일스톤', emoji: '🏆', amount: 0, comment: `${newStreak.streak}일 연속 기록 중! 작은 습관이 단단해지고 있어요 🌿` }],
              total_amount: 0,
              persona: currentPersona,
            }).catch(() => {});
          }
        }

        // 포인트는 글 올리기(매일 첫 기록)에만 지급 — 연속 출석 보너스 없음
        const totalEarn = 3;
        const prevPending = getPendingPoints();
        const newPending = addPendingPoints(totalEarn);
        const actualEarned = newPending - prevPending;
        setPendingPoints(newPending);
        if (newPending > 0) preloadReward();

        // 젤리 지급 (기본 10 젤리, 무지출 10 젤리 추가, 미션 달성 15 젤리 추가)
        let jellyReward = 10;
        if (total === 0) jellyReward += 10;
        if (missionCleared) jellyReward += 15;
        addJelly(jellyReward);

        // 안 쓴 돈을 목표 게이지로 충전 — 하루 예산 대비 아낀 만큼 + 명시적 절약 방어액
        // (구 엔트로피 50% 감쇄 페널티는 제거 — 보이지 않는 메커니즘으로 벌주지 않는다. 개념 다이어트)
        const dailyBudget = Math.round(getWeeklyBudget() / 7);
        const savedFromBudget = Math.max(0, dailyBudget - total);
        const savedFromDefense = items.reduce((s, it) => s + (it.saved_amount ?? 0), 0);
        const chargedToGoal = addToGoal(savedFromBudget + savedFromDefense);

        // 머니 듀오 공동 목표에도 기여 + 공동 스트릭 갱신 (활성 듀오가 있을 때만)
        contributeToDuo(userId, savedFromBudget + savedFromDefense, today).catch(() => {});

        // 🎰 룰렛권 지급 — 기록 1회=1장, 무지출이면 2장 (가변 보상 훅)
        const spinsEarned = total === 0 ? 2 : 1;
        addRouletteSpins(spinsEarned);

        // 🐲 서클 주간 보스 공격 — 하루 첫 기록만 유효 (도배 방지). 무지출 30 / 절약방어 20 / 기록 10
        // 보스는 서클 단위 이벤트 (FeedScreen이 서클 로드 시 circle_id를 localStorage에 동기화)
        const bossCircleId = localStorage.getItem('savelog_circle_id');
        if (bossCircleId) {
          const bossDamage = total === 0 ? 30 : items.some(it => it.category === '절약 방어') ? 20 : 10;
          attackWeeklyBoss(`${weekKey}__c__${bossCircleId}`, bossDamage).catch(() => {});
        }

        const goalMsg = chargedToGoal > 0 ? ` · 🎯 목표에 ${formatAmount(chargedToGoal)} 충전` : '';
        const toastMsg = actualEarned > 0
          ? `기록 완료. ${actualEarned}원 대기 중 · 젤리 +${jellyReward} · 룰렛권 +${spinsEarned}${goalMsg}`
          : `기록 완료. 젤리 +${jellyReward} · 룰렛권 +${spinsEarned}${goalMsg}`;
        showToast(toastMsg);

        // 습관 트리거 — 관문 대신 첫 기록의 성공 직후에 1회 제안 (거절 가능)
        if (!getIntentTrigger()) setShowTriggerPicker(true);
      } else {
        showToast('추가 기록 완료');
      }

      // 소셜 포스트는 daily 상태 갱신 불필요 (오늘 기록 여부·지출액 변화 없음)
      if (!isSocialPost) {
        const prevSpent = (daily.date === today ? daily.spentAmount : 0) ?? 0;
        const newDaily: DailyState = { date: today, recorded: true, pointGranted: true, entryId, spentAmount: prevSpent + total };
        saveDailyState(newDaily);
        setDaily(newDaily);
        loadRank();
      }
      setFeedRefreshToken(t => t + 1);
      setProfileRefreshToken(t => t + 1);
      setShowRecord(false);
      setShowZeroNote(false);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleClaimPending() {
    if (pendingPoints <= 0 || pendingClaimingRef.current) return;
    pendingClaimingRef.current = true;
    setPendingClaiming(true);
    const amount = pendingPoints;
    showReward(async () => {
      try {
        const ok = await grantPendingReward(amount);
        if (!ok) {
          showToast('포인트 지급에 실패했어요. 잠시 후 다시 시도해 주세요.');
          return;
        }
        // 광고 시청 중 추가 적립된 포인트를 보존하기 위해 청구한 금액만 차감
        const remaining = consumePendingPoints(amount);
        setPendingPoints(remaining);
        showToast(`🎁 ${amount}원 지급 완료!`);
      } finally {
        pendingClaimingRef.current = false;
        setPendingClaiming(false);
      }
    }, () => {
      pendingClaimingRef.current = false;
      setPendingClaiming(false);
      showToast('광고를 끝까지 시청해야 포인트를 받을 수 있어요');
    });
  }

  function handleClaimRankReward(amount: number) {
    const weekKey = getPrevWeekKey(); // 리워드는 지난 주 성적 기준
    if (getClaimedRankReward(weekKey) || rankClaimingRef.current) return;
    rankClaimingRef.current = true;
    setRankClaiming(true);
    showReward(async () => {
      try {
        const ok = await grantRankReward(amount);
        if (!ok) {
          showToast('리워드 지급에 실패했어요. 잠시 후 다시 시도해 주세요.');
          return;
        }
        setClaimedRankReward(weekKey);
        showToast(`🏆 주간 리워드 ${amount}원 지급 완료!`);
      } finally {
        rankClaimingRef.current = false;
        setRankClaiming(false);
      }
    }, () => {
      rankClaimingRef.current = false;
      setRankClaiming(false);
      showToast('광고를 끝까지 시청해야 포인트를 받을 수 있어요');
    });
  }

  // 연락처 초대 발송 완료 시 보상 — openContactsInvite가 모달 close 시점에 실제 발송 수를 전달
  function handleFriendsInvited(count: number) {
    addStreakShield(count);
    setStreakShields(getStreakShields());
    showToast(`🛡️ 친구 ${count}명 초대 완료! 스트릭 보호권 +${count} 적립`);
  }

  function showToast(msg: string) {
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    setShowPointToast(msg);
    toastTimerRef.current = setTimeout(() => {
      setShowPointToast(null);
      toastTimerRef.current = null;
    }, 3000);
  }

  // ── 메인 앱 ─────────────────────────────────────────────────────────────────
  return (
    <div className="app-root">
      
      {/* Supabase 미설정 배너 — 개발 환경에서만 표시 */}
      {import.meta.env.DEV && !isSupabaseConfigured && (
        <div className="dev-banner">
          개발 모드 — Supabase 미연결 (목업 데이터)
        </div>
      )}

      {/* 탭 콘텐츠 — display:none으로 마운트 유지 (재요청/플리커 방지) */}
      <div className="tab-content">
        <div className={tab !== 'feed' ? 'tab-panel--hidden' : ''}>
          <FeedScreen
            userId={userId}
            refreshToken={feedRefreshToken}
            weekRank={weekRank}
            daily={daily}
            streak={streak}
            pendingPoints={pendingPoints}
            submitting={submitting}
            pendingClaiming={pendingClaiming}
            streakShields={streakShields}
            onRecord={() => setShowRecord(true)}
            onQuickRecord={handleSubmitRecord}
            onQuickZeroSpend={() => { setZeroNoteText(''); setShowZeroNote(true); }}
            onClaimPending={handleClaimPending}
            onNavigateToMyLog={() => navigateTo('mylog')}
            onShieldEarned={handleFriendsInvited}
          />
        </div>
        <div className={tab !== 'community' ? 'tab-panel--hidden' : ''}>
          {/* 광장 — 주제별 게시판 (짠톡방은 사용량 0으로 폐기, 친밀 공간은 서클이 담당) */}
          <CommunityScreen userId={userId} />
        </div>
        <div className={tab !== 'mylog' ? 'tab-panel--hidden' : ''}>
          <ProfileScreen
            userId={userId}
            nickname={nickname}
            streak={streak}
            weekRank={weekRank}
            daily={daily}
            pendingPoints={pendingPoints}
            pendingClaiming={pendingClaiming}
            onClaimPending={handleClaimPending}
            refreshToken={profileRefreshToken}
            onNicknameChange={setNicknameState}
            onStartTest={() => setShowPersonaTest(true)}
            onShieldEarned={handleFriendsInvited}
            onOpenRanking={() => { loadRank(); setShowRankingModal(true); }}
          />
        </div>
      </div>

      {/* 주간 랭킹 모달 */}
      {showRankingModal && (
        <div className="modal-overlay" onClick={() => setShowRankingModal(false)}>
          <div className="modal-sheet ranking-modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="ranking-modal-header">
              <h3 className="ranking-modal-title"><CustomIcon emoji="🏆" /> 이번 주 절약 랭킹</h3>
              <button className="ranking-modal-close" onClick={() => setShowRankingModal(false)}>✕</button>
            </div>
            <RankScreen
              userId={userId}
              weekRank={weekRank}
              prevWeekRank={prevWeekRank}
              loading={rankLoading}
              loadFailed={rankLoadFailed}
              onClaimRankReward={handleClaimRankReward}
              claimedThisWeek={getClaimedRankReward(getPrevWeekKey())}
              rankClaiming={rankClaiming}
              onRetry={loadRank}
            />
          </div>
        </div>
      )}

      {/* 하단 탭바 */}
      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'tab-btn--active bottom-nav-item--active' : ''}`}
            onClick={() => navigateTo(t.key)}
          >
            {(() => { const Ic = TAB_ICONS[t.key]; return <Ic size={22} filled={tab === t.key} />; })()}
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      {/* 기록 모달 */}
      {showRecord && (
        <RecordScreen
          onSubmit={handleSubmitRecord}
          onClose={() => setShowRecord(false)}
          submitting={submitting}
          isAdditional={daily.recorded && daily.date === getTodayStr()}
        />
      )}

      {/* 무지출 한마디 모달 */}
      {showZeroNote && (
        <div className="modal-overlay zero-note-modal-overlay" onClick={() => { if (!submitting) setShowZeroNote(false); }}>
          <div className="modal-sheet zero-note-modal-sheet" onClick={e => e.stopPropagation()}>
            <p className="zero-note-modal-title"><CustomIcon emoji="🌿" /> 무지출 기록하기</p>
            <p className="zero-note-modal-desc">
              오늘 어떻게 무지출을 달성했나요? 한 줄로 남겨보세요.<br />피드에 공유되어 다른 사람들과 나눌 수 있어요.
            </p>
            <textarea
              className="zero-note-textarea"
              value={zeroNoteText}
              onChange={e => setZeroNoteText(e.target.value)}
              placeholder="예) 집에 있는 재료로 밥해먹고 커피도 참았어요 ☕"
              maxLength={80}
              rows={3}
            />
            <p className="zero-note-modal-char-count">{zeroNoteText.length}/80</p>
            <Button
              size="medium"
              display="full"
              color="primary"
              variant="fill"
              disabled={zeroNoteText.trim().length < 5 || submitting}
              onClick={() => {
                handleSubmitRecord([{ category: '한마디', emoji: '💬', amount: 0, comment: zeroNoteText.trim() }]);
              }}
            >
              {submitting ? '저장 중...' : '무지출 기록 완료'}
            </Button>
            {zeroNoteText.trim().length < 5 && (
              <p className="zero-note-hint">5자 이상 입력하면 기록할 수 있어요</p>
            )}
          </div>
        </div>
      )}

      {/* 소비 성향 테스트 모달 */}
      {showPersonaTest && (
        <PersonaTest
          onClose={(newPersona) => {
            setShowPersonaTest(false);
            if (newPersona) {
              loadRank();
              setFeedRefreshToken(t => t + 1);
            }
          }}
        />
      )}

      {/* 습관 트리거 픽커 — 첫 기록 후 1회 (선택 사항) */}
      {showTriggerPicker && (
        <div className="modal-overlay" onClick={() => setShowTriggerPicker(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div style={{ padding: '20px 16px', textAlign: 'left' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '17px', fontWeight: 800 }}>🎉 첫 기록 완료! 언제 또 올까요?</h3>
              <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-sub)' }}>구체적인 순간을 정해두면 습관 유지 확률이 크게 올라가요.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['🍚 점심 식사 마치고', '☕ 카페 갈 때', '🚌 퇴근길 버스/지하철에서', '🛌 자기 전 침대에서'].map(label => (
                  <button
                    key={label}
                    onClick={() => {
                      setIntentTrigger(label);
                      setShowTriggerPicker(false);
                      showToast(`⏰ 좋아요! "${label}" 마다 만나요`);
                    }}
                    style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'rgba(255,255,255,0.65)', border: '1px solid var(--divider)', fontWeight: 700, fontSize: '13.5px', cursor: 'pointer', textAlign: 'left' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowTriggerPicker(false)} style={{ marginTop: '10px', width: '100%', background: 'none', border: 'none', color: 'var(--text-mute)', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}>나중에 정할게요</button>
            </div>
          </div>
        </div>
      )}

      {/* 첫 실행 사용법 안내 */}
      <GuideModal open={showFirstGuide} onClose={closeFirstGuide} />

      {/* 포인트 토스트 */}
      {showPointToast && (
        <div className="point-toast">{showPointToast}</div>
      )}

    </div>
  );
}

// Deploy timestamp 1780836526
