import { useState, useEffect, useRef } from 'react';
import { Button, TextField } from '@toss/tds-mobile';
import { getAnonymousKey } from '@apps-in-toss/web-framework';
import {
  getUserId,
  getUserKey,
  setUserKey as setUserKeyStorage,
  getNickname,
  setNickname,
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
  getClaimedRankReward,
  setClaimedRankReward,
  cleanupStaleKeys,
  getStreakShields,
  addStreakShield,
  getMilestonePosted,
  setMilestonePosted,
  type StreakData,
  type DailyState,
} from './lib/storage';
import { initAit, grantPendingReward, grantRankReward, grantFeedReward } from './lib/tosspoint';
import { preloadInterstitial, showInterstitial, preloadReward, showReward } from './lib/ads';
import { submitEntry, fetchWeekRank, isSupabaseConfigured, type SpendingItem, type WeekRankRow } from './lib/supabase';
import { getTodayStr, getWeekKey } from './lib/utils';
import HomeScreen from './screens/HomeScreen';
import FeedScreen from './screens/FeedScreen';
import RankScreen from './screens/RankScreen';
import ProfileScreen from './screens/ProfileScreen';
import RecordScreen from './screens/RecordScreen';
import PersonaTest from './screens/PersonaTest';

type Tab = 'home' | 'feed' | 'rank' | 'profile';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'home',    icon: '/images/icon_home.png', label: '홈'  },
  { key: 'feed',    icon: '/images/icon_feed.png', label: '피드' },
  { key: 'rank',    icon: '/images/icon_rank.png', label: '순위' },
  { key: 'profile', icon: '/images/icon_profile.png', label: '내 정보'  },
];


