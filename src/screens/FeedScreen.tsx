import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@toss/tds-mobile';
import { TossAds } from '@apps-in-toss/web-framework';
import type { EntryWithReactions, WeekRankRow } from '../lib/supabase';
import { fetchFeed, toggleReaction, toggleStamp, submitEntry, submitBalanceVote, fetchDilemmaVoteCounts, fetchFollows, fetchFollowersWithNickname, fetchFriendsOfFriends, toggleFollowSupabase, searchUsers, sendCheerNotification, fetchFollowedPersonas, fetchMyDuo, fetchMyInteractions, fetchCommentsForPosts, addCommunityComment, isSupabaseConfigured, fetchOrCreateWeeklyBoss, createBattle, fetchMyBattle, fetchDayTotals, fetchMyCircle, createCircle, joinCircleByCode, joinOpenCircle, leaveCircle, CIRCLE_MAX_MEMBERS, fetchGlobalStats, fetchFeedbackSince, type GlobalStats, type SearchUser, type FofCandidate, type ServerRelation, type CommunityComment, type WeeklyBoss, type Battle, type Duo, type MyCircle, type SpendingItem } from '../lib/supabase';
import { STAMPS, STAMP_BY_KEY, topStamp } from '../lib/stamps';
import { shareExternal, buildCircleInviteMessage, buildRecordBragMessage } from '../lib/share';
import RouletteModal from '../components/RouletteModal';
import { recordInteraction, getRelation, getEffectiveStreak } from '../lib/relations';
import { formatAmount, timeAgo, getWeekKey, getTodayStr } from '../lib/utils';
import { 
  PERSONAS, 
  getPersona, 
  getNickname, 
  sendCheeringMessage, 
  getFollowedUsers, 
  saveFollowedUsers, 
  type StreakData, 
  type DailyState,
  getDilemmaOutcome,
  resolveDilemma,
  addToGoal,
  addJelly,
  getWishlist,
  resolveWishlistItem,
  isWishlistItemReady,
  getRouletteSpins
} from '../lib/storage';
import { FEED_BANNER_AD_ID, initBannerAds } from '../lib/ads';
import { openContactsInvite } from '../lib/share';
import CustomIcon, { renderTextWithEmoji } from '../components/CustomIcon';
import { IconChat, IconStamp, IconHeart, IconShare } from '../components/Icons';

function FeedBannerSlot() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 토스 웹뷰 밖(브라우저)에서는 isSupported 호출 자체가 throw
    try {
      if (!TossAds.initialize.isSupported()) return;
    } catch { return; }

    let attached: { destroy: () => void } | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 3;

    function attach() {
      if (!containerRef.current) return;
      attached?.destroy();
      attached = TossAds.attachBanner(FEED_BANNER_AD_ID, containerRef.current, {
        theme: 'dark',
        tone: 'blackAndWhite',
        variant: 'card',
        callbacks: {
          onAdFailedToRender: () => {
            if (retryCount < MAX_RETRIES) {
              retryCount++;
              retryTimer = setTimeout(attach, 500);
            }
          },
        },
      });
    }

    initBannerAds();
    attach();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      attached?.destroy();
    };
  }, []);

  return <div ref={containerRef} style={{ width: '100%' }} />;
}


interface Props {
  userId: string;
  refreshToken?: number;
  weekRank?: WeekRankRow[];
  // HomeScreen에서 이관된 props
  daily: DailyState;
  streak: StreakData;
  pendingPoints: number;
  submitting?: boolean;
  pendingClaiming?: boolean;
  streakShields?: number;
  onRecord: () => void;
  onQuickRecord: (items: SpendingItem[]) => Promise<void>;
  onQuickZeroSpend: () => void;
  onClaimPending: () => void;
  onNavigateToMyLog?: () => void;
  onShareToChat?: (entry: any) => void;
  onShieldEarned?: (count: number) => void;
}


// ── 한 줄 기록 파서 — 거지방식 "커피 4500" 입력을 기록으로 (진입 마찰 최소화) ──
const QUICK_CATEGORY_RULES: { re: RegExp; category: string; emoji: string }[] = [
  { re: /커피|카페|라떼|스벅|스타벅스|아메리카노|음료|버블티|주스/, category: '카페', emoji: '☕' },
  { re: /밥|점심|저녁|아침|식사|국밥|치킨|피자|버거|배달|야식|간식|빵|편의점|김밥|라면|샐러드|도시락/, category: '식비', emoji: '🍚' },
  { re: /버스|지하철|택시|기차|주유|교통|톨비|주차/, category: '교통', emoji: '🚇' },
  { re: /쇼핑|옷|신발|쿠팡|무신사|화장품|올리브영|악세|가방/, category: '쇼핑', emoji: '🛍️' },
];

export function parseQuickRecord(text: string): SpendingItem[] {
  const t = text.trim();
  // 마지막 금액 토큰 추출 (4500 / 4,500 / 4500원 / 1만원 / 3천원)
  const matches = [...t.matchAll(/([0-9][\d,\.]*)\s*(만원|천원|원)?/g)].filter(m => m[1]);
  let amount = 0;
  let amountToken = '';
  if (matches.length > 0) {
    const m = matches[matches.length - 1];
    const num = parseFloat(m[1].replace(/,/g, ''));
    const unit = m[2] === '만원' ? 10000 : m[2] === '천원' ? 1000 : 1;
    if (!isNaN(num) && num > 0) {
      amount = Math.round(num * unit);
      amountToken = m[0];
    }
  }
  const comment = (amountToken ? t.replace(amountToken, '') : t).replace(/\s+/g, ' ').trim();

  if (amount <= 0) {
    // 금액 없는 한 줄 = 오늘의 무지출 한마디
    return [{ category: '한마디', emoji: '💬', amount: 0, comment: comment || '오늘도 지갑 수비 성공' }];
  }
  const rule = QUICK_CATEGORY_RULES.find(r => r.re.test(comment || t));
  return [{
    category: rule?.category ?? '기타',
    emoji: rule?.emoji ?? '📦',
    amount,
    comment: comment || (rule?.category ?? '오늘의 지출'),
  }];
}


