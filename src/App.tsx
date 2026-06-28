import { useState, useEffect, useRef } from 'react';
import { Button, TextField } from '@toss/tds-mobile';
import { appLogin, getAnonymousKey } from '@apps-in-toss/web-framework';
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
  updateGroupRaidAction,
  addJelly,
  getIntentTrigger,
  setIntentTrigger,
  getWeeklyBudget,
  addToGoal,
  checkAndResetDailyPhysics,
  resolveSkeleton,
  getZeigarnikSkeletons,
  reduceBudgetEntropy,
  getBudgetEntropy,
} from './lib/storage';
import { initAit, grantPendingReward, grantRankReward } from './lib/tosspoint';
import { preloadReward, showReward, initBannerAds } from './lib/ads';
import { submitEntry, fetchWeekRank, isSupabaseConfigured, verifyUserLinked, type SpendingItem, type WeekRankRow } from './lib/supabase';
import { getTodayStr, getWeekKey, getPrevWeekKey, formatAmount } from './lib/utils';
import FeedScreen from './screens/FeedScreen';
import RankScreen from './screens/RankScreen';
import ProfileScreen from './screens/ProfileScreen';
import RecordScreen from './screens/RecordScreen';
import PersonaTest from './screens/PersonaTest';
import ChatScreen from './screens/ChatScreen';
import CommunityScreen from './screens/CommunityScreen';
import CustomIcon from './components/CustomIcon';
import { sendChatMessage } from './lib/chat';

type Tab = 'feed' | 'chat' | 'community' | 'mylog';

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'feed',      icon: '/images/icon_feed.png', label: '피드' },
  { key: 'chat',      icon: '/images/icon_mail.png', label: '짠톡방' },
  { key: 'community', icon: '/images/icon_rank.png', label: '커뮤니티' },
  { key: 'mylog',     icon: '/images/icon_profile.png', label: '마이로그'  },
];