export default function App() {
  const fallbackId = useRef(getUserId()).current;

  const [anonymousKey, setAnonymousKey] = useState<string | null>(() => getUserKey());
  const [termsAgreed, setTermsAgreed] = useState<boolean>(() => {
    try { return localStorage.getItem('savelog_terms_agreed') === 'true'; } catch { return false; }
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const userId = anonymousKey ?? fallbackId;

  const [nickname, setNicknameState] = useState<string | null>(() => getNickname());
  const [nicknameInput, setNicknameInput] = useState('');
  const [tab, setTab]           = useState<Tab>(() => {
    const path = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (path === 'feed' || path === 'rank' || path === 'profile') return path;
    return 'home';
  });
  const [daily, setDaily]       = useState<DailyState>(() => loadDailyState(getTodayStr()));
  const [streak, setStreak]     = useState<StreakData>(() => getEffectiveStreak());
  const [weekRank, setWeekRank] = useState<WeekRankRow[]>([]);
  const [rankLoading, setRankLoading] = useState(true);
  const [rankLoadFailed, setRankLoadFailed] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const [showZeroNote, setShowZeroNote] = useState(false);
  const [zeroNoteText, setZeroNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rankClaiming, setRankClaiming] = useState(false);
  const [pendingClaiming, setPendingClaiming] = useState(false);
  const [showPointToast, setShowPointToast] = useState<string | null>(null);
  const [showPersonaTest, setShowPersonaTest] = useState(false);
  const [pendingPoints, setPendingPoints] = useState<number>(() => getPendingPoints());
  const [feedRefreshToken, setFeedRefreshToken] = useState(0);
  const [profileRefreshToken, setProfileRefreshToken] = useState(0);
  const [streakShields, setStreakShields] = useState<number>(() => getStreakShields());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const rankClaimingRef = useRef(false);
  const pendingClaimingRef = useRef(false);
  const rankLoadIdRef = useRef(0);

  useEffect(() => {
    initAit();
    preloadInterstitial();
    if (getPendingPoints() > 0) preloadReward();
    loadRank();
    cleanupStaleKeys();
    if (termsAgreed && !anonymousKey && import.meta.env.PROD) {
      fetchAnonymousKey();
    }
  }, []);

  // 자정 넘어 앱으로 돌아올 때 daily 상태 갱신 (날짜 staleness 방지)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        const currentDay = getTodayStr();
        setDaily(prev => prev.date !== currentDay ? loadDailyState(currentDay) : prev);
        setStreak(getEffectiveStreak());
        setStreakShields(getStreakShields());
        loadRank();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  function navigateTo(next: Tab) {
    setTab(next);
    if (next === 'feed') setFeedRefreshToken(t => t + 1);
    if (next === 'profile') setProfileRefreshToken(t => t + 1);
    if (next === 'rank') loadRank();
    const path = next === 'home' ? '/' : '/' + next;
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

  // ── 유저 식별키 발급 ────────────────────────────────────────────────────────
  async function fetchAnonymousKey() {
    if (loginLoading) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const result = await getAnonymousKey();
      if (result && typeof result === 'object' && result.type === 'HASH') {
        setUserKeyStorage(result.hash);
        setAnonymousKey(result.hash);
      } else {
        setLoginError(`식별키 발급 실패: ${result}`);
      }
    } catch (e) {
      setLoginError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginLoading(false);
    }
  }

  // ── 닉네임 설정 화면 ────────────────────────────────────────────────────────
  function handleSetNickname() {
    const name = nicknameInput.trim();
    if (!name) return;
    setNickname(name);
    setNicknameState(name);
  }

  if (!termsAgreed) {
    return (
      <div className="screen setup-screen">
        <div className="setup-hero">
          <img src="/images/savelog_main_character.png" alt="Savelog Piggy" className="setup-hero-img" />
          <h1 className="setup-title">savelog</h1>
          <p className="setup-desc">매일 소비를 기록하고<br />절약 스토리를 함께 나눠요</p>
        </div>
        <div className="terms-agree-box">
          <p className="terms-agree-subtitle">서비스 이용을 위해 아래 약관에 동의해 주세요</p>
          <p className="terms-agree-text">
            · <span>서비스 이용약관</span> (필수)<br />
            · <span>개인정보 수집 및 이용 동의</span> (필수)<br />
            · 마케팅 정보 수신 동의 (선택)
          </p>
        </div>
        <Button
          size="xlarge"
          display="full"
          color="primary"
          variant="fill"
          onClick={() => {
            localStorage.setItem('savelog_terms_agreed', 'true');
            setTermsAgreed(true);
            if (import.meta.env.PROD) fetchAnonymousKey();
          }}
        >
          모두 동의하고 시작하기
        </Button>
      </div>
    );
  }

  if (!anonymousKey && import.meta.env.PROD) {
    return (
      <div className="screen setup-screen">
        <div className="setup-hero">
          <img src="/images/savelog_main_character.png" alt="Savelog Piggy" className="setup-hero-img" />
          <h1 className="setup-title">savelog</h1>
          <p className="setup-desc">매일 소비를 기록하고<br />절약 스토리를 함께 나눠요</p>
        </div>
        <Button size="xlarge" display="full" color="primary" variant="fill" onClick={fetchAnonymousKey} disabled={loginLoading}>
          {loginLoading ? '불러오는 중...' : '다시 시도하기'}
        </Button>
        {loginError && <p className="login-error-msg">{loginError}</p>}
      </div>
    );
  }

  if (!nickname) {
    return (
      <div className="screen setup-screen">
        <div className="setup-hero">
          <img src="/images/savelog_main_character.png" alt="Savelog Piggy" className="setup-hero-img" />
          <h1 className="setup-title">savelog</h1>
          <p className="setup-desc">매일 소비를 기록하고<br />절약 스토리를 함께 나눠요</p>
        </div>

        <div className="setup-textfield-wrap">
          <TextField
            variant="box"
            label="닉네임을 설정해 주세요"
            placeholder="예: 절약왕민지"
            value={nicknameInput}
            maxLength={12}
            help="최대 12자 · 나중에 변경 가능해요"
            onChange={(e: any) => setNicknameInput(e.target.value)}
            onKeyDown={(e: any) => e.key === 'Enter' && handleSetNickname()}
            autoFocus
          />
        </div>

        <Button
          size="xlarge"
          display="full"
          color="primary"
          variant="fill"
          onClick={handleSetNickname}
          disabled={!nicknameInput.trim()}
        >
          시작하기
        </Button>
      </div>
    );
  }

  async function handleSubmitRecord(items: SpendingItem[], image?: string, isBalanceGame?: boolean): Promise<void> {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    showInterstitial(() => {
      submittingRef.current = false;
      handleCloseAdAndSubmit(items, image, isBalanceGame);
    });
  }

  async function handleCloseAdAndSubmit(items: SpendingItem[], image?: string, isBalanceGame?: boolean) {
    const today = getTodayStr();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const isFirstRecord = !daily.recorded || daily.date !== today;
    try {
      const total = items.reduce((s, i) => s + i.amount, 0);
      const weekKey = getWeekKey();
      const currentPersona = getPersona() ?? undefined;

      const entryId = await submitEntry({
        user_id: userId,
        nickname: nickname!,
        date: today,
        week_key: weekKey,
        items,
        total_amount: total,
        persona: currentPersona,
        image,
        ...(isBalanceGame ? { is_balance_game: true } : {}),
      });

      if (!entryId && isSupabaseConfigured) {
        showToast('기록 저장에 실패했어요. 다시 시도해 주세요.');
        return;
      }

      // 첫 기록에만 미션·스트릭·포인트 처리
      if (isFirstRecord) {
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
              items: [{ category: '마일스톤', emoji: '🏆', amount: 0, comment: `${newStreak.streak}일 연속 절약 챌린지 달성! 짠내 만렙 등극 🎉` }],
              total_amount: 0,
              persona: currentPersona,
            }).catch(() => {});
          }
        }

        const isStreakBonus = newStreak.streak > 0 && newStreak.streak % 7 === 0;
        const totalEarn = 3 + (isStreakBonus ? 20 : 0);
        const prevPending = getPendingPoints();
        const newPending = addPendingPoints(totalEarn);
        const actualEarned = newPending - prevPending;
        setPendingPoints(newPending);
        if (newPending > 0) preloadReward();

        const toastMsg = isStreakBonus
          ? (actualEarned > 0 ? `🔥 7일 연속 완주! 총 +${actualEarned}원 적립 대기 (광고 보고 받기)` : `🔥 7일 연속 완주! (포인트 한도 도달 — 광고 보고 먼저 받기)`)
          : (actualEarned > 0 ? `✅ 기록 완료! +${actualEarned}원 대기 중 (광고 보고 받기)` : `✅ 기록 완료! (오늘 포인트 한도 도달)`);
        showToast(toastMsg);
      } else {
        showToast('✅ 추가 기록 완료!');
      }

      // 누적 지출액으로 daily 상태 갱신
      const prevSpent = (daily.date === today ? daily.spentAmount : 0) ?? 0;
      const newDaily: DailyState = { date: today, recorded: true, pointGranted: true, entryId, spentAmount: prevSpent + total };
      saveDailyState(newDaily);
      setDaily(newDaily);
      setFeedRefreshToken(t => t + 1);
      setProfileRefreshToken(t => t + 1);
      setShowRecord(false);
      loadRank();
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
    const weekKey = getWeekKey();
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
      <div className="bg-glow-orb orb-1"></div>
      <div className="bg-glow-orb orb-2"></div>
      <div className="bg-glow-orb orb-3"></div>
      
      {/* Supabase 미설정 배너 — 개발 환경에서만 표시 */}
      {import.meta.env.DEV && !isSupabaseConfigured && (
        <div className="dev-banner">
          개발 모드 — Supabase 미연결 (목업 데이터)
        </div>
      )}

      {/* 탭 콘텐츠 — display:none으로 마운트 유지 (재요청/플리커 방지) */}
      <div className="tab-content">
        <div style={tab !== 'home' ? { display: 'none' } : {}}>
          <HomeScreen
            daily={daily}
            streak={streak}
            weekRank={weekRank}
            userId={userId}
            pendingPoints={pendingPoints}
            submitting={submitting}
            streakShields={streakShields}
            onRecord={() => setShowRecord(true)}
            onQuickZeroSpend={() => { setZeroNoteText(''); setShowZeroNote(true); }}
            onClaimPending={handleClaimPending}
            pendingClaiming={pendingClaiming}
          />
        </div>
        <div style={tab !== 'feed' ? { display: 'none' } : {}}>
          <FeedScreen
            userId={userId}
            refreshToken={feedRefreshToken}
            onGrantFeedReward={() => {
              grantFeedReward(1).catch(() => {});
            }}
          />
        </div>
        <div style={tab !== 'rank' ? { display: 'none' } : {}}>
          <RankScreen
            userId={userId}
            weekRank={weekRank}
            loading={rankLoading}
            loadFailed={rankLoadFailed}
            onClaimRankReward={handleClaimRankReward}
            claimedThisWeek={getClaimedRankReward(getWeekKey())}
            rankClaiming={rankClaiming}
            dailyRecorded={daily.recorded && daily.date === getTodayStr()}
            onRetry={loadRank}
          />
        </div>
        <div style={tab !== 'profile' ? { display: 'none' } : {}}>
          <ProfileScreen
            userId={userId}
            nickname={nickname}
            streak={streak}
            refreshToken={profileRefreshToken}
            onNicknameChange={setNicknameState}
            onStartTest={() => setShowPersonaTest(true)}
            onShieldEarned={() => {
              addStreakShield(1);
              setStreakShields(getStreakShields());
              showToast('🛡️ 공유 완료! 스트릭 보호권 +1 적립');
            }}
          />
        </div>
      </div>

      {/* 하단 탭바 */}
      <nav className="bottom-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'tab-btn--active bottom-nav-item--active' : ''}`}
            onClick={() => navigateTo(t.key)}
          >
            <img src={t.icon} alt={t.label} className="custom-icon--tab" />
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
            <p className="zero-note-modal-title">🌿 무지출 기록하기</p>
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
                setShowZeroNote(false);
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
              navigateTo('feed');
            }
          }}
        />
      )}

      {/* 포인트 토스트 */}
      {showPointToast && (
        <div className="point-toast">{showPointToast}</div>
      )}

    </div>
  );
}