export default function FeedScreen({ userId, refreshToken = 0, weekRank = [], daily, streak, pendingPoints, submitting = false, pendingClaiming, onRecord, onQuickRecord, onClaimPending, onNavigateToMyLog, onShieldEarned }: Props) {
  const [entries, setEntries] = useState<EntryWithReactions[]>([]);
  // 소비 고민 글 실제 투표 집계 (seed 가짜값 대체)
  const [dilemmaVotes, setDilemmaVotes] = useState<Record<string, { over: number; ok: number; total: number }>>({});
  const [loading, setLoading] = useState(true);
  const initialLoaded = React.useRef(false);
  const loadIdRef = React.useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(() => new Set());
  const togglingRef = React.useRef<Set<string>>(new Set());
  // 쪽지 및 하트 인터랙션 관련 상태
  const [messageRecipientEntry, setMessageRecipientEntry] = useState<EntryWithReactions | { user_id: string; nickname: string } | null>(null);
  const [messageText, setMessageText] = useState('');
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFeedToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastText(msg);
    toastTimerRef.current = setTimeout(() => { setToastText(null); toastTimerRef.current = null; }, 2200);
  }
  const [doubleTappedHearts, setDoubleTappedHearts] = useState<Record<string, boolean>>({});

  // 라이트박스 (이미지 확대 보기)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // 팔로우 / 탭 필터
  const [feedTab, setFeedTab] = useState<'circle' | 'all' | 'follow'>('circle'); // 서클이 홈 — 없어도 온보딩이 첫 화면
  const [followedUsers, setFollowedUsers] = useState<Record<string, string>>(() => getFollowedUsers());
  // 절약 짝꿍 = 상호 팔로우(내가 팔로우 ∩ 나를 팔로우). 관계 moat 핵심
  const [mutualSet, setMutualSet] = useState<Set<string>>(new Set());
  const [relTick, setRelTick] = useState(0); // 관계 자본 갱신 시 뱃지 리렌더
  // 나를 팔로우한 사람들 (맞팔 추천 + 짝꿍 확정 감지용)
  const [followers, setFollowers] = useState<{ id: string; nickname: string }[]>([]);
  const followerIdSetRef = React.useRef<Set<string>>(new Set());
  // 친구의 친구 추천 (삼각 폐쇄 — 그래프 densify)
  const [fofList, setFofList] = useState<FofCandidate[]>([]);
  useEffect(() => {
    const ids = Object.keys(followedUsers);
    if (ids.length === 0) { setFofList([]); return; }
    fetchFriendsOfFriends(userId, ids).then(setFofList).catch(() => {});
  }, [userId, followedUsers]);

  useEffect(() => {
    fetchGlobalStats(getWeekKey()).then(setGlobalStats).catch(() => {});
  }, []);

  // 자리 비운 사이 받은 반응 — 재방문 순간 가장 먼저 보상을 보여준다
  const [welcomeBack, setWelcomeBack] = useState<{ reactions: number; comments: number } | null>(null);
  useEffect(() => {
    let lastSeen: string | null = null;
    try {
      lastSeen = localStorage.getItem('savelog_last_seen');
      localStorage.setItem('savelog_last_seen', new Date().toISOString());
    } catch { /* storage 불가 시 배너 생략 */ }
    if (!lastSeen) return;
    fetchFeedbackSince(userId, lastSeen).then(r => {
      if (r && r.reactions + r.comments > 0) setWelcomeBack(r);
    }).catch(() => {});
  }, [userId]);

  useEffect(() => {
    fetchFollowersWithNickname(userId).then(list => {
      setFollowers(list);
      const followerSet = new Set(list.map(f => f.id));
      followerIdSetRef.current = followerSet;
      setMutualSet(new Set(Object.keys(followedUsers).filter(id => followerSet.has(id))));
    }).catch(() => {});
  }, [userId, followedUsers]);
  const followInFlight = React.useRef<Set<string>>(new Set());

  // ── 충동 대기방 및 소비 칼로리 관련 상태/핸들러 ──
  const [wishlist, setWishlistState] = useState(() => getWishlist());

  // 한 줄 기록 — 파싱 후 즉시 게시 (첫 글 비용: 폼 5탭 → 텍스트 1줄)
  const [quickText, setQuickText] = useState('');
  // 스탬프 피커 (카드당 온디맨드)
  const [stampPickerFor, setStampPickerFor] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);

  // 내 기록 외부 자랑 — 성취 피크 순간에 바이럴 접점 (딥링크 by/bn = 수신자 자동 맞팔)
  async function handleBragShare(entry: EntryWithReactions) {
    const note = entry.items.find(it => it.category === '한마디')?.comment || entry.items[0]?.comment || '';
    const isZero = (entry.total_amount ?? 0) === 0;
    const me = getNickname() || '짠친';
    const msg = buildRecordBragMessage(me, note, isZero, isZero ? undefined : formatAmount(entry.total_amount));
    await shareExternal(msg, `by=${encodeURIComponent(userId)}&bn=${encodeURIComponent(me)}`);
  }
  // 스토리 레일 시트
  const [showCircleSheet, setShowCircleSheet] = useState(false);
  const [showBossSheet, setShowBossSheet] = useState(false);
  async function handleQuickSubmit() {
    const t = quickText.trim();
    if (!t || submitting) return;
    const items = parseQuickRecord(t);
    setQuickText('');
    await onQuickRecord(items);
  }
  // ── 팔로우/소셜 고도화 관련 상태 ──
  const [followedPersonas, setFollowedPersonas] = useState<Record<string, string>>({});
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [quickMenuFriend, setQuickMenuFriend] = useState<{
    id: string;
    nickname: string;
    personaIcon: string | null;
    personaColor: string;
  } | null>(null);

  useEffect(() => {
    const ids = Object.keys(followedUsers);
    if (ids.length > 0) {
      fetchFollowedPersonas(ids).then(map => {
        setFollowedPersonas(map);
      }).catch(() => {});
    } else {
      setFollowedPersonas({});
    }
  }, [followedUsers]);

  useEffect(() => { setWishlistState(getWishlist()); }, [refreshToken]);
  const readyWish = wishlist.filter(isWishlistItemReady);
  const handleWishResolve = (id: string, bought: boolean) => {
    const item = wishlist.find(w => w.id === id);
    setWishlistState(resolveWishlistItem(id, bought));
    if (!bought && item) {
      const charged = addToGoal(item.price);
      addJelly(15);
      showFeedToast(charged > 0
        ? `👏 충동을 이겨냈어요! 목표에 ${formatAmount(item.price)} 충전 · +15 젤리`
        : '👏 충동을 이겨냈어요! +15 젤리');
    }
  };
  // 검색
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pull-to-refresh
  const [pullState, setPullState] = useState<{ y: number; refreshing: boolean }>({ y: 0, refreshing: false });
  const pullStartRef = React.useRef<number | null>(null);
  const screenRef = React.useRef<HTMLDivElement>(null);


  const [feedVotes, setFeedVotes] = useState<Record<string, 'over' | 'ok'>>(() => {
    try {
      const saved = localStorage.getItem('savelog_feed_votes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  async function handleFeedVote(entryId: string, vote: 'over' | 'ok') {
    if (feedVotes[entryId] || feedVotingRef.current.has(entryId)) return;
    feedVotingRef.current.add(entryId);
    // optimistic UI update — functional update로 동시 투표 충돌 방지
    setFeedVotes(prev => ({ ...prev, [entryId]: vote }));
    // 인라인 고민글 실제 집계 낙관적 증가 (즉시 반영)
    setDilemmaVotes(prev => {
      const cur = prev[entryId] ?? { over: 0, ok: 0, total: 0 };
      return { ...prev, [entryId]: { over: cur.over + (vote === 'over' ? 1 : 0), ok: cur.ok + (vote === 'ok' ? 1 : 0), total: cur.total + 1 } };
    });
    try {
      await submitBalanceVote(entryId, userId, vote);
      showFeedToast('⚖️ 투표 완료!');
    } catch {
      // 실패한 엔트리만 롤백 — 동시 진행 중인 다른 투표에 영향 없도록 functional update 사용
      setFeedVotes(prev => {
        const { [entryId]: _, ...rest } = prev;
        return rest;
      });
      showFeedToast('투표 중 오류가 발생했어요. 다시 시도해 주세요.');
    } finally {
      feedVotingRef.current.delete(entryId);
    }
  }

  // 소비 고민 결정 해소 (작성자 본인이 짠친 투표 후 최종 결정)
  const [dilemmaTick, setDilemmaTick] = useState(0);
  function handleResolveDilemma(entryId: string, amount: number, bought: boolean) {
    if (getDilemmaOutcome(entryId)) return;
    resolveDilemma(entryId, bought ? 'bought' : 'resisted');
    if (!bought) {
      const charged = addToGoal(amount);
      const bonus = 10 + Math.floor(Math.random() * 21); // 짠친 응원 가변 보너스 10~30
      addJelly(bonus);
      showFeedToast(charged > 0
        ? `👏 짠친들과 함께 참았어요! 목표에 ${formatAmount(charged)} 충전 · +${bonus} 젤리 🐹`
        : `👏 짠친들과 함께 참았어요! +${bonus} 젤리 🐹`);
    } else {
      showFeedToast('기록 완료! 다음엔 짠친들이 또 막아줄게요 💪');
    }
    setDilemmaTick(t => t + 1);
  }

  // 자유 텍스트 댓글 입력 상태 (엔트리별)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  // 서버 댓글 (community_comments를 post_id=entry.id로 재사용) — 모두에게 보이는 진짜 대화
  const [serverComments, setServerComments] = useState<Record<string, CommunityComment[]>>({});
  // 댓글 스레드 펼침 상태 (2개 초과 시)
  const [commentExpanded, setCommentExpanded] = useState<Record<string, boolean>>({});

  // 로컬 댓글 상태 저장 (실제 서비스처럼 동작)
  const [localComments, setLocalComments] = useState<Record<string, { sender: string; text: string }[]>>(() => {
    try {
      const saved = localStorage.getItem('feed_comments');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // 플로팅 이모지 파티클 상태
  const [particles, setParticles] = useState<{ id: number; emoji: string; x: number; y: number }[]>([]);


  // 밸런스 게임 상태
  const feedVotingRef = React.useRef<Set<string>>(new Set());

  const myPersonaKey = getPersona();



  // 추천 짠친 계산
  const recommendedFriends = React.useMemo(() => {
    const uniqueUsers: Record<string, { user_id: string; nickname: string; persona: string | null }> = {};
    entries.forEach((e) => {
      if (e.user_id !== userId && !followedUsers[e.user_id] && !uniqueUsers[e.user_id]) {
        uniqueUsers[e.user_id] = {
          user_id: e.user_id,
          nickname: e.nickname || '익명 짠친',
          persona: e.persona || null,
        };
      }
    });
    return Object.values(uniqueUsers).slice(0, 5);
  }, [entries, userId, followedUsers]);

  // 팔로우 목록 동기화 — 피드 진입 / 새로고침 시마다 원격 truth 가져오기
  // (다른 탭에서 unfollow 한 결과 반영)
  useEffect(() => {
    fetchFollows(userId).then((remote) => {
      if (remote) {
        saveFollowedUsers(remote);
        setFollowedUsers(remote);
      }
    }).catch(() => {});
  }, [userId, refreshToken]);

  useEffect(() => {
    // 최초 로드는 스켈레톤 표시, 이후 refreshToken/userId 변경은 현재 로드 상태에 따라 갱신
    // userId는 anonymousKey 발급 시 변경될 수 있어 my_reaction 정합성을 위해 포함
    load(initialLoaded.current);
  }, [refreshToken, userId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // 피드 엔트리들의 서버 댓글 일괄 로드 — id 목록이 바뀔 때만 (리액션 등 필드 변경엔 재요청 안 함)
  const entryIdsKey = entries.map(e => e.id).join(',');
  useEffect(() => {
    const ids = entryIdsKey ? entryIdsKey.split(',') : [];
    if (ids.length === 0) return;
    fetchCommentsForPosts(ids).then(map => setServerComments(map)).catch(() => {});
  }, [entryIdsKey]);

  // localComments / feedVotes → localStorage 동기화 (state updater 밖에서 처리)
  useEffect(() => {
    localStorage.setItem('feed_comments', JSON.stringify(localComments));
  }, [localComments]);
  useEffect(() => {
    localStorage.setItem('savelog_feed_votes', JSON.stringify(feedVotes));
  }, [feedVotes]);

  async function load(silent = false) {
    const loadId = ++loadIdRef.current;
    if (!silent) setLoading(true);
    try {
      const data = await fetchFeed(userId);
      if (loadId !== loadIdRef.current) return; // 더 최신 요청이 진행 중 → 결과 버림
      if (data === null) {
        setLoadFailed(true);
        if (!silent) showFeedToast('피드를 불러오지 못했어요. 다시 시도해 주세요.');
        return; // 네트워크 오류 — 기존 피드 그대로 유지
      }
      setLoadFailed(false);
      setEntries(data);

      // 소비 고민 글들의 실제 투표 집계 로드 (seed 가짜값 대체)
      const dilemmaIds = data.filter(e => e.is_balance_game || e.items.some(it => it.category === '소비 고민')).map(e => e.id);
      if (dilemmaIds.length > 0) {
        fetchDilemmaVoteCounts(dilemmaIds).then(counts => {
          if (loadId === loadIdRef.current) setDilemmaVotes(counts);
        }).catch(() => {});
      }

      // 현재 피드에 없는 엔트리의 댓글·투표를 localStorage에서 정리
      // data가 빈 배열이어도 정리 실행 (validIds가 빈 Set이면 고아 키 전체 제거)
      const validIds = new Set(data.map((e) => e.id));
      setLocalComments((prev) => {
        const pruned = Object.fromEntries(
          Object.entries(prev).filter(([id]) => validIds.has(id))
        );
        return Object.keys(pruned).length < Object.keys(prev).length ? pruned : prev;
      });
      // feedVotes도 동일하게 정리 (피드에 없는 엔트리의 투표 기록 제거, localStorage는 useEffect가 처리)
      setFeedVotes((prev) => {
        const pruned = Object.fromEntries(
          Object.entries(prev).filter(([id]) => validIds.has(id))
        );
        return Object.keys(pruned).length < Object.keys(prev).length ? pruned : prev;
      });
    } catch {
      if (loadId !== loadIdRef.current) return;
      setLoadFailed(true);
      if (!silent) showFeedToast('피드를 불러오지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (loadId === loadIdRef.current) {
        if (!silent) setLoading(false);
        initialLoaded.current = true;
      }
    }
  }

  function spawnParticles(emoji: string, e: React.MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const newParticles = Array.from({ length: 6 }).map((_, i) => ({
      id: Date.now() + Math.random() + i,
      emoji,
      x: rect.left + rect.width / 2 + (Math.random() * 60 - 30),
      y: rect.top - 15 + (Math.random() * 30 - 15),
    }));
    setParticles((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newParticles.some((np) => np.id === p.id)));
    }, 1000);
  }

  // ── 🎰 무지출 룰렛 — 기록=룰렛권 (가변 보상) ──
  const [rouletteSpins, setRouletteSpins] = useState(() => getRouletteSpins());
  const [showRoulette, setShowRoulette] = useState(false);
  useEffect(() => {
    const sync = () => setRouletteSpins(getRouletteSpins());
    window.addEventListener('savelog_roulette_updated', sync);
    return () => window.removeEventListener('savelog_roulette_updated', sync);
  }, []);

  // 잭팟 → 피드 자동 자랑글 (주간 순위 제외 week_key)
  function handleRoulettePrize(_jelly: number, isJackpot: boolean) {
    if (!isJackpot) return;
    submitEntry({
      user_id: userId,
      nickname: getNickname() || '짠친',
      date: getTodayStr(),
      week_key: 'milestone-' + getWeekKey(),
      items: [{ category: '마일스톤', emoji: '🎰', amount: 0, comment: `지갑 수비 룰렛 잭팟! 👑 젤리 150개 당첨 — 오늘도 기록이 복권이 됩니다` }],
      total_amount: 0,
    }).then(() => load(false)).catch(() => {});
  }

  // ── 💞 듀오 — 넛지·배틀의 공통 데이터 ──
  const [myDuo, setMyDuo] = useState<Duo | null>(null);
  useEffect(() => {
    fetchMyDuo(userId).then(d => setMyDuo(d)).catch(() => {});
  }, [userId, refreshToken]);

  // 짝꿍이 오늘 기록했는데 나는 아직이면 넛지 (왕복 기록 유도)
  const duoPartnerNudge = React.useMemo(() => {
    if (!myDuo) return null;
    const today = getTodayStr();
    const isA = myDuo.member_a === userId;
    const partnerLast = isA ? myDuo.last_record_b : myDuo.last_record_a;
    const partnerNick = (isA ? myDuo.nickname_b : myDuo.nickname_a) || '짝꿍';
    return partnerLast === today ? partnerNick : null;
  }, [myDuo, userId]);

  // ── 🔒 짠 서클 — 제품의 기본 소셜 단위 (3~8명 닫힌 방) ──
  const [myCircle, setMyCircle] = useState<MyCircle | null>(null);
  const [circleLoaded, setCircleLoaded] = useState(false);
  const [circleFormMode, setCircleFormMode] = useState<'none' | 'create' | 'join'>('none');
  const [circleNameInput, setCircleNameInput] = useState('');
  const [circleJoinInput, setCircleJoinInput] = useState('');
  const [circleBusy, setCircleBusy] = useState(false);
  const userTouchedTabRef = React.useRef(false);
  // 서클이 없으면 발견이 홈 — 미사용 기능이 첫 화면을 차지하지 않게 (실측: 서클 실사용 0)
  useEffect(() => {
    if (circleLoaded && !myCircle && !userTouchedTabRef.current) setFeedTab('all');
  }, [circleLoaded, myCircle]);

  useEffect(() => {
    fetchMyCircle(userId).then(res => {
      setMyCircle(res);
      setCircleLoaded(true);
      // App.tsx의 보스 공격 훅이 참조 (서클 단위 보스)
      try { localStorage.setItem('savelog_circle_id', res ? res.circle.id : ''); } catch {}
    }).catch(() => setCircleLoaded(true));
  }, [userId, refreshToken]);

  const circleMemberIdSet = React.useMemo(() => new Set((myCircle?.members ?? []).map(m => m.user_id)), [myCircle]);

  function applyCircleResult(res: MyCircle | null) {
    if (!res) return;
    setMyCircle(res);
    try { localStorage.setItem('savelog_circle_id', res.circle.id); } catch {}
  }

  async function handleCreateCircle() {
    const name = circleNameInput.trim();
    if (!name || circleBusy) return;
    setCircleBusy(true);
    const res = await createCircle(userId, getNickname() || '짠친', name, '💰');
    setCircleBusy(false);
    if (res) {
      applyCircleResult(res);
      setCircleFormMode('none');
      setCircleNameInput('');
      showFeedToast('🔒 서클을 만들었어요! 친구를 초대해 보세요');
    } else {
      showFeedToast('서클 생성에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
  }

  async function handleJoinCircleCode() {
    const code = circleJoinInput.trim();
    if (!code || circleBusy) return;
    setCircleBusy(true);
    const res = await joinCircleByCode(code, userId, getNickname() || '짠친');
    if (res.ok) {
      const my = await fetchMyCircle(userId);
      applyCircleResult(my);
      setCircleFormMode('none');
      setCircleJoinInput('');
      showFeedToast(`🔒 「${res.circle?.name ?? '서클'}」에 합류했어요!`);
    } else {
      showFeedToast(res.reason || '참여에 실패했어요');
    }
    setCircleBusy(false);
  }

  async function handleJoinOpen() {
    if (circleBusy) return;
    setCircleBusy(true);
    const res = await joinOpenCircle(userId, getNickname() || '짠친', getWeekKey());
    if (res.ok) {
      const my = await fetchMyCircle(userId);
      applyCircleResult(my);
      showFeedToast('🎲 이번 주 공개 서클에 배정됐어요! 같이 지켜봐요');
    } else {
      showFeedToast('공개 서클 입장에 실패했어요. 잠시 후 다시 시도해 주세요.');
    }
    setCircleBusy(false);
  }

  function handleLeaveCircle() {
    if (!myCircle || circleBusy) return;
    leaveCircle(myCircle.circle.id, userId).then(ok => {
      if (ok) {
        setMyCircle(null);
        try { localStorage.setItem('savelog_circle_id', ''); } catch {}
        showFeedToast('서클에서 나왔어요');
      }
    });
  }

  function handleShareCircleInvite() {
    if (!myCircle) return;
    const myNick = getNickname() || '짠친';
    const query = `circle=${encodeURIComponent(myCircle.circle.invite_code)}&by=${encodeURIComponent(userId)}&bn=${encodeURIComponent(myNick)}`;
    shareExternal(buildCircleInviteMessage(myNick, myCircle.circle.name, myCircle.circle.invite_code), query).then(ok => {
      showFeedToast(ok ? '💌 초대장을 보냈어요!' : '공유에 실패했어요. 잠시 후 다시 시도해 주세요.');
    });
  }

  // ── ⚔️ 1:1 오늘 배틀 — 짝꿍과 하루 덜 쓰기 대결, 다음날 자동 정산 ──
  const [todayBattle, setTodayBattle] = useState<Battle | null>(null);
  const [battleResult, setBattleResult] = useState<{ outcome: 'win' | 'lose' | 'draw' | 'void'; oppNick: string; myTotal: number | null; oppTotal: number | null } | null>(null);
  useEffect(() => {
    const today = getTodayStr();
    fetchMyBattle(userId, today).then(b => setTodayBattle(b)).catch(() => {});
    // 어제 배틀 정산 (1회, settled 플래그로 중복 방지)
    const yd = new Date(today + 'T00:00:00');
    yd.setDate(yd.getDate() - 1);
    const ydStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
    fetchMyBattle(userId, ydStr).then(async b => {
      if (!b) return;
      const settledKey = `savelog_battle_settled_${b.id}`;
      try { if (localStorage.getItem(settledKey)) return; } catch {}
      const amIChallenger = b.challenger === userId;
      const oppId = amIChallenger ? b.opponent : b.challenger;
      const oppNick = (amIChallenger ? b.opponent_nick : b.challenger_nick) || '짝꿍';
      const totals = await fetchDayTotals([userId, oppId], ydStr);
      const me = totals[userId];
      const opp = totals[oppId];
      let outcome: 'win' | 'lose' | 'draw' | 'void';
      if (!me?.recorded && !opp?.recorded) outcome = 'void';
      else if (!opp?.recorded) outcome = 'win';   // 상대 기록 없음 = 기권승
      else if (!me?.recorded) outcome = 'lose';
      else if (me.total < opp.total) outcome = 'win';
      else if (me.total > opp.total) outcome = 'lose';
      else outcome = 'draw';
      try { localStorage.setItem(settledKey, '1'); } catch {}
      if (outcome === 'win') addJelly(30);
      setBattleResult({ outcome, oppNick, myTotal: me?.recorded ? me.total : null, oppTotal: opp?.recorded ? opp.total : null });
    }).catch(() => {});
  }, [userId, refreshToken]);

  function handleChallengeBattle() {
    if (!myDuo || todayBattle) return;
    const isA = myDuo.member_a === userId;
    const oppId = isA ? myDuo.member_b : myDuo.member_a;
    const oppNick = (isA ? myDuo.nickname_b : myDuo.nickname_a) || '짝꿍';
    const myNick = getNickname() || '짠친';
    createBattle(userId, myNick, oppId, oppNick, getTodayStr()).then(b => {
      if (b) {
        setTodayBattle(b);
        sendCheerNotification(userId, oppId, myNick, `⚔️ ${myNick}님이 '오늘 하루 덜 쓰기 배틀'을 신청했어요! 자정에 정산됩니다`).catch(() => {});
        showFeedToast(`⚔️ ${oppNick}님에게 도전장을 보냈어요! 오늘 밤 정산됩니다`);
      } else {
        showFeedToast('배틀 신청에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    });
  }

  // ── 🐲 서클 주간 보스 — 우리 서클만의 합동 레이드 (HP는 멤버 수 비례) ──
  const [weeklyBoss, setWeeklyBoss] = useState<WeeklyBoss | null>(null);
  const [bossClaimTick, setBossClaimTick] = useState(0);
  const bossClaimKey = myCircle ? `savelog_boss_reward_${getWeekKey()}__${myCircle.circle.id}` : '';
  const bossRewardClaimed = React.useMemo(() => {
    void bossClaimTick;
    if (!bossClaimKey) return false;
    try { return localStorage.getItem(bossClaimKey) === '1'; } catch { return false; }
  }, [bossClaimKey, bossClaimTick]);

  useEffect(() => {
    if (!myCircle) { setWeeklyBoss(null); return; }
    const key = `${getWeekKey()}__c__${myCircle.circle.id}`;
    const hp = Math.max(300, 150 * myCircle.members.length);
    fetchOrCreateWeeklyBoss(key, hp).then(b => setWeeklyBoss(b)).catch(() => {});
  }, [refreshToken, myCircle]);

  function handleClaimBossReward() {
    if (bossRewardClaimed || !bossClaimKey) return;
    try { localStorage.setItem(bossClaimKey, '1'); } catch {}
    setBossClaimTick(t => t + 1);
    addJelly(50);
    showFeedToast('🎉 보스 처치 보상 젤리 50개 획득!');
  }

  // ── 🔥 서버 관계 자본 — 양방향 교류 스트릭 (상대도 같은 숫자를 본다) ──
  const [serverRelations, setServerRelations] = useState<Record<string, ServerRelation>>({});
  useEffect(() => {
    fetchMyInteractions(userId).then(list => {
      const map: Record<string, ServerRelation> = {};
      list.forEach(r => { map[r.userId] = r; });
      setServerRelations(map);
    }).catch(() => {});
  }, [userId, refreshToken, relTick]);

  // 서버 스트릭도 로컬과 동일한 신선도 규칙: 오늘/어제 교류가 없으면 0으로 표시
  function effectiveServerStreak(r: ServerRelation): number {
    const today = getTodayStr();
    const yd = new Date(today + 'T00:00:00');
    yd.setDate(yd.getDate() - 1);
    const ydStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
    return (r.lastDate === today || r.lastDate === ydStr) ? r.streak : 0;
  }

  // ── ⚖️ 오늘의 판정 큐 — 아직 반응 없는 글에 반응을 조직해 "글=반응"을 시스템으로 보장 ──
  const [judgeSkipped, setJudgeSkipped] = useState<Set<string>>(new Set());
  const [judgedCount, setJudgedCount] = useState(0);

  const judgeQueue = React.useMemo(() => {
    return entries.filter(e =>
      e.user_id !== userId &&
      (e.trust_count + e.doubt_count) === 0 &&
      !e.my_reaction &&
      !feedVotes[e.id] &&
      !judgeSkipped.has(e.id)
    )
      // 서클 멤버의 글 우선 — 아는 사람의 기록부터 판정 (하이퍼로컬 주의 배분)
      .sort((a, b) => (circleMemberIdSet.has(b.user_id) ? 1 : 0) - (circleMemberIdSet.has(a.user_id) ? 1 : 0))
      .slice(0, 3);
  }, [entries, userId, feedVotes, judgeSkipped, circleMemberIdSet]);

  function judgeSnippet(e: EntryWithReactions): string {
    const note = e.items.find(it => it.category === '한마디' || it.category === '꿀팁' || it.category === '소비 고민');
    if (note?.comment) return note.comment.replace(/^\[.*?\]\s*/, '');
    const item = e.items.find(it => it.category !== '마일스톤');
    if (!item) return '오늘의 기록';
    const label = item.comment || item.category;
    return e.total_amount > 0 ? `${label} · ${formatAmount(e.total_amount)}` : `${label} · 무지출 🌿`;
  }

  async function handleJudge(e: EntryWithReactions, verdict: 'trust' | 'doubt' | 'ok' | 'over', ev: React.MouseEvent<HTMLButtonElement>) {
    setJudgedCount(c => c + 1);
    if (verdict === 'ok' || verdict === 'over') {
      await handleFeedVote(e.id, verdict);
      recordInteraction(e.user_id, e.nickname || undefined);
      setRelTick(t => t + 1);
      // 투표 판정 알림 — 리액션(trust/doubt) 알림은 handleReact 안에서 공통 처리
      const verdictLabel = verdict === 'ok' ? '🌱 참아!' : '💸 사도 돼';
      sendCheerNotification(userId, e.user_id, getNickname() || '짠친', `⚖️ 회원님의 기록에 ${verdictLabel} 판정이 도착했어요!`).catch(() => {});
    } else {
      await handleReact(e, verdict, ev);
    }
  }

  // 거지방 스탬프 토글 — optimistic 반영 + 새 스탬프면 글쓴이 알림·관계 자본
  async function handleStamp(entry: EntryWithReactions, stampKey: string) {
    if (entry.user_id === userId) return;
    const prevKey = entry.my_stamp;
    const removing = prevKey === stampKey;
    setEntries(prev => prev.map(e => {
      if (e.id !== entry.id) return e;
      const counts = { ...(e.stamp_counts || {}) };
      if (prevKey) counts[prevKey] = Math.max(0, (counts[prevKey] ?? 1) - 1);
      if (!removing) counts[stampKey] = (counts[stampKey] ?? 0) + 1;
      return { ...e, stamp_counts: counts, my_stamp: removing ? null : stampKey };
    }));
    if (!removing) {
      recordInteraction(entry.user_id, entry.nickname || undefined);
      setRelTick(t => t + 1);
      const s = STAMP_BY_KEY[stampKey];
      if (s && !prevKey) {
        sendCheerNotification(userId, entry.user_id, getNickname() || '짠친', `${s.emoji} "${s.label}" 스탬프가 회원님의 기록에 찍혔어요!`).catch(() => {});
      }
    }
    try {
      await toggleStamp(entry.id, userId, stampKey);
    } catch { /* 실패해도 다음 피드 로드에서 서버 상태로 동기화 */ }
  }

  async function handleReact(entry: EntryWithReactions, type: 'trust' | 'doubt', e: React.MouseEvent<HTMLButtonElement>) {
    if (entry.user_id === userId) return;
    if (togglingRef.current.has(entry.id)) return;
    togglingRef.current.add(entry.id);
    setToggling(prev => new Set(prev).add(entry.id));

    // 파티클 생성
    spawnParticles(type === 'trust' ? '💖' : '🤔', e);

    // 관계 자본 적립 + 글쓴이 알림 — 새 리액션을 누를 때만(취소·변경 제외)
    if (entry.my_reaction !== type) {
      recordInteraction(entry.user_id, entry.nickname || undefined);
      setRelTick(t => t + 1);
      if (entry.my_reaction === null) {
        const label = type === 'trust' ? '👏 짠내난다' : '🤔 진짜야?';
        sendCheerNotification(userId, entry.user_id, getNickname() || '짠친', `${label} 반응이 회원님의 기록에 도착했어요!`).catch(() => {});
      }
    }

    // optimistic update
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== entry.id) return e;
        const same = e.my_reaction === type;
        const prevType = e.my_reaction;
        return {
          ...e,
          my_reaction: same ? null : type,
          trust_count:
            type === 'trust'
              ? e.trust_count + (same ? -1 : 1)
              : e.trust_count - (prevType === 'trust' ? 1 : 0),
          doubt_count:
            type === 'doubt'
              ? e.doubt_count + (same ? -1 : 1)
              : e.doubt_count - (prevType === 'doubt' ? 1 : 0),
        };
      }),
    );

    try {
      await toggleReaction(entry.id, userId, type);
    } catch {
      // 네트워크 오류 시 optimistic update 롤백
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...entry } : e)),
      );
    } finally {
      togglingRef.current.delete(entry.id);
      setToggling(prev => { const s = new Set(prev); s.delete(entry.id); return s; });
    }
  }

  // 더블 탭 시 인스타그램 하트 애니메이션 및 짠내난다(trust) 반응 자동 활성화
  function handleDoubleTap(entry: EntryWithReactions, e: React.MouseEvent<HTMLDivElement>) {
    if (entry.user_id === userId) return;
    if (togglingRef.current.has(entry.id)) return; // 이 항목 반응 진행 중이면 애니메이션도 생략

    // 하트 애니메이션 켜기
    setDoubleTappedHearts(prev => ({ ...prev, [entry.id]: true }));
    setTimeout(() => {
      setDoubleTappedHearts(prev => ({ ...prev, [entry.id]: false }));
    }, 800);

    // trust 반응이 이미 켜져있다면 중복 처리 안하고, 꺼져있다면 누르기
    if (entry.my_reaction !== 'trust') {
      const rect = e.currentTarget.getBoundingClientRect();
      const fakeEvent = {
        currentTarget: {
          getBoundingClientRect: () => rect
        }
      } as unknown as React.MouseEvent<HTMLButtonElement>;
      handleReact(entry, 'trust', fakeEvent);
    }
  }

  // 응원 쪽지 전송 제출
  function handleSendMessageSubmit() {
    if (!messageRecipientEntry || !messageText.trim()) return;
    
    const senderName = getNickname() || '나';
    sendCheeringMessage(
      messageRecipientEntry.nickname || '익명',
      messageText,
      senderName,
      myPersonaKey
    );

    // 관계 자본 적립 — 응원 쪽지는 가장 강한 1:1 교류
    recordInteraction(messageRecipientEntry.user_id, messageRecipientEntry.nickname || undefined);
    setRelTick(t => t + 1);

    // 쪽지 전송 완료 피드백 토스트
    showFeedToast(`${messageRecipientEntry.nickname}님에게 따뜻한 응원 쪽지를 보냈어요! ✉️`);

    // 모달 상태 초기화
    setMessageRecipientEntry(null);
    setMessageText('');
  }

  function addComment(entryId: string, text: string) {
    setLocalComments(prev => {
      const existing = prev[entryId] || [];
      if (existing.some((c) => c.sender === '나' && c.text === text)) return prev;
      if (existing.length >= 20) return prev; // 엔트리당 최대 20개 댓글
      return { ...prev, [entryId]: [...existing, { sender: '나', text }] };
    });
  }

  async function submitCommentInput(entryId: string) {
    const text = (commentInputs[entryId] || '').trim();
    if (!text) return;
    setCommentInputs(prev => ({ ...prev, [entryId]: '' }));

    // 서버 미설정 환경은 기존 로컬 댓글로 폴백
    if (!isSupabaseConfigured) {
      addComment(entryId, text);
      return;
    }

    const myNick = getNickname() || '나';
    // optimistic — 즉시 스레드에 노출
    const temp: CommunityComment = {
      id: `temp-${Date.now()}`,
      post_id: entryId,
      user_id: userId,
      nickname: myNick,
      persona: getPersona() ?? null,
      content: text,
      created_at: new Date().toISOString(),
    };
    setServerComments(prev => ({ ...prev, [entryId]: [...(prev[entryId] || []), temp] }));

    const saved = await addCommunityComment({ post_id: entryId, user_id: userId, nickname: myNick, persona: getPersona(), content: text });
    if (saved) {
      setServerComments(prev => ({ ...prev, [entryId]: (prev[entryId] || []).map(c => (c.id === temp.id ? saved : c)) }));
      // 글쓴이에게 댓글 도착 알림 + 관계 자본 적립 (내 글 제외)
      const entry = entries.find(en => en.id === entryId);
      if (entry && entry.user_id !== userId) {
        recordInteraction(entry.user_id, entry.nickname || undefined);
        setRelTick(t => t + 1);
          sendCheerNotification(userId, entry.user_id, myNick, `💬 회원님의 기록에 댓글이 달렸어요: "${text.slice(0, 40)}"`).catch(() => {});
      }
    } else {
      // 서버 저장 실패 — optimistic 롤백 후 로컬 저장으로 유실 방지
      setServerComments(prev => ({ ...prev, [entryId]: (prev[entryId] || []).filter(c => c.id !== temp.id) }));
      addComment(entryId, text);
      showFeedToast('댓글이 이 기기에만 저장됐어요. 네트워크를 확인해 주세요.');
    }
  }

  async function handleToggleFollow(targetUserId: string, targetNickname: string) {
    if (followInFlight.current.has(targetUserId)) return;
    followInFlight.current.add(targetUserId);

    // 낙관적 업데이트
    const prevState = getFollowedUsers();
    const wasFollowing = !!prevState[targetUserId];
    const optimistic = wasFollowing ? false : true;
    const nextLocal = { ...prevState };
    if (optimistic) nextLocal[targetUserId] = targetNickname;
    else delete nextLocal[targetUserId];
    saveFollowedUsers(nextLocal);
    setFollowedUsers(nextLocal);

    try {
      const myNickname = getNickname() ?? '익명';
      const { following, error } = await toggleFollowSupabase(userId, targetUserId, targetNickname, myNickname);
      if (error) {
        // 롤백
        saveFollowedUsers(prevState);
        setFollowedUsers(prevState);
        showFeedToast('팔로우 처리에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      // 서버 결과가 낙관과 다르면 보정
      const corrected = { ...nextLocal };
      if (following) corrected[targetUserId] = targetNickname;
      else delete corrected[targetUserId];
      saveFollowedUsers(corrected);
      setFollowedUsers(corrected);
      // 맞팔 성사 = 짝꿍 확정 → 축하 + 보상 + 관계 자본 시드 (상호성 유인)
      if (following && followerIdSetRef.current.has(targetUserId)) {
        recordInteraction(targetUserId, targetNickname);
        setRelTick(t => t + 1);
        addJelly(20);
        showFeedToast(`🤝 ${targetNickname}님과 절약 짝꿍이 됐어요! +20 젤리`);
      } else {
        showFeedToast(following ? `${targetNickname}님을 팔로우했어요 👥` : `${targetNickname}님 팔로우 해제`);
      }
    } finally {
      followInFlight.current.delete(targetUserId);
    }
  }

  // 검색 (디바운스 300ms)
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const q = searchQuery.trim();
    if (q.length === 0) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      searchUsers(q, userId).then(results => {
        setSearchResults(results);
        setSearching(false);
      }).catch(() => setSearching(false));
    }, 300);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery, userId]);

  // Pull-to-refresh
  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const el = screenRef.current;
    if (!el || el.scrollTop > 0 || pullState.refreshing) return;
    pullStartRef.current = e.touches[0].clientY;
  }

  function handleTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (pullStartRef.current === null) return;
    const dy = e.touches[0].clientY - pullStartRef.current;
    if (dy > 0) {
      const damped = Math.min(dy * 0.5, 100);
      setPullState({ y: damped, refreshing: false });
    }
  }

  function handleTouchEnd() {
    if (pullStartRef.current === null) return;
    pullStartRef.current = null;
    if (pullState.y >= 60) {
      setPullState({ y: 50, refreshing: true });
      load(true).finally(() => {
        setPullState({ y: 0, refreshing: false });
      });
    } else {
      setPullState({ y: 0, refreshing: false });
    }
  }

  // 오늘 실기록한 유저 셋 — 스토리 레일 링의 데이터
  const recordedTodaySet = React.useMemo(() => {
    const today = getTodayStr();
    return new Set(entries.filter(e => e.date === today && !e.week_key.startsWith('social-') && !e.week_key.startsWith('milestone-')).map(e => e.user_id));
  }, [entries]);

  const displayedEntries = React.useMemo(() => {
    const sorted = entries.slice().sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (feedTab === 'follow') {
      let filtered = sorted.filter(e => e.user_id === userId || !!followedUsers[e.user_id]);
      if (selectedFriendId) {
        filtered = filtered.filter(e => e.user_id === selectedFriendId);
      }
      return filtered;
    }
    if (feedTab === 'circle') {
      // 서클 = 사람 필터 — 멤버들의 글만 (내 글 포함)
      return sorted.filter(e => circleMemberIdSet.has(e.user_id));
    }
    return sorted;
  }, [entries, userId, followedUsers, feedTab, selectedFriendId, circleMemberIdSet]);

  const renderFeedCard = (entry: EntryWithReactions) => {
    const personaKey = entry.persona || (entry.user_id === userId ? myPersonaKey : null);
    const p = personaKey ? PERSONAS[personaKey] : null;

    const isMilestone = entry.items.some(it => it.category === '마일스톤');
    const isTipPost = entry.items.some(it => it.category === '꿀팁');
    const isDilemmaPost = entry.items.some(it => it.category === '소비 고민') || entry.is_balance_game;

    // 서버 댓글(모두에게 보임) + 구버전 로컬 댓글(이 기기 전용) 병합
    const comments = [
      ...(serverComments[entry.id] || []).map(c => ({ sender: c.user_id === userId ? '나' : c.nickname, text: c.content })),
      ...(localComments[entry.id] || []),
    ];
    const isExpanded = !!commentExpanded[entry.id];

    const likeCount = entry.trust_count + entry.doubt_count;
    const liked = entry.my_reaction !== null;

    const isZeroSpend = entry.items.some(it => it.amount === 0 && (it.category === '무지출' || it.category === '절약 방어'));

    let cardModifier = '';
    if (entry.user_id === userId) {
      cardModifier = 'feed-card-ig--mine';
    } else if (isMilestone) {
      cardModifier = 'feed-card-ig--milestone';
    } else if (isTipPost) {
      cardModifier = 'feed-card-ig--tip';
    } else if (isDilemmaPost) {
      cardModifier = 'feed-card-ig--dilemma';
    } else if (isZeroSpend) {
      cardModifier = 'feed-card-ig--zero';
    }

    return (
      <div
        key={entry.id}
        className={`feed-card-ig ${cardModifier}`}
      >
        {/* 짠친 판결 도장 — 같은 스탬프 2표면 잉크 도장이 찍힌다 (제품 시그니처) */}
        {(() => {
          const verdict = topStamp(entry.stamp_counts || {});
          return verdict ? (
            <span
              className={`verdict-stamp${verdict.stamp.key === 'approve' ? ' verdict-stamp--ok' : ''}`}
              aria-label={`짠친 판결: ${verdict.stamp.label} ${verdict.count}표`}
            >
              <span className="verdict-stamp-label">{verdict.stamp.label}</span>
              <span className="verdict-stamp-count">짠친 판결 · {verdict.count}표</span>
            </span>
          ) : null;
        })()}
        {/* 카드 헤더 — 아바타 + 닉네임 + 팔로우 (아바타·닉네임 탭 → 미니 프로필) */}
        <div className="feed-card-ig-header">
          <div
            className="feed-card-ig-avatar"
            style={{ ...(p ? { borderColor: p.color } : {}), ...(entry.user_id !== userId ? { cursor: 'pointer' } : {}) }}
            onClick={() => { if (entry.user_id !== userId) setQuickMenuFriend({ id: entry.user_id, nickname: entry.nickname || '짠친', personaIcon: p?.icon ?? null, personaColor: p?.color ?? 'var(--primary)' }); }}
          >
            {p ? <img src={p.icon} alt="" /> : (entry.nickname ? entry.nickname.charAt(0).toUpperCase() : '?')}
          </div>
          <div className="feed-card-ig-meta">
            <div className="feed-card-ig-nickname-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span
                className="feed-card-ig-nickname"
                style={entry.user_id !== userId ? { cursor: 'pointer' } : {}}
                onClick={() => { if (entry.user_id !== userId) setQuickMenuFriend({ id: entry.user_id, nickname: entry.nickname || '짠친', personaIcon: p?.icon ?? null, personaColor: p?.color ?? 'var(--primary)' }); }}
              >{entry.nickname}</span>
              {p && (
                <span className="feed-card-persona-badge" style={{
                  borderColor: `${p.color}35`,
                  color: p.color,
                  background: `${p.color}10`,
                  fontSize: '10px',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px'
                }}>
                  {p.emoji && <CustomIcon emoji={p.emoji} />} {p.name}
                </span>
              )}
              {/* 짝꿍·교류 스트릭 뱃지는 미니 프로필로 이동 (카드 헤더 다이어트) */}
            </div>
            <span className="feed-card-ig-time">{timeAgo(entry.created_at)}</span>
          </div>

          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {isTipPost && (
              <span className="feed-badge feed-badge--green"><CustomIcon emoji="💡" /> 꿀팁</span>
            )}
            {isDilemmaPost && (
              <span className="feed-badge feed-badge--red"><CustomIcon emoji="⚖️" /> 투표</span>
            )}
            {isMilestone && (
              <span className="feed-badge feed-badge--yellow"><CustomIcon emoji="🏆" /> 달성</span>
            )}
            {isZeroSpend && !isMilestone && !isTipPost && !isDilemmaPost && (
              <span className="feed-badge feed-badge--blue"><CustomIcon emoji="🌿" /> 지갑 힐링</span>
            )}

            {/* 이미 팔로우 중이면 버튼 숨김 — 누를 게 없는 상태가 정상 상태 */}
            {entry.user_id !== userId && !followedUsers[entry.user_id] && (
              <button
                onClick={() => handleToggleFollow(entry.user_id, entry.nickname || '')}
                className="feed-card-ig-follow"
                style={{ marginLeft: '4px' }}
              >
                팔로우
              </button>
            )}
          </div>
        </div>

        {/* 마일스톤 달성 메시지 */}
        {entry.items.filter(it => it.category === '마일스톤').map((it, i) => (
          <p key={i} className="feed-milestone-note">{it.comment}</p>
        ))}

        {/* 절약 꿀팁 내용 */}
        {isTipPost && (
          <div className="tip-post-body">
            {entry.items.filter(it => it.category === '꿀팁').map((it, i) => (
              <p key={i}>{(it.comment || '').replace(/^\[.*?\]\s*/, '')}</p>
            ))}
          </div>
        )}

        {/* 소비 고민 및 inline 투표 */}
        {isDilemmaPost && (() => {
          const dilemmaItem = entry.items.find(it => it.category === '소비 고민');
          const text = (dilemmaItem?.comment || '').replace(/^\[.*?\]\s*/, '');
          const amount = dilemmaItem?.amount || entry.total_amount || 0;
          
          const myVote = feedVotes[entry.id];
          const hasVoted = !!myVote || entry.user_id === userId;

          // 실제 짠친 투표 집계 우선 사용, 없으면(아직 0표) seed 기반 추정 폴백
          const realVotes = dilemmaVotes[entry.id];
          const hasRealVotes = !!realVotes && realVotes.total > 0;

          const seed = entry.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const overPctBase = (seed % 40) + 30; // 30% ~ 70%

          let overPct: number;
          let okPct: number;
          if (hasRealVotes) {
            overPct = Math.round((realVotes.over / realVotes.total) * 100);
            okPct = 100 - overPct;
          } else {
            overPct = overPctBase;
            okPct = 100 - overPct;
            if (myVote === 'over') {
              overPct = Math.min(95, overPct + 5);
              okPct = 100 - overPct;
            } else if (myVote === 'ok') {
              okPct = Math.min(95, okPct + 5);
              overPct = 100 - okPct;
            }
          }

          const totalFeedVotes = hasRealVotes ? realVotes.total : ((seed % 30) + 12 + (myVote ? 1 : 0));

          return (
            <div className="dilemma-post-body">
              {text && <p>{text}</p>}

              <div className="dilemma-amount-box">
                <span className="dilemma-amount-label">예상 소비액</span>
                <span className="dilemma-amount-value">{amount.toLocaleString('ko-KR')}원</span>
              </div>

              {hasVoted ? (
                <div className="dilemma-result-section">
                  <div className="dilemma-result-labels">
                    <span className="dilemma-result-over">
                      행복 충전 {overPct}%
                      {myVote === 'over' && <span className="dilemma-my-badge dilemma-my-badge--over">내 선택 <CustomIcon emoji="🔥" /></span>}
                    </span>
                    <span className="dilemma-result-total">총 {totalFeedVotes}명 참여</span>
                    <span className="dilemma-result-ok">
                      {myVote === 'ok' && <span className="dilemma-my-badge dilemma-my-badge--ok">내 선택 <CustomIcon emoji="🌱" /></span>}
                      스마트 세이브 {okPct}%
                    </span>
                  </div>

                  <div className="dilemma-bar">
                    <div className="dilemma-bar-over" style={{ width: `${overPct}%` }} />
                    <div className="dilemma-bar-ok" style={{ width: `${okPct}%` }} />
                  </div>
                </div>
              ) : (
                <div className="dilemma-vote-btns">
                  <button
                    onClick={() => handleFeedVote(entry.id, 'over')}
                    className="balance-vote-card balance-vote-card--over"
                  >
                    <span className="vote-emoji"><CustomIcon emoji="🔥" /></span>
                    <span className="vote-title">행복 충전</span>
                  </button>
                  <button
                    onClick={() => handleFeedVote(entry.id, 'ok')}
                    className="balance-vote-card balance-vote-card--ok"
                  >
                    <span className="vote-emoji"><CustomIcon emoji="🌱" /></span>
                    <span className="vote-title">스마트 세이브</span>
                  </button>
                </div>
              )}

              {/* 작성자 본인: 짠친 투표 후 최종 결정 → 참으면 목표 충전 + 가변 응원 보너스 */}
              {entry.user_id === userId && (() => {
                void dilemmaTick; // 결정 후 리렌더 반영용
                const outcome = getDilemmaOutcome(entry.id);
                if (outcome) {
                  return (
                    <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '12px', background: outcome === 'resisted' ? 'var(--primary-light)' : '#F7F8FA', fontSize: '12.5px', fontWeight: 800, color: outcome === 'resisted' ? 'var(--primary)' : 'var(--text-sub)', textAlign: 'center' }}>
                      {outcome === 'resisted'
                        ? `🌱 짠친들과 함께 참았어요! ${formatAmount(amount)}을 목표에 충전`
                        : '🔥 질렀어요! 행복했길 바라요 — 다음엔 또 막아줄게요'}
                    </div>
                  );
                }
                return (
                  <div style={{ marginTop: '10px' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '11.5px', color: 'var(--text-sub)', textAlign: 'center', fontWeight: 700 }}>짠친 투표를 보고 최종 결정해요</p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => handleResolveDilemma(entry.id, amount, false)}
                        style={{ flex: 1, padding: '9px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>🌱 참았어요</button>
                      <button onClick={() => handleResolveDilemma(entry.id, amount, true)}
                        style={{ flex: 1, padding: '9px', borderRadius: '10px', border: '1px solid #E4E6EA', background: '#F7F8FA', color: 'var(--text-main)', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>🔥 질렀어요</button>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* 오늘 한마디 (💬 한마디 특수 항목) */}
        {entry.items.filter(it => it.category === '한마디').map((it, i) => (
          <p key={i} className="feed-note"><CustomIcon emoji="💬" /> {it.comment}</p>
        ))}

        {/* 인증샷 / 영수증 이미지 */}
        {entry.image && (
          <div className="feed-card-image-wrap" onClick={() => setLightboxImage(entry.image || null)} onDoubleClick={(e) => handleDoubleTap(entry, e)} style={{ position: 'relative' }}>
            <img src={entry.image} alt="Spending Proof" className="feed-card-img" />
            {doubleTappedHearts[entry.id] && (
              <div className="heart-double-tap-overlay"><CustomIcon emoji="❤️" /></div>
            )}
          </div>
        )}

        {/* 지출 항목 */}
        {(() => {
          const spendItems = entry.items.filter(it => it.category !== '한마디' && it.category !== '마일스톤' && it.category !== '꿀팁' && it.category !== '소비 고민');
          if (spendItems.length === 0) return null;
          return (
            <div className="feed-items">
              {spendItems.map((item, i) => {
                const emotionMatch = (item.comment || '').match(/^\[(.*?)\]/);
                const emotionTag = emotionMatch ? emotionMatch[1] : null;
                const commentText = (item.comment || '').replace(/^\[.*?\]\s*/, '');
                
                let emotionClass = '';
                if (emotionTag) {
                  if (emotionTag.includes('필요')) emotionClass = 'emotion-badge--need';
                  else if (emotionTag.includes('충동')) emotionClass = 'emotion-badge--impulse';
                  else if (emotionTag.includes('홧김')) emotionClass = 'emotion-badge--stress';
                  else if (emotionTag.includes('후회')) emotionClass = 'emotion-badge--no-regret';
                }

                return (
                  <div key={i} className="feed-item">
                    <span className="feed-item-emoji"><CustomIcon emoji={item.emoji} /></span>
                    <div className="feed-item-info">
                      <span className="feed-item-cat">
                        {item.category === '절약 방어' ? (
                          <span><CustomIcon emoji="🌱" /> 플러스 저축</span>
                        ) : item.category === '무지출' ? (
                          <span><CustomIcon emoji="🌿" /> 지갑 힐링</span>
                        ) : (
                          item.category
                        )}
                        {emotionTag && (
                          <span className={`feed-item-emotion-badge ${emotionClass}`}>
                            {emotionTag}
                          </span>
                        )}
                      </span>
                      {commentText && <span className="feed-item-comment">{commentText}</span>}
                    </div>
                    <span className={`feed-item-amount ${item.amount === 0 ? 'feed-item-amount--zero' : ''}`}>
                      {item.amount === 0 ? '0원' : formatAmount(item.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* 액션 바 — X 문법: 아이콘 3개(댓글·스탬프·응원), 카운트만 회색으로 */}
        {!isMilestone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
            <button
              onClick={() => setCommentExpanded(prev => ({ ...prev, [entry.id]: !prev[entry.id] }))}
              aria-label="댓글"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '12px 12px 12px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mute)', fontSize: '12px', fontWeight: 700 }}
            >
              <IconChat />{comments.length > 0 ? ` ${comments.length}` : ''}
            </button>
            {entry.user_id !== userId && (
              <button
                onClick={() => setStampPickerFor(prev => (prev === entry.id ? null : entry.id))}
                aria-label="스탬프"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '12px 12px', background: 'none', border: 'none', cursor: 'pointer', color: entry.my_stamp ? 'var(--primary)' : 'var(--text-mute)', fontSize: '12px', fontWeight: 700 }}
              >
                <IconStamp />{Object.values(entry.stamp_counts ?? {}).reduce((a, b) => a + b, 0) > 0 ? ` ${Object.values(entry.stamp_counts ?? {}).reduce((a, b) => a + b, 0)}` : ''}
              </button>
            )}
            {entry.user_id !== userId ? (
              <button
                onClick={(e) => handleReact(entry, 'trust', e)}
                disabled={toggling.has(entry.id)}
                aria-label="응원하기"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '12px 12px', background: 'none', border: 'none', cursor: 'pointer', color: liked ? 'var(--primary)' : 'var(--text-mute)', fontSize: '12px', fontWeight: 700 }}
              >
                <IconHeart filled={liked} />{likeCount > 0 ? ` ${likeCount}` : ''}
              </button>
            ) : (
              <>
                {likeCount > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '12px 12px', color: 'var(--text-mute)', fontSize: '12px', fontWeight: 700 }}>
                    <IconHeart filled /> {likeCount}
                  </span>
                )}
                <button
                  onClick={() => handleBragShare(entry)}
                  aria-label="자랑하기"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '12px 12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-mute)', fontSize: '12px', fontWeight: 700 }}
                >
                  <IconShare />
                </button>
              </>
            )}
            {/* 받은 스탬프 요약 — 있는 것만, 읽기 전용 느낌의 작은 칩 */}
            {(() => {
              const received = STAMPS.filter(st => (entry.stamp_counts?.[st.key] ?? 0) > 0);
              if (received.length === 0) return null;
              return (
                <span style={{ display: 'inline-flex', gap: '4px', marginLeft: 'auto', overflow: 'hidden' }}>
                  {received.slice(0, 3).map(st => (
                    <span key={st.key} title={st.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '3px 8px', borderRadius: '100px', fontSize: '10.5px', fontWeight: 800, background: '#F7F8FA', color: 'var(--text-sub)' }}>
                      <CustomIcon emoji={st.emoji} /> {entry.stamp_counts[st.key]}
                    </span>
                  ))}
                </span>
              );
            })()}
          </div>
        )}

        {/* 스탬프 피커 — 아이콘 탭 시에만 6종 가로 스트립 */}
        {stampPickerFor === entry.id && entry.user_id !== userId && (
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '4px 0 6px', scrollbarWidth: 'none' }} className="no-scrollbar">
            {STAMPS.map(st => {
              const mine = entry.my_stamp === st.key;
              return (
                <button
                  key={st.key}
                  onClick={() => { handleStamp(entry, st.key); setStampPickerFor(null); }}
                  title={st.label}
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 11px', borderRadius: '100px', fontSize: '11.5px', fontWeight: 800, cursor: 'pointer', border: mine ? '1.5px solid var(--primary)' : '1px solid var(--divider)', background: mine ? 'var(--primary-light)' : '#F7F8FA', color: mine ? 'var(--primary)' : 'var(--text-sub)' }}
                >
                  <CustomIcon emoji={st.emoji} /> {st.label}
                </button>
              );
            })}
          </div>
        )}

        {/* 댓글 스레드 — 온디맨드 (💬 탭 시에만 목록+입력 확장) */}
        {!isMilestone && isExpanded && (
          <div className="feed-thread-section">
            {comments.length > 0 && (
              <div className="feed-thread-list">
                {comments.map((c, i) => (
                  <div key={i} className="feed-thread-row">
                    <div className="feed-thread-avatar">{c.sender[0] ?? '나'}</div>
                    <div className="feed-thread-content">
                      <span className="feed-thread-name">{c.sender}</span>
                      <span className="feed-thread-text">{renderTextWithEmoji(c.text)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="feed-thread-input-row">
              <input
                id={`comment-input-${entry.id}`}
                type="text"
                value={commentInputs[entry.id] || ''}
                onChange={e => setCommentInputs(prev => ({ ...prev, [entry.id]: e.target.value.slice(0, 60) }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitCommentInput(entry.id); } }}
                placeholder="댓글 달기..."
                maxLength={60}
                className="feed-thread-input"
              />
              <button
                onClick={() => submitCommentInput(entry.id)}
                disabled={!(commentInputs[entry.id] || '').trim()}
                className="feed-thread-submit"
              >
                게시
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // 친구 초대 카드 — 피드 사이 인터스티셜로 노출 (SNS 추천 카드 스타일)
  const inviteCard = (
    <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
      <div style={{ textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)' }}><CustomIcon emoji="👯" /> 같이 아끼면 진짜 덜 씁니다</p>
        <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--text-sub)', lineHeight: 1.4 }}>친구를 초대하면 <strong>스트릭 보호권 +1</strong>. 하루 빼먹어도 불꽃이 안 꺼져요</p>
      </div>
      <button
        onClick={() => openContactsInvite(onShieldEarned)}
        style={{ flexShrink: 0, padding: '9px 14px', borderRadius: '12px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12.5px', whiteSpace: 'nowrap' }}
      >
        초대하기
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="screen screen-feed">
        <div className="feed-skeleton">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton-card" />)}
        </div>
      </div>
    );
  }

  return (
    <div
      className="screen screen-feed"
      ref={screenRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ transform: pullState.y > 0 ? `translateY(${pullState.y}px)` : undefined, transition: pullState.y === 0 ? 'transform 240ms ease' : undefined }}
    >
      {/* Pull-to-refresh 인디케이터 */}
      {(pullState.y > 0 || pullState.refreshing) && (
        <div className="ptr-indicator" style={{ top: -50, height: 50 }}>
          <span className={pullState.refreshing ? 'ptr-spin' : ''}>
            {pullState.refreshing ? <CustomIcon emoji="🔄" /> : (pullState.y >= 60 ? '↑ 놓으면 새로고침' : '↓ 당겨서 새로고침')}
          </span>
        </div>
      )}



      {/* 앱바 — 로고 + 포인트 칩. 크롬은 여기까지 */}
      <div className="feed-appbar">
        <span className="feed-appbar-logo">savelog</span>
        {pendingPoints > 0 ? (
          <button className="feed-point-chip" onClick={onClaimPending} disabled={pendingClaiming} style={{ opacity: pendingClaiming ? 0.6 : 1 }}>
            {pendingClaiming ? '광고 시청 중...' : `${pendingPoints}원 받기`}
          </button>
        ) : (
          <button onClick={onNavigateToMyLog} style={{ background: 'none', border: 'none', fontSize: '12px', color: 'var(--text-mute)', fontWeight: 700, cursor: 'pointer' }}>마이 ›</button>
        )}
      </div>

      {/* 스토리 레일 — 미션·멤버 현황·보스를 아바타 링 하나의 문법으로 (지시문 0줄) */}
      {(() => {
        const recordedTodayFlag = daily.recorded && daily.date === getTodayStr();
        const myPersona = getPersona();
        const members = (myCircle?.members ?? []).filter(m => m.user_id !== userId);
        const bossPct = weeklyBoss ? Math.max(0, Math.round((weeklyBoss.hp / weeklyBoss.max_hp) * 100)) : 0;
        return (
          <div className="story-rail">
            {/* 나 — 기록 전: 점선 링(탭=기록) / 후: 채운 링(탭=룰렛) */}
            <button className="story-item" onClick={() => { if (!recordedTodayFlag) onRecord(); else setShowRoulette(true); }}>
              <span className={`story-avatar ${recordedTodayFlag ? 'story-ring' : 'story-ring--empty'}`}>
                {myPersona ? <img src={PERSONAS[myPersona].icon} alt="" /> : <CustomIcon emoji="🐷" />}
                {streak.streak > 0 && <span className="story-badge">🔥{streak.streak}</span>}
                {recordedTodayFlag && rouletteSpins > 0 && <span className="story-badge" style={{ left: '-4px', right: 'auto', color: '#b45309' }}>🎰{rouletteSpins}</span>}
              </span>
              <span className="story-name">{recordedTodayFlag ? '나' : '기록하기'}</span>
            </button>

            {/* 서클 멤버 — 오늘 기록 여부가 링으로 */}
            {members.map(m => (
              <button key={m.user_id} className="story-item" onClick={() => setQuickMenuFriend({ id: m.user_id, nickname: m.nickname || '짠친', personaIcon: null, personaColor: 'var(--primary)' })}>
                <span className={`story-avatar ${recordedTodaySet.has(m.user_id) ? 'story-ring' : 'story-ring--empty'}`}>
                  {(m.nickname || '짠')[0]}
                </span>
                <span className="story-name">{m.nickname || '짠친'}</span>
              </button>
            ))}

            {/* 서클 보스 or 서클 만들기 */}
            {myCircle && weeklyBoss ? (
              <button className="story-item" onClick={() => setShowBossSheet(true)}>
                <span className="story-avatar story-ring--boss">
                  <CustomIcon emoji={weeklyBoss.boss_emoji || '🐲'} />
                  <span className="story-badge" style={{ color: '#a855f7' }}>{weeklyBoss.hp <= 0 ? '처치' : `${bossPct}%`}</span>
                </span>
                <span className="story-name">주간 보스</span>
              </button>
            ) : !myCircle && circleLoaded ? (
              <button className="story-item" onClick={() => { userTouchedTabRef.current = true; setFeedTab('circle'); }}>
                <span className="story-avatar story-ring--empty" style={{ color: 'var(--text-mute)' }}>＋</span>
                <span className="story-name">서클 만들기</span>
              </button>
            ) : null}
          </div>
        );
      })()}

      {welcomeBack && (
        <button
          onClick={() => setWelcomeBack(null)}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: '14px', border: '1px solid rgba(11, 169, 122, 0.25)', background: 'rgba(11, 169, 122, 0.06)', cursor: 'pointer' }}
        >
          <IconHeart filled size={18} className="" />
          <span style={{ flex: 1, fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4 }}>
            자리 비운 사이 내 기록에 반응 {welcomeBack.reactions + welcomeBack.comments}개가 달렸어요
          </span>
          <span style={{ fontSize: '11px', color: 'var(--text-mute)', fontWeight: 700 }}>닫기</span>
        </button>
      )}

      {globalStats !== null && globalStats.weekRecords >= 10 && (
        <p className="social-pulse">이번 주 짠친들이 남긴 기록 {globalStats.weekRecords.toLocaleString('ko-KR')}개</p>
      )}

      {/* 📝 인라인 포스트 컴포저 (기록 CTA) — 피드 최상단 */}
      <div className={`feed-composer${!daily.recorded && streak.totalDays === 0 ? ' feed-composer--onboarding' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {daily.recorded && daily.date === getTodayStr() ? (
          <div className="feed-composer-done">
            <span className="feed-composer-done-icon"><CustomIcon emoji="✅" /></span>
            <div className="feed-composer-done-info">
              <span className="feed-composer-done-text">오늘 기록 완료!</span>
              <span className="feed-composer-done-amount">{formatAmount(daily.spentAmount ?? 0)} 지출</span>
            </div>
            <button className="feed-composer-add-btn" onClick={onRecord}>추가 기록</button>
          </div>
        ) : (
          <>
            {/* 거지방식 한 줄 기록 — "커피 4500" 치면 끝. 폼은 '자세히'로 강등 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="feed-composer-avatar" style={{ flexShrink: 0 }}>
                {(() => { const p = getPersona(); return p ? <img src={PERSONAS[p].icon} alt="" className="custom-icon" /> : <CustomIcon emoji="🐷" className="custom-icon" />; })()}
              </span>
              <button onClick={onRecord} aria-label="자세히 기록" style={{ flexShrink: 0, width: '34px', height: '34px', borderRadius: '50%', border: '1px solid var(--divider)', background: '#F7F8FA', color: 'var(--text-sub)', fontSize: '18px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>＋</button>
              <input
                value={quickText}
                onChange={e => setQuickText(e.target.value.slice(0, 60))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleQuickSubmit(); } }}
                placeholder='오늘 뭐 썼어요? 예) 커피 4500'
                maxLength={60}
                className="quick-input"
              />
              <button
                onClick={handleQuickSubmit}
                disabled={!quickText.trim() || submitting}
                style={{ flexShrink: 0, padding: '13px 16px', borderRadius: '14px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '13px', opacity: !quickText.trim() || submitting ? 0.5 : 1 }}
              >
                {submitting ? '...' : '기록'}
              </button>
            </div>
            {streak.totalDays === 0 && (
              <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-mute)', textAlign: 'left' }}>
                <CustomIcon emoji="🔐" /> 닉네임만 보여요 · 토스 실명·자산 정보와 연동되지 않아요 · 금액 없이 글만 써도 무지출 기록이 돼요
              </p>
            )}
          </>
        )}
      </div>

      {/* 시스템 한 줄 — 넛지·정산·결정은 조용한 회색 행으로 */}
      {duoPartnerNudge && !(daily.recorded && daily.date === getTodayStr()) && (
        <div className="system-row">
          <span><strong>{duoPartnerNudge}</strong>님이 오늘 기록을 마쳤어요 — 공동 불꽃이 기다려요</span>
          <button onClick={onRecord} style={{ flexShrink: 0, fontSize: '12px', fontWeight: 800, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>기록 ›</button>
        </div>
      )}
      {battleResult && (
        <div className="system-row">
          <span>
            {battleResult.outcome === 'win' && `어제 배틀 승리 — ${battleResult.oppNick}님보다 덜 썼어요 (젤리 +30)`}
            {battleResult.outcome === 'lose' && `어제 배틀 패배 — ${battleResult.oppNick}님이 더 아꼈어요`}
            {battleResult.outcome === 'draw' && `어제 배틀 무승부 — ${battleResult.oppNick}님과 동점`}
            {battleResult.outcome === 'void' && '어제 배틀은 둘 다 기록이 없어 무효 처리됐어요'}
          </span>
          <button onClick={() => setBattleResult(null)} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-mute)', fontSize: '13px', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      {readyWish.length > 0 && (
        <div className="system-row">
          <span>'{readyWish[0].name}' ({formatAmount(readyWish[0].price)}) — 아직도 원해요?</span>
          <span style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
            <button onClick={() => handleWishResolve(readyWish[0].id, false)} style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>참았어요</button>
            <button onClick={() => handleWishResolve(readyWish[0].id, true)} style={{ fontSize: '12px', fontWeight: 700, color: '#FF5E62', background: 'none', border: 'none', cursor: 'pointer' }}>샀어요</button>
          </span>
        </div>
      )}

      {/* ⚖️ 오늘의 판정 큐 — 발견 탭 전용 (서클 안에서는 미션·피드가 반응을 유도) */}
      {feedTab === 'all' && (judgeQueue.length > 0 ? (() => {
        const e = judgeQueue[0];
        const isDilemma = e.is_balance_game || e.items.some(it => it.category === '소비 고민');
        return (
          <div className="glass-card" style={{ padding: '14px 16px', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800 }}>오늘의 판정</span>
              <span style={{ fontSize: '10.5px', color: 'var(--text-mute)', fontWeight: 700 }}>반응 기다리는 기록 {judgeQueue.length}건</span>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              <strong>{e.nickname}</strong> · {judgeSnippet(e)}
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {isDilemma ? (
                <>
                  <button onClick={(ev) => handleJudge(e, 'ok', ev)} style={{ flex: 1, padding: '9px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>{renderTextWithEmoji('🌱 참아!')}</button>
                  <button onClick={(ev) => handleJudge(e, 'over', ev)} style={{ flex: 1, padding: '9px', borderRadius: '10px', border: '1.5px solid rgba(255,94,98,0.4)', background: 'rgba(255,94,98,0.1)', color: '#FF5E62', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>{renderTextWithEmoji('💸 사도 돼')}</button>
                </>
              ) : (
                <>
                  <button onClick={(ev) => handleJudge(e, 'trust', ev)} style={{ flex: 1, padding: '9px', borderRadius: '10px', border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>{renderTextWithEmoji('👏 짠내난다')}</button>
                  <button onClick={(ev) => handleJudge(e, 'doubt', ev)} style={{ flex: 1, padding: '9px', borderRadius: '10px', border: '1.5px solid rgba(251,191,36,0.4)', background: 'rgba(251,191,36,0.1)', color: '#d97706', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>{renderTextWithEmoji('🤔 진짜야?')}</button>
                </>
              )}
              <button onClick={() => setJudgeSkipped(prev => new Set(prev).add(e.id))} style={{ flexShrink: 0, background: 'none', border: 'none', fontSize: '11px', color: 'var(--text-mute)', cursor: 'pointer', padding: '4px' }}>넘기기</button>
            </div>
            {!isDilemma && (
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                {(['nope', 'approve', 'chicken'] as const).map(k => {
                  const st = STAMP_BY_KEY[k];
                  if (!st) return null;
                  return (
                    <button
                      key={k}
                      onClick={() => { setJudgedCount(c => c + 1); setJudgeSkipped(prev => new Set(prev).add(e.id)); handleStamp(e, k); }}
                      style={{ flex: 1, padding: '8px 4px', borderRadius: '100px', border: '1px solid var(--divider)', background: '#F7F8FA', color: 'var(--text-sub)', fontWeight: 800, fontSize: '11.5px', cursor: 'pointer' }}
                    >
                      <CustomIcon emoji={st.emoji} /> {st.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })() : judgedCount > 0 ? (
        <div className="glass-card" style={{ padding: '12px 16px', textAlign: 'left' }}>
          <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 800, color: 'var(--primary)' }}><CustomIcon emoji="🎉" /> 오늘의 판정 완료! 짠친 {judgedCount}명에게 반응이 전달됐어요</p>
        </div>
      ) : null)}

      {/* 탭 필터: 전체 / 팔로우 / 절약 그룹 */}
      <div className="feed-tab-bar">
        {(['circle', 'all', 'follow'] as const).map((t) => (
          <button
            key={t}
            className={`feed-tab-btn${feedTab === t ? ' feed-tab-btn--active' : ''}`}
            onClick={() => { userTouchedTabRef.current = true; setFeedTab(t); }}
          >
            {t === 'circle' ? `서클${myCircle ? ` (${myCircle.members.length})` : ''}` : t === 'all' ? '발견' : `팔로우${Object.keys(followedUsers).length > 0 ? ` (${Object.keys(followedUsers).length})` : ''}`}
          </button>
        ))}
      </div>

      {/* 🔒 서클 티저 — 발견 탭의 서클 미보유 유저에게 컨셉 노출 */}
      {feedTab === 'all' && circleLoaded && !myCircle && (
        <div
          className="glass-card"
          onClick={() => { userTouchedTabRef.current = true; setFeedTab('circle'); }}
          style={{ padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', cursor: 'pointer', border: '1.5px solid var(--primary-glow)' }}
        >
          <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4, textAlign: 'left' }}>
            <CustomIcon emoji="🔒" /> 돈 얘기는 아는 사람끼리 · 3~8명 짠 서클
          </p>
          <span style={{ flexShrink: 0, fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>시작하기 ›</span>
        </div>
      )}

      {feedTab === 'circle' ? (
        myCircle ? (() => {
          return (
            <>
              {/* 서클 슬림 행 — 상세·초대는 시트로 (레일이 이미 멤버 현황을 말해줌) */}
              <div className="system-row" style={{ borderTop: '1px solid #F0F1F3' }}>
                <button onClick={() => setShowCircleSheet(true)} style={{ background: 'none', border: 'none', fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', cursor: 'pointer', padding: 0 }}>
                  {myCircle.circle.name} <span style={{ color: 'var(--text-mute)', fontWeight: 600 }}>{myCircle.members.length}/{CIRCLE_MAX_MEMBERS} ›</span>
                </button>
                <button onClick={handleShareCircleInvite} style={{ flexShrink: 0, fontSize: '12px', fontWeight: 800, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>+ 초대</button>
              </div>

              {/* 서클 피드 */}
              {displayedEntries.length === 0 ? (
                <div className="empty-state">
                  <p>아직 우리 서클의 기록이 없어요</p>
                  <p className="empty-sub">오늘 첫 기록을 남기거나, 위의 💌 초대로 친구를 데려와 보세요</p>
                </div>
              ) : (
                <div className="feed-list">
                  {displayedEntries.map((entry, idx) => (
                    <React.Fragment key={entry.id}>
                      {renderFeedCard(entry)}
                      {(idx + 1) % 5 === 0 && <FeedBannerSlot />}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </>
          );
        })() : (
          /* 서클 없음 — 온보딩 (콜드스타트: 만들기 / 코드 참여 / 공개 서클 랜덤 매칭) + 발견 미리보기 */
          <>
          <div className="glass-card" style={{ padding: '18px 16px', textAlign: 'left', marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800 }}>{renderTextWithEmoji('🔒 짠 서클')}</h3>
            <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: 'var(--text-sub)', lineHeight: 1.55 }}>
              돈 얘기는 아는 사람끼리가 편하죠. 3~8명이서 서로 오늘 쓴 걸 보고, 놀리고, 같이 주간 보스를 잡는 방이에요.
            </p>
            {circleFormMode === 'create' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input value={circleNameInput} onChange={e => setCircleNameInput(e.target.value)} maxLength={16} placeholder="서클 이름 (예: 월급사수대)" autoFocus style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: '12px', border: '1px solid var(--divider)', fontSize: '13px', background: 'rgba(255,255,255,0.8)' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleCreateCircle} disabled={!circleNameInput.trim() || circleBusy} style={{ flex: 1, padding: '11px', borderRadius: '12px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '13px', opacity: !circleNameInput.trim() || circleBusy ? 0.5 : 1 }}>{circleBusy ? '만드는 중...' : '만들기'}</button>
                  <button onClick={() => setCircleFormMode('none')} style={{ flexShrink: 0, padding: '11px 14px', borderRadius: '12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--divider)', color: 'var(--text-sub)', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>취소</button>
                </div>
              </div>
            ) : circleFormMode === 'join' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <input value={circleJoinInput} onChange={e => setCircleJoinInput(e.target.value.toUpperCase())} maxLength={6} placeholder="초대 코드 6자리" autoFocus style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: '12px', border: '1px solid var(--divider)', fontSize: '13px', letterSpacing: '2px', background: 'rgba(255,255,255,0.8)' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleJoinCircleCode} disabled={!circleJoinInput.trim() || circleBusy} style={{ flex: 1, padding: '11px', borderRadius: '12px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '13px', opacity: !circleJoinInput.trim() || circleBusy ? 0.5 : 1 }}>{circleBusy ? '참여 중...' : '참여하기'}</button>
                  <button onClick={() => setCircleFormMode('none')} style={{ flexShrink: 0, padding: '11px 14px', borderRadius: '12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--divider)', color: 'var(--text-sub)', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>취소</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <button onClick={() => setCircleFormMode('create')} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>내 서클 만들고 친구 초대하기</button>
                <button onClick={() => setCircleFormMode('join')} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--primary-light)', border: 'none', color: 'var(--primary)', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}>초대 코드로 참여하기</button>
                <button onClick={handleJoinOpen} disabled={circleBusy} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--divider)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontSize: '13px', opacity: circleBusy ? 0.5 : 1 }}>{circleBusy ? '배정 중...' : '이번 주 공개 서클 입장 (랜덤 매칭)'}</button>
                {!circleLoaded && <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-mute)', textAlign: 'center' }}>서클 정보를 불러오는 중...</p>}
              </div>
            )}
          </div>

          {/* 발견 미리보기 — 서클 만들기 전에도 화면이 비지 않게 */}
          {entries.length > 0 && (
            <>
              <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, color: 'var(--text-sub)', textAlign: 'left' }}>다른 짠친들의 기록</p>
              <div className="feed-list">
                {entries.slice(0, 3).map(entry => (
                  <React.Fragment key={entry.id}>{renderFeedCard(entry)}</React.Fragment>
                ))}
              </div>
              <button
                onClick={() => { userTouchedTabRef.current = true; setFeedTab('all'); }}
                style={{ width: '100%', padding: '11px', borderRadius: '12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--divider)', color: 'var(--text-main)', fontWeight: 700, cursor: 'pointer', fontSize: '12.5px', marginBottom: '16px' }}
              >
                발견 피드 더 보기 ›
              </button>
            </>
          )}
          </>
        )
      ) : (
        /* 일반 피드 (전체 & 팔로우 탭) */
        <>
          {entries.length === 0 ? (
            <>
              <div className="empty-state">
                {loadFailed ? (
                  <>
                    <p>피드를 불러오지 못했어요</p>
                    <p className="empty-sub">네트워크 상태를 확인해 주세요</p>
                    <button onClick={() => load(false)} className="rank-empty-retry-btn">다시 시도</button>
                  </>
                ) : (
                  <>
                    <p>오늘 뭐든 편하게 남겨봐요</p>
                    <p className="empty-sub">짧은 한 줄, 사진 한 장이면 충분해요</p>
                  </>
                )}
              </div>
              {!loadFailed && inviteCard}
            </>
          ) : (
            <div className="feed-list">
              {loadFailed && (
                <div className="rank-stale-banner">
                  <span className="rank-stale-text">⚠ 피드 갱신 실패 · 마지막 데이터 표시 중</span>
                  <button onClick={() => load(false)} className="rank-stale-retry-btn">재시도</button>
                </div>
              )}

              {/* 🤝 나를 팔로우한 짠친 — 맞팔하면 즉시 짝꿍 (상호성 루프) */}
              {feedTab === 'follow' && (() => {
                const followBack = followers.filter(f => !followedUsers[f.id]);
                if (followBack.length === 0) return null;
                return (
                  <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', textAlign: 'left', background: 'var(--primary-light)', border: '1px solid #F0F1F3' }}>
                    <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 800 }}>🤝 나를 팔로우한 짠친 {followBack.length}명</p>
                    <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: 'var(--text-sub)' }}>맞팔하면 바로 <strong style={{ color: 'var(--primary)' }}>절약 짝꿍</strong>이 돼요. (+20 젤리)</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {followBack.slice(0, 5).map(f => (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>👀 {f.nickname}</span>
                          <button onClick={() => handleToggleFollow(f.id, f.nickname)} style={{ flexShrink: 0, fontSize: '12px', fontWeight: 800, padding: '6px 14px', borderRadius: '100px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>맞팔하기</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* 🔗 친구의 친구 추천 (삼각 폐쇄 — 그래프 densify) */}
              {feedTab === 'follow' && fofList.length > 0 && searchQuery.trim().length === 0 && (
                <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', textAlign: 'left' }}>
                  <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 800 }}>🔗 짠친 추천</p>
                  <p style={{ margin: '0 0 10px', fontSize: '11.5px', color: 'var(--text-sub)' }}>내 짠친들이 팔로우하는 사람이에요</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {fofList.filter(f => !followedUsers[f.id]).slice(0, 5).map(f => {
                      const viaNick = followedUsers[f.viaId] || '짠친';
                      const proof = f.count > 1 ? `${viaNick}님 외 ${f.count - 1}명이 팔로우` : `${viaNick}님이 팔로우`;
                      return (
                        <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nickname}</p>
                            <p style={{ margin: '1px 0 0', fontSize: '10.5px', color: 'var(--text-mute)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🤝 {proof}</p>
                          </div>
                          <button onClick={() => handleToggleFollow(f.id, f.nickname)} style={{ flexShrink: 0, fontSize: '12px', fontWeight: 800, padding: '6px 14px', borderRadius: '100px', border: '1.5px solid var(--primary)', background: 'rgba(0,245,160,0.1)', color: 'var(--primary)', cursor: 'pointer' }}>팔로우</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {feedTab === 'follow' && (
                <div className="followed-friends-strip" style={{
                  background: '#FFFFFF',
                  padding: '16px 16px 12px',
                  borderRadius: '20px',
                  border: '1px solid #F0F1F3',
                  marginBottom: '16px',
                  textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>내가 팔로우하는 짠친</span>
                    {selectedFriendId && (
                      <button
                        onClick={() => setSelectedFriendId(null)}
                        style={{
                          fontSize: '11px',
                          color: 'var(--primary)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: 800
                        }}
                      >
                        모든 친구 보기 ✕
                      </button>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '14px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' }} className="no-scrollbar">
                    {/* 탐색/추가 버튼 */}
                    <div
                      onClick={() => {
                        const searchEl = document.querySelector('.follow-search-input') as HTMLInputElement;
                        searchEl?.focus();
                        searchEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        border: '1.5px dashed var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#F7F8FA'
                      }}>
                        <CustomIcon emoji="➕" />
                      </div>
                      <span style={{ fontSize: '10.5px', color: 'var(--text-sub)', fontWeight: 600 }}>짠친 탐색</span>
                    </div>

                    {Object.entries(followedUsers).map(([friendId, friendNickname]) => {
                      const personaKey = followedPersonas[friendId];
                      const p = personaKey ? PERSONAS[personaKey] : null;
                      const isSelected = selectedFriendId === friendId;
                      return (
                        <div
                          key={friendId}
                          onClick={() => setQuickMenuFriend({
                            id: friendId,
                            nickname: friendNickname,
                            personaIcon: p?.icon ?? null,
                            personaColor: p?.color ?? 'var(--border)'
                          })}
                          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer', flexShrink: 0 }}
                        >
                          <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '50%',
                            border: `2px solid ${isSelected ? 'var(--primary)' : p?.color ?? 'var(--border)'}`,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--bg-main)',
                            padding: '1px',
                            boxSizing: 'border-box',
                            boxShadow: isSelected ? '0 0 8px rgba(11, 169, 122, 0.4)' : 'none',
                            transition: 'all 0.2s'
                          }}>
                            {p?.icon ? (
                              <img src={p.icon} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                              <span style={{ fontSize: '16px', fontWeight: 800 }}>{friendNickname[0]}</span>
                            )}
                          </div>
                          <span style={{
                            fontSize: '10.5px',
                            color: isSelected ? 'var(--primary)' : 'var(--text-main)',
                            fontWeight: isSelected ? 800 : 600,
                            maxWidth: '60px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {friendNickname}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedFriendId && (
                <div style={{
                  background: 'rgba(11, 169, 122, 0.08)',
                  border: '1px solid rgba(11, 169, 122, 0.2)',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>
                    👤 <strong>{followedUsers[selectedFriendId] || '친구'}</strong> 님의 글만 모아보는 중
                  </span>
                  <button
                    onClick={() => setSelectedFriendId(null)}
                    style={{
                      background: 'var(--primary)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer'
                    }}
                  >
                    필터 해제
                  </button>
                </div>
              )}
              {displayedEntries.length === 0 && feedTab === 'follow' && (
                <div className="follow-empty-state">
                  <p className="follow-empty-icon"><CustomIcon emoji="👥" /></p>
                  <p className="follow-empty-title">
                    {Object.keys(followedUsers).length > 0 ? '오늘은 아직 친구들의 새 소식이 없어요' : '마음에 드는 사람 한 명만 골라봐요'}
                  </p>
                  <p className="follow-empty-desc">
                    {Object.keys(followedUsers).length > 0
                      ? '내일은 어떤 이야기가 올라올까요?'
                      : recommendedFriends.length > 0 ? '아래 친구 후보들 중 마음에 드는 사람을 골라보세요' : '피드에서 마음에 드는 사람을 발견해보세요'}
                  </p>
                </div>
              )}
              {feedTab === 'follow' && (
                <div className="follow-search-box">
                  <input
                    type="text"
                    className="follow-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="🔍 닉네임으로 짠친 검색"
                    maxLength={20}
                  />
                  {searchQuery.trim().length > 0 && (
                    <div className="follow-search-results">
                      {searching && <p className="follow-search-status">검색 중...</p>}
                      {!searching && searchResults.length === 0 && (
                        <p className="follow-search-status">검색 결과가 없어요</p>
                      )}
                      {!searching && searchResults.map((u) => {
                        const p = u.persona ? PERSONAS[u.persona] : null;
                        const isFollowing = !!followedUsers[u.user_id];
                        return (
                          <div key={u.user_id} className="follow-search-row">
                            <div className="follow-search-avatar" style={p ? { borderColor: p.color } : {}}>
                              {p ? <img src={p.icon} alt="" /> : u.nickname.charAt(0).toUpperCase()}
                            </div>
                            <span className="follow-search-name">{u.nickname}</span>
                            <button
                              className={`follow-search-btn ${isFollowing ? 'following' : ''}`}
                              onClick={() => handleToggleFollow(u.user_id, u.nickname)}
                            >
                              {isFollowing ? '팔로잉' : '팔로우'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {feedTab === 'follow' && recommendedFriends.length > 0 && searchQuery.trim().length === 0 && (
                <div className="recommended-friends-strip">
                  <h4 className="recommended-friends-strip-title">추천 짠친</h4>
                  <div className="recommended-friends-strip-list">
                    {recommendedFriends.map((friend) => {
                      const p = friend.persona ? PERSONAS[friend.persona] : null;
                      const isFollowing = !!followedUsers[friend.user_id];
                      return (
                        <div key={friend.user_id} className="rec-strip-card">
                          <div className="rec-strip-avatar" style={p ? { borderColor: p.color } : {}}>
                            {p ? <img src={p.icon} alt="" /> : friend.nickname.charAt(0).toUpperCase()}
                          </div>
                          <span className="rec-strip-name">{friend.nickname}</span>
                          <button
                            onClick={() => handleToggleFollow(friend.user_id, friend.nickname)}
                            className={`rec-strip-btn ${isFollowing ? 'following' : ''}`}
                          >
                            {isFollowing ? '✓' : '+'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {displayedEntries.map((entry, idx) => (
                <React.Fragment key={entry.id}>
                  {renderFeedCard(entry)}
                  {/* 친구 초대 인터스티셜 — 두 번째 글 다음 (글이 1개뿐이면 그 아래) */}
                  {(idx === 1 || (displayedEntries.length === 1 && idx === 0)) && inviteCard}
                  {(idx + 1) % 5 === 0 && <FeedBannerSlot />}
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      )}

      {/* 응원 쪽지 보내기 모달 */}
      {messageRecipientEntry && (
        <div className="story-modal-overlay" onClick={() => setMessageRecipientEntry(null)}>
          <div className="story-modal-sheet glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="story-modal-header">
              <img src="/images/icon_mailbox.png" className="custom-icon story-modal-icon" />
              <div>
                <h3 className="story-modal-name">
                  {messageRecipientEntry.nickname}님에게 응원 보내기
                </h3>
                <p className="story-modal-label">
                  익명으로 따뜻한 한마디를 전해보세요.
                </p>
              </div>
            </div>

            <div className="story-modal-content">
              {/* 퀵 템플릿 칩 */}
              <div className="message-template-chips">
                {[
                  '오늘도 수고했어요 👏',
                  '나도 자극 받고 가요 ✨',
                  '같이 해볼래요? 🤝',
                  '한 발씩 같이 가요 🌱'
                ].map((tpl) => (
                  <button
                    key={tpl}
                    className="message-template-chip"
                    onClick={() => setMessageText(tpl)}
                  >
                    {renderTextWithEmoji(tpl)}
                  </button>
                ))}
              </div>

              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="전달하고 싶은 익명의 응원 메시지를 직접 작성해 보세요..."
                maxLength={100}
                className="message-modal-textarea"
              />
              <span className="message-modal-char-count">{messageText.length}/100자</span>
            </div>

            <div className="story-modal-footer">
              <div>
                <Button size="large" display="full" color="dark" variant="weak" onClick={() => setMessageRecipientEntry(null)}>취소</Button>
              </div>
              <div>
                <Button size="large" display="full" color="primary" variant="fill" disabled={!messageText.trim()} onClick={handleSendMessageSubmit}>쪽지 보내기</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 가상 토스트 노티파이어 */}
      {toastText && (
        <div className="point-toast point-toast--feed">{toastText}</div>
      )}

      {/* 리액션 이펙트 렌더링 */}
      {particles.map((p) => (
        <span
          key={p.id}
          className="floating-reaction-particle"
          style={{
            left: p.x,
            top: p.y,
          }}
        >
          {p.emoji}
        </span>
      ))}

      {/* 🖼️ 라이트박스 이미지 확대 보기 모달 */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <button className="lightbox-close-btn" onClick={() => setLightboxImage(null)}>✕</button>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxImage} alt="Expanded Preview" className="lightbox-img" />
          </div>
        </div>
      )}

      {/* 🔒 서클 시트 — 지표·초대·배틀·나가기 */}
      {showCircleSheet && myCircle && (() => {
        const rows = weekRank.filter(r => circleMemberIdSet.has(r.user_id));
        const circleScore = rows.reduce((sum, r) => sum + (r.score ?? 0), 0);
        const circleDays = rows.reduce((sum, r) => sum + r.days, 0);
        const circleZero = rows.filter(r => r.total === 0).length;
        return (
          <div className="modal-overlay" onClick={() => setShowCircleSheet(false)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div style={{ padding: '20px 16px', textAlign: 'left' }}>
                <h3 style={{ margin: '0 0 2px', fontSize: '17px', fontWeight: 800 }}>{myCircle.circle.name}</h3>
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-sub)' }}>
                  멤버 {myCircle.members.length}/{CIRCLE_MAX_MEMBERS} · 초대 코드 <strong>{myCircle.circle.invite_code}</strong>{myCircle.circle.is_open ? ' · 이번 주 공개 서클' : ''}
                </p>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                  <div style={{ flex: 1, background: '#F7F8FA', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-sub)', fontWeight: 700 }}>이번 주 절약 점수</p>
                    <p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 800, color: 'var(--primary)' }}>{circleScore.toLocaleString('ko-KR')}</p>
                  </div>
                  <div style={{ flex: 1, background: '#F7F8FA', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-sub)', fontWeight: 700 }}>기록</p>
                    <p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 800 }}>{circleDays}일</p>
                  </div>
                  <div style={{ flex: 1, background: '#F7F8FA', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-sub)', fontWeight: 700 }}>무지출</p>
                    <p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 800, color: 'var(--success)' }}>{circleZero}명</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button onClick={() => { setShowCircleSheet(false); handleShareCircleInvite(); }} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>친구 초대하기</button>
                  {todayBattle ? (
                    <div style={{ width: '100%', padding: '12px', borderRadius: '12px', background: '#F7F8FA', color: 'var(--text-sub)', fontWeight: 700, fontSize: '13px', textAlign: 'center' }}>오늘 배틀 진행 중 · 자정 정산</div>
                  ) : myDuo ? (
                    <button onClick={() => { setShowCircleSheet(false); handleChallengeBattle(); }} style={{ width: '100%', padding: '12px', borderRadius: '12px', background: '#F7F8FA', border: 'none', color: 'var(--text-main)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>듀오 짝꿍에게 오늘 덜 쓰기 배틀 신청</button>
                  ) : null}
                  <button onClick={() => { setShowCircleSheet(false); handleLeaveCircle(); }} style={{ width: '100%', padding: '10px', background: 'none', border: 'none', color: 'var(--text-mute)', fontWeight: 600, fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>서클 나가기</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🐲 보스 시트 — 진행·규칙·보상 */}
      {showBossSheet && weeklyBoss && (() => {
        const dead = weeklyBoss.hp <= 0;
        const pct = Math.max(0, Math.round((weeklyBoss.hp / weeklyBoss.max_hp) * 100));
        return (
          <div className="modal-overlay" onClick={() => setShowBossSheet(false)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div style={{ padding: '20px 16px', textAlign: 'left' }}>
                <h3 style={{ margin: '0 0 2px', fontSize: '17px', fontWeight: 800 }}><CustomIcon emoji={weeklyBoss.boss_emoji || '🐲'} /> {weeklyBoss.boss_name}</h3>
                <p style={{ margin: '0 0 14px', fontSize: '12px', color: 'var(--text-sub)' }}>우리 서클의 주간 보스</p>
                {dead ? (
                  <>
                    <p style={{ margin: '0 0 14px', fontSize: '13.5px', fontWeight: 800, color: '#b45309' }}>처치 완료! 우리 서클의 절약이 보스를 쓰러뜨렸어요 🎉</p>
                    <button onClick={handleClaimBossReward} disabled={bossRewardClaimed} style={{ width: '100%', padding: '12px', borderRadius: '12px', border: 'none', background: bossRewardClaimed ? '#F7F8FA' : 'var(--primary)', color: bossRewardClaimed ? 'var(--text-mute)' : '#fff', fontWeight: 800, fontSize: '13px', cursor: bossRewardClaimed ? 'default' : 'pointer' }}>
                      {bossRewardClaimed ? '보상 수령 완료 ✓' : '젤리 50개 받기'}
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 800, marginBottom: '4px' }}>
                      <span style={{ color: '#a855f7' }}>HP {weeklyBoss.hp} / {weeklyBoss.max_hp}</span>
                      <span style={{ color: 'var(--text-sub)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: '10px', borderRadius: '100px', background: '#F0F1F3', overflow: 'hidden', marginBottom: '12px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: '100px', background: '#a855f7', transition: 'width 0.5s' }} />
                    </div>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--text-sub)', lineHeight: 1.6 }}>
                      멤버의 하루 첫 기록이 공격이 됩니다. 무지출 30 · 절약 방어 20 · 기록 10. 이번 주 안에 처치하면 <strong style={{ color: 'var(--primary)' }}>전원 젤리 50개</strong>.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🎰 지갑 수비 룰렛 모달 */}
      <RouletteModal open={showRoulette} onClose={() => setShowRoulette(false)} onPrize={handleRoulettePrize} />

      {/* 👤 짠친 미니 프로필 모달 — 관계 상태·교류 스트릭·팔로우/쪽지 원탭 */}
      {quickMenuFriend && (() => {
        const f = quickMenuFriend;
        const isFollowing = !!followedUsers[f.id];
        const isBuddy = mutualSet.has(f.id);
        const sRel = serverRelations[f.id];
        const localRel = getRelation(f.id);
        const relStreak = sRel ? effectiveServerStreak(sRel) : (localRel ? getEffectiveStreak(localRel) : 0);
        const relCount = sRel?.count ?? localRel?.count ?? 0;
        return (
        <SimpleModal open={true} onClose={() => setQuickMenuFriend(null)}>
          <div style={{ padding: '20px 16px', color: 'var(--text-main)', textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                border: `2px solid ${f.personaColor}`,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg)'
              }}>
                {f.personaIcon ? <img src={f.personaIcon} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '20px', fontWeight: 800 }}>{f.nickname[0]}</span>}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 800 }}>{f.nickname}</h4>
                <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 800 }}>
                  {isBuddy ? <><CustomIcon emoji="🤝" /> 절약 짝꿍</> : isFollowing ? <><CustomIcon emoji="👀" /> 팔로우 중</> : <><CustomIcon emoji="🌱" /> 아직 짠친이 아니에요</>}
                </span>
              </div>
            </div>

            {/* 관계 자본 요약 — 양방향 교류 스트릭 */}
            {relCount > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                <div style={{ flex: 1, background: 'rgba(251,191,36,0.12)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-sub)', fontWeight: 700 }}>교류 스트릭</p>
                  <p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 800, color: '#d97706' }}><CustomIcon emoji="🔥" /> {relStreak}일</p>
                </div>
                <div style={{ flex: 1, background: 'var(--primary-light)', borderRadius: '12px', padding: '10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-sub)', fontWeight: 700 }}>누적 교류</p>
                  <p style={{ margin: '2px 0 0', fontSize: '15px', fontWeight: 800, color: 'var(--primary)' }}>{relCount}회</p>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
              {!isFollowing && (
                <button
                  onClick={() => { handleToggleFollow(f.id, f.nickname); setQuickMenuFriend(null); }}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--primary)', border: 'none', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
                >
                  {renderTextWithEmoji('➕ 팔로우하고 짠친 되기')}
                </button>
              )}

              {isFollowing && (
                <button
                  onClick={() => {
                    setSelectedFriendId(f.id);
                    setQuickMenuFriend(null);
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'var(--primary-light)', border: 'none', color: 'var(--primary)', fontWeight: 800, fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
                >
                  {renderTextWithEmoji('📝 이 짠친의 글만 모아보기')}
                </button>
              )}

              <button
                onClick={() => {
                  setQuickMenuFriend(null);
                  setMessageRecipientEntry({ user_id: f.id, nickname: f.nickname });
                }}
                style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--divider)', color: 'var(--text-main)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
              >
                {renderTextWithEmoji('💌 응원 쪽지 보내기')}
              </button>

              {isFollowing && (
                <button
                  onClick={() => {
                    handleToggleFollow(f.id, f.nickname);
                    setQuickMenuFriend(null);
                  }}
                  style={{ width: '100%', padding: '12px', borderRadius: '12px', background: 'rgba(255, 77, 79, 0.08)', border: '1px solid rgba(255, 77, 79, 0.15)', color: 'var(--error)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
                >
                  {renderTextWithEmoji('👥 팔로우 취소 (언팔로우)')}
                </button>
              )}
            </div>

            <Button size="large" display="full" color="dark" variant="weak" onClick={() => setQuickMenuFriend(null)}>닫기</Button>
          </div>
        </SimpleModal>
        );
      })()}

      <div className="rank-bottom-spacer" />
    </div>
  );
}

function SimpleModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}