export default function App() {
  const fallbackId = useRef(getUserId()).current;

  const [anonymousKey, setAnonymousKey] = useState<string | null>(() => getUserKey());
  const [tossLinked, setTossLinked] = useState(() => localStorage.getItem('savelog_toss_linked') === 'true');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const userId = anonymousKey ?? fallbackId;

  const [nickname, setNicknameState] = useState<string | null>(() => getNickname());
  const [nicknameInput, setNicknameInput] = useState('');
  const [intentTrigger, setIntentTriggerState] = useState<string | null>(() => getIntentTrigger());
  const [tab, setTab]           = useState<Tab>(() => {
    const path = window.location.pathname.replace(/^\//, '').split('/')[0];
    if (path === 'chat') return 'chat';
    if (path === 'community') return 'community';
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
  const [showRankingModal, setShowRankingModal] = useState(false);
  const [pendingPoints, setPendingPoints] = useState<number>(() => getPendingPoints());
  const [feedRefreshToken, setFeedRefreshToken] = useState(0);
  const [profileRefreshToken, setProfileRefreshToken] = useState(0);
  const [sharedEntryToPost, setSharedEntryToPost] = useState<any>(null);
  const [streakShields, setStreakShields] = useState<number>(() => getStreakShields());
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittingRef = useRef(false);
  const pendingClaimingRef = useRef(false);
  const rankClaimingRef = useRef(false);
  const rankLoadIdRef = useRef(0);

  function handleShareToChat(entry: any) {
    setSharedEntryToPost(entry);
    setTab('chat');
  }

  useEffect(() => {
    checkAndResetDailyPhysics(getTodayStr());
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

  // ── 닉네임 설정 화면 ────────────────────────────────────────────────────────
  function handleSetNickname() {
    const name = nicknameInput.trim();
    if (!name) return;
    setNickname(name);
    setNicknameState(name);
  }

  if ((!anonymousKey || !tossLinked) && import.meta.env.PROD) {
    const isMigration = !!nickname;
    return (
      <div className="app-root">
        <div className="bg-glow-orb orb-1"></div>
        <div className="bg-glow-orb orb-2"></div>
        <div className="bg-glow-orb orb-3"></div>
        <div className="screen setup-screen">
          <div className="setup-hero">
            <img src="/images/savelog_main_character.png" alt="Savelog Piggy" className="setup-hero-img" />
            <h1 className="setup-title">savelog</h1>
            {isMigration ? (
              <p className="setup-desc">더 안전한 서비스 이용을 위해<br />토스 계정 연동이 필요해요</p>
            ) : (
              <p className="setup-desc">매일 소비를 기록하고<br />절약 스토리를 함께 나눠요</p>
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

  if (!nickname) {
    return (
      <div className="app-root">
        <div className="bg-glow-orb orb-1"></div>
        <div className="bg-glow-orb orb-2"></div>
        <div className="bg-glow-orb orb-3"></div>
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
      </div>
    );
  }

  if (!intentTrigger) {
    const triggers = [
      { key: 'lunch', label: '🍚 점심 식사 마치고', desc: '낮 시간에 밀리지 않고 가볍게 기록해요' },
      { key: 'cafe', label: '☕ 카페 갈 때', desc: '커피 값이나 간식 비용을 잊지 않고 적어요' },
      { key: 'commute', label: '🚌 퇴근길 버스/지하철에서', desc: '하루의 소비를 돌아보기 좋은 이동 시간이에요' },
      { key: 'bed', label: '🛌 자기 전 침대에서', desc: '오늘 하루 지갑 수비 결과를 정돈하고 자요' }
    ];
    return (
      <div className="app-root">
        <div className="bg-glow-orb orb-1"></div>
        <div className="bg-glow-orb orb-2"></div>
        <div className="bg-glow-orb orb-3"></div>
        <div className="screen setup-screen">
          <div className="setup-hero" style={{ paddingBottom: '16px' }}>
            <img src="/images/savelog_main_character.png" alt="Savelog Piggy" className="setup-hero-img" />
            <h2 className="setup-title" style={{ fontSize: '20px', lineHeight: '1.4', margin: '16px 0 8px 0' }}>언제 지갑 수비를 기록할까요?</h2>
            <p className="setup-desc">구체적인 순간을 약속하면<br />습관 유지 확률이 91%까지 올라갑니다.</p>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 24px', boxSizing: 'border-box', marginBottom: '32px' }}>
            {triggers.map(t => (
              <div
                key={t.key}
                onClick={() => {
                  setIntentTrigger(t.label);
                  setIntentTriggerState(t.label);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.65)',
                  border: '1px solid rgba(120, 100, 80, 0.08)',
                  borderRadius: '16px',
                  padding: '16px 20px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
                onMouseEnter={(e) => { 
                  e.currentTarget.style.background = '#FFFFFF'; 
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
                onMouseLeave={(e) => { 
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.65)'; 
                  e.currentTarget.style.borderColor = 'rgba(120, 100, 80, 0.08)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                }}
              >
                <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 800, color: 'var(--text-main)' }}>{t.label}</h4>
                <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-sub)', lineHeight: '1.4' }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function handleSubmitRecord(items: SpendingItem[], image?: string, isBalanceGame?: boolean): Promise<void> {
    return handleCloseAdAndSubmit(items, image, isBalanceGame);
  }

  async function handleCloseAdAndSubmit(items: SpendingItem[], image?: string, isBalanceGame?: boolean) {
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
        ...(isBalanceGame ? { is_balance_game: true } : {}),
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

        const hasSpend = items.some(it => it.category !== '절약 방어' && it.amount > 0);
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

        const handleRaidAction = (type: 'zero' | 'save' | 'spend', category: string, amount: number) => {
          const result = updateGroupRaidAction(type, category, amount, nickname || '짠친');
          if (result && result.logMessage) {
            const savedPot = localStorage.getItem('savelog_pot_group');
            if (savedPot) {
              const potGroup = JSON.parse(savedPot);
              const roomId = `CHAT-${potGroup.id}`;
              sendChatMessage('system', '시스템', 'system', 'text', result.logMessage, undefined, roomId)
                .catch(err => console.error('Failed to send raid message:', err));
            }
          }
        };

        if (hasZero) {
          handleRaidAction('zero', '', 0);
        } else if (hasSave) {
          const savedAmt = items.find(it => it.category === '절약 방어')?.saved_amount || 0;
          handleRaidAction('save', '절약 방어', savedAmt);
        } else if (hasSpend) {
          items.forEach(it => {
            if (it.amount > 0) {
              handleRaidAction('spend', it.category, it.amount);
            }
          });
        }
      }

      if (isSocialPost) {
        showToast('✅ 공유 완료!');
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
        
        const currentEntropy = getBudgetEntropy();
        const entropyDecay = currentEntropy > 70;
        if (entropyDecay) {
          jellyReward = Math.round(jellyReward * 0.5);
        }
        addJelly(jellyReward);

        // 안 쓴 돈(잠재에너지)을 목표 게이지로 충전 — 하루 예산 대비 아낀 만큼 + 명시적 절약 방어액
        const dailyBudget = Math.round(getWeeklyBudget() / 7);
        const savedFromBudget = Math.max(0, dailyBudget - total);
        const savedFromDefense = items.reduce((s, it) => s + (it.saved_amount ?? 0), 0);
        const finalChargeInput = entropyDecay ? Math.round((savedFromBudget + savedFromDefense) * 0.5) : (savedFromBudget + savedFromDefense);
        const chargedToGoal = addToGoal(finalChargeInput);

        const goalMsg = chargedToGoal > 0 ? ` · 🎯 목표에 ${formatAmount(chargedToGoal)} 충전` : '';
        const decayAlert = entropyDecay ? ' (⚠️엔트로피 50% 감쇄)' : '';
        const toastMsg = actualEarned > 0
          ? `✅ 기록 완료! +${actualEarned}원 대기 중 (광고 보고 받기) · +${jellyReward} 젤리${decayAlert} 🐹${goalMsg}`
          : `✅ 기록 완료! · +${jellyReward} 젤리${decayAlert} 🐹${goalMsg}`;
        showToast(toastMsg);
      } else {
        showToast('✅ 추가 기록 완료!');
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
            onQuickZeroSpend={() => { setZeroNoteText(''); setShowZeroNote(true); }}
            onClaimPending={handleClaimPending}
            onNavigateToMyLog={() => navigateTo('mylog')}
            onShareToChat={handleShareToChat}
          />
        </div>
        <div className={tab !== 'chat' ? 'tab-panel--hidden' : ''}>
          <ChatScreen
            userId={userId}
            nickname={nickname || '절약가'}
            sharedEntryToPost={sharedEntryToPost}
            clearSharedEntry={() => setSharedEntryToPost(null)}
            activeTab={tab}
          />
        </div>
        <div className={tab !== 'community' ? 'tab-panel--hidden' : ''}>
          <CommunityScreen userId={userId} />
        </div>
        <div className={tab !== 'mylog' ? 'tab-panel--hidden' : ''}>
          <ProfileScreen
            userId={userId}
            nickname={nickname}
            streak={streak}
            weekRank={weekRank}
            daily={daily}
            refreshToken={profileRefreshToken}
            onNicknameChange={setNicknameState}
            onStartTest={() => setShowPersonaTest(true)}
            onShieldEarned={() => {
              addStreakShield(1);
              setStreakShields(getStreakShields());
              showToast('🛡️ 공유 완료! 스트릭 보호권 +1 적립');
            }}
            onShareToChat={handleShareToChat}
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

      {/* 포인트 토스트 */}
      {showPointToast && (
        <div className="point-toast">{showPointToast}</div>
      )}

    </div>
  );
}

// Deploy timestamp 1780836526
