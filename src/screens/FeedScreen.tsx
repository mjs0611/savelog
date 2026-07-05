import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@toss/tds-mobile';
import { TossAds } from '@apps-in-toss/web-framework';
import type { EntryWithReactions, WeekRankRow } from '../lib/supabase';
import { fetchFeed, toggleReaction, toggleStamp, submitEntry, fetchBalanceGameEntry, submitBalanceVote, fetchDilemmaVoteCounts, fetchFollows, fetchFollowerIds, fetchFollowersWithNickname, fetchFriendsOfFriends, toggleFollowSupabase, searchUsers, sendCheerNotification, fetchFollowedPersonas, fetchMyDuo, fetchMyInteractions, fetchCommentsForPosts, addCommunityComment, isSupabaseConfigured, fetchOrCreateWeeklyBoss, createBattle, fetchMyBattle, fetchDayTotals, type BalanceEntry, type SearchUser, type FofCandidate, type ServerRelation, type CommunityComment, type WeeklyBoss, type Battle, type Duo } from '../lib/supabase';
import { STAMPS, STAMP_BY_KEY, topStamp } from '../lib/stamps';
import RouletteModal from '../components/RouletteModal';
import { recordInteraction, getRelation, getEffectiveStreak, getTopRelations } from '../lib/relations';
import { formatAmount, timeAgo, getWeekKey, getTodayStr } from '../lib/utils';
import { 
  PERSONAS, 
  getPersona, 
  getNickname, 
  sendCheeringMessage, 
  getFollowedUsers, 
  saveFollowedUsers, 
  getActiveChallengeId, 
  setActiveChallengeId, 
  type StreakData, 
  type DailyState,
  getSystemTemperature,
  getRestoringAdjustment,
  getWeeklyBudget,
  getBudgetEntropy,
  getZeigarnikSkeletons,
  resolveSkeleton,
  checkAndResetDailyPhysics,
  getDilemmaOutcome,
  resolveDilemma,
  addToGoal,
  addJelly,
  getWishlist,
  addWishlistItem,
  resolveWishlistItem,
  isWishlistItemReady,
  WISHLIST_COOLDOWN_MS,
  getRouletteSpins
} from '../lib/storage';
import { FEED_BANNER_AD_ID, initBannerAds } from '../lib/ads';
import { openContactsInvite } from '../lib/share';
import CustomIcon, { renderTextWithEmoji } from '../components/CustomIcon';

function FeedBannerSlot() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TossAds.initialize.isSupported()) return;

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


interface SaltyGroup {
  id: string;
  name: string;
  creator: string;
  desc: string;
  dailyBudget: number;
  members: string[];
  averageSpent: number;
}

const PRESET_GROUPS: SaltyGroup[] = [];

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
  onQuickZeroSpend: () => void;
  onClaimPending: () => void;
  onNavigateToMyLog?: () => void;
  onShareToChat?: (entry: any) => void;
  onShieldEarned?: (count: number) => void;
}


// 매일 바뀌는 컴포저 프롬프트 — 글 쓸 계기를 다양화 (같은 질문 반복 → 무감각 방지)
const DAILY_PROMPTS = [
  '오늘 어떤 하루였어요?',
  '오늘 참은 소비가 하나 있다면? 🌱',
  '오늘 가장 만족스러운 지출은? ✨',
  '충동구매 위기는 없었어요? ⚡',
  '오늘 지갑 수비, 성공했어요? 🛡️',
  '안 사길 잘했다 싶은 게 있어요? 😌',
  '오늘 아낀 돈으로 뭘 하고 싶어요? 🎯',
];

const WEEKLY_CHALLENGES = [
  { id: 'signature-tumbler', title: '시그니처 텀블러 데이 ☕', desc: '일회용 컵 대신 내 최애 텀블러로 힙하게 음료 채우기', emoji: '🥤' },
  { id: 'home-chef', title: '냉장고 털기 홈셰프 🍳', desc: '냉장고 속 잠자던 재료로 나만의 5성급 집밥 만들기', emoji: '🍳' },
  { id: 'local-healing', title: '동네 무료 핫플 탐험 🌿', desc: '돈 안 들이고 친구와 즐기는 숲길 산책 및 미술관 탐방', emoji: '🌳' },
  { id: 'health-charging', title: '물 마시기 & 만보 걷기 루틴 💧', desc: '지갑도 내 몸도 함께 활력 플러스 충전하기', emoji: '💧' },
];

export default function FeedScreen({ userId, refreshToken = 0, weekRank = [], daily, streak, pendingPoints, pendingClaiming, streakShields, onRecord, onQuickZeroSpend, onClaimPending, onNavigateToMyLog, onShareToChat, onShieldEarned }: Props) {
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

  // ── 물리 엔진 및 자이가르닉 스케이트 상태 ──
  const [skeletons, setSkeletons] = useState(() => getZeigarnikSkeletons());
  const [entropy, setEntropy] = useState(() => getBudgetEntropy());
  const [temp, setTemp] = useState(() => getSystemTemperature());
  const [restoringAdjustment, setRestoringAdjustment] = useState(() => getRestoringAdjustment());
  // 핵심 루프(기록·피드)를 전면에 두기 위해 물리 대시보드는 기본 접힘
  const [physicsOpen, setPhysicsOpen] = useState(false);

  const dailyBudget = Math.max(1, Math.round(getWeeklyBudget() / 7));
  const springFactor = dailyBudget > 0 ? restoringAdjustment / dailyBudget : 0;
  const springScaleX = restoringAdjustment > 0
    ? 1 + Math.min(0.5, springFactor)
    : restoringAdjustment < 0
      ? Math.max(0.5, 1 - Math.abs(springFactor))
      : 1;

  // ── 소비 칼로리 통계 계산 ──
  const weeklyBudget = Math.max(1, getWeeklyBudget());
  const myRow = weekRank.find(r => r.user_id === userId);
  const calSpent = myRow?.total ?? 0;
  const calPct = Math.min(100, Math.round(calSpent / weeklyBudget * 100));
  const calOver = calSpent > weeklyBudget;
  const calRemain = weeklyBudget - calSpent;
  const ringColor = calOver ? '#ff4d4f' : calPct >= 80 ? '#fbbf24' : 'var(--primary)';
  const R = 30, C = 2 * Math.PI * R;

  useEffect(() => {
    checkAndResetDailyPhysics(getTodayStr());
    setSkeletons(getZeigarnikSkeletons());
    setEntropy(getBudgetEntropy());
    setTemp(getSystemTemperature());
    setRestoringAdjustment(getRestoringAdjustment());

    const handleSync = () => {
      setSkeletons(getZeigarnikSkeletons());
      setEntropy(getBudgetEntropy());
      setTemp(getSystemTemperature());
      setRestoringAdjustment(getRestoringAdjustment());
    };
    
    window.addEventListener('savelog_entropy_updated', handleSync);
    window.addEventListener('savelog_skeletons_updated', handleSync);
    return () => {
      window.removeEventListener('savelog_entropy_updated', handleSync);
      window.removeEventListener('savelog_skeletons_updated', handleSync);
    };
  }, []);

  // 라이트박스 (이미지 확대 보기)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // 팔로우 / 탭 필터
  const [feedTab, setFeedTab] = useState<'all' | 'follow' | 'group'>('all');
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
  const [wishName, setWishName] = useState('');
  const [wishPrice, setWishPrice] = useState('');
  const [buddyList, setBuddyList] = useState<{ id: string; nickname: string }[]>([]);
  const [topRel] = useState(() => getTopRelations(1)[0] ?? null);
  const [askedWish, setAskedWish] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchFollowerIds(userId).then(ids => {
      const followerSet = new Set(ids);
      const followed = getFollowedUsers();
      const buddies = Object.entries(followed).filter(([id]) => followerSet.has(id)).map(([id, nickname]) => ({ id, nickname }));
      setBuddyList(buddies);
    }).catch(() => {});
  }, [userId, followedUsers]);

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

  const handleAskBuddy = (it: { id: string; name: string; price: number }) => {
    if (buddyList.length === 0) return;
    const top = buddyList.find(b => b.id === topRel?.userId) || buddyList[0];
    const myName = getNickname() || '짠친';
    sendCheerNotification(userId, top.id, myName, `'${it.name}'(${formatAmount(it.price)}) 살까 말까 고민 중이에요. 막아줄래요? 🛒`).then(ok => {
      if (ok) {
        recordInteraction(top.id, top.nickname);
        setAskedWish(prev => new Set(prev).add(it.id));
        showFeedToast(`🤝 ${top.nickname}님에게 물어봤어요!`);
      } else {
        showFeedToast('전송에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    });
  };

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
  const handleAddWish = () => {
    const p = parseInt(wishPrice.replace(/[^0-9]/g, ''), 10);
    if (!wishName.trim() || !p || p <= 0) return;
    setWishlistState(addWishlistItem(wishName.trim(), p));
    setWishName(''); setWishPrice('');
    showFeedToast('🛒 48시간 뒤 다시 물어볼게요. 그때도 원하면 그때 사요!');
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


  // 👥 절약 그룹 리그 관련 상태
  const [myGroup, setMyGroup] = useState<string | null>(() => {
    try {
      return localStorage.getItem('savelog_my_group');
    } catch {
      return null;
    }
  });
  const [customGroups, setCustomGroups] = useState<SaltyGroup[]>(() => {
    try {
      const saved = localStorage.getItem('savelog_custom_groups');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const allGroups = React.useMemo(() => {
    return [...PRESET_GROUPS, ...customGroups];
  }, [customGroups]);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupBudget, setNewGroupBudget] = useState(10000);

  interface GroupMessage {
    sender: string;
    text: string;
    time: string;
  }

  const [groupMessages, setGroupMessages] = useState<Record<string, GroupMessage[]>>(() => {
    try {
      const saved = localStorage.getItem('savelog_group_messages');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });
  const [newGroupMessageText, setNewGroupMessageText] = useState('');

  const handlePostGroupMessage = () => {
    if (!myGroup || !newGroupMessageText.trim()) return;
    const senderName = getNickname() || '나';
    const newMessage: GroupMessage = {
      sender: senderName,
      text: newGroupMessageText.trim(),
      time: '방금'
    };
    
    setGroupMessages(prev => {
      const currentList = prev[myGroup] || [];
      const updatedList = [...currentList, newMessage];
      const updated = { ...prev, [myGroup]: updatedList };
      localStorage.setItem('savelog_group_messages', JSON.stringify(updated));
      return updated;
    });
    setNewGroupMessageText('');
    showFeedToast('💬 그룹 방명록에 글을 남겼습니다!');
  };

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
    // 이 항목이 상단 밸런스게임 섹션에 현재 표시 중이면 balanceVoted도 optimistic 동기화
    // (인라인 투표 후 상단 섹션에 투표 버튼이 다시 노출되는 UX 버그 방지)
    const isCurrentBalanceEntry = typeof balanceEntry === 'object' && balanceEntry !== null && balanceEntry.id === entryId;
    if (isCurrentBalanceEntry) setBalanceVoted(vote);
    // 인라인 고민글 실제 집계 낙관적 증가 (즉시 반영)
    setDilemmaVotes(prev => {
      const cur = prev[entryId] ?? { over: 0, ok: 0, total: 0 };
      return { ...prev, [entryId]: { over: cur.over + (vote === 'over' ? 1 : 0), ok: cur.ok + (vote === 'ok' ? 1 : 0), total: cur.total + 1 } };
    });
    try {
      const stats = await submitBalanceVote(entryId, userId, vote);
      showFeedToast('⚖️ 투표 완료!');
      if (isCurrentBalanceEntry) setBalanceStats(stats);
    } catch {
      // 실패한 엔트리만 롤백 — 동시 진행 중인 다른 투표에 영향 없도록 functional update 사용
      setFeedVotes(prev => {
        const { [entryId]: _, ...rest } = prev;
        return rest;
      });
      if (isCurrentBalanceEntry) setBalanceVoted(null);
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

  // 이번 주 챌린지 (주차별 결정론적 선택)
  const currentWeekKey = getWeekKey();
  const [customChallenge, setCustomChallenge] = useState<{ id: string; title: string; desc: string; emoji: string } | null>(() => {
    try {
      const saved = localStorage.getItem(`savelog_custom_challenge_${currentWeekKey}`);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const weekChallenge = customChallenge || (() => {
    const hash = currentWeekKey.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    return WEEKLY_CHALLENGES[Math.abs(hash) % WEEKLY_CHALLENGES.length];
  })();

  // 그룹 챌린지 참여 상태 (주차별 스코프)
  const [activeChallenge, setActiveChallenge] = useState<string | null>(() => getActiveChallengeId(currentWeekKey));

  // 커스텀 챌린지 생성 모달 상태
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const [customEmoji, setCustomEmoji] = useState('🏆');

  function handleCreateCustomChallenge() {
    if (!customTitle.trim() || !customDesc.trim()) return;
    const nextCh = {
      id: `custom-${Date.now()}`,
      title: customTitle.trim(),
      desc: customDesc.trim(),
      emoji: customEmoji.trim(),
    };
    localStorage.setItem(`savelog_custom_challenge_${currentWeekKey}`, JSON.stringify(nextCh));
    setCustomChallenge(nextCh);
    setActiveChallengeId(nextCh.id, currentWeekKey);
    setActiveChallenge(nextCh.id);
    setShowCustomModal(false);
    setCustomTitle('');
    setCustomDesc('');
    setCustomEmoji('🏆');
    showFeedToast(`🎮 우리만의 새로운 절약 놀이가 개설되었어요!`);
  }

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
  const [balanceEntry, setBalanceEntry] = useState<BalanceEntry | null | 'loading' | 'empty'>('loading');
  const [balanceVoted, setBalanceVoted] = useState<'over' | 'ok' | null>(null);
  const [balanceStats, setBalanceStats] = useState<{ over: number; ok: number } | null>(null);
  const balanceVotingRef = React.useRef(false);
  const feedVotingRef = React.useRef<Set<string>>(new Set());

  const myPersonaKey = getPersona();



  const handleCreateGroupSubmit = () => {
    if (!newGroupName.trim() || !newGroupDesc.trim()) return;
    const creatorName = getNickname() || '나';
    const newGroup: SaltyGroup = {
      id: `group-custom-${Date.now()}`,
      name: `👥 ${newGroupName.trim()}`,
      creator: creatorName,
      desc: newGroupDesc.trim(),
      dailyBudget: Number(newGroupBudget) || 10000,
      members: [creatorName, '김토스', '이패드'],
      averageSpent: 45000,
    };

    const updated = [newGroup, ...customGroups];
    localStorage.setItem('savelog_custom_groups', JSON.stringify(updated));
    setCustomGroups(updated);
    localStorage.setItem('savelog_my_group', newGroup.id);
    setMyGroup(newGroup.id);
    setShowCreateGroupModal(false);
    setNewGroupName('');
    setNewGroupDesc('');
    setNewGroupBudget(10000);
    showFeedToast(`👥 ${newGroupName.trim()} 그룹이 생성되었습니다!`);
  };

  const handleJoinGroup = (groupId: string) => {
    localStorage.setItem('savelog_my_group', groupId);
    setMyGroup(groupId);
    const gName = allGroups.find(g => g.id === groupId)?.name || '그룹';
    showFeedToast(`👥 ${gName} 그룹에 참여했습니다!`);
  };

  const handleLeaveGroup = () => {
    localStorage.removeItem('savelog_my_group');
    setMyGroup(null);
    showFeedToast('그룹에서 탈퇴했습니다.');
  };

  // 현재 가입 그룹 정보
  const activeGroup = React.useMemo(() => {
    if (!myGroup) return null;
    return allGroups.find(g => g.id === myGroup) || null;
  }, [myGroup, allGroups]);

  // 그룹 멤버 실시간 필터링 피드
  const groupMembersSet = React.useMemo(() => {
    if (!activeGroup) return new Set<string>();
    return new Set<string>(activeGroup.members);
  }, [activeGroup]);

  const groupFilteredEntries = React.useMemo(() => {
    if (!activeGroup) return [];
    return entries.filter(e => {
      const nick = e.nickname || '';
      return groupMembersSet.has(nick) || e.user_id === userId;
    });
  }, [entries, activeGroup, groupMembersSet, userId]);

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

  const totalVotes = React.useMemo(() => {
    if (typeof balanceEntry !== 'object' || !balanceEntry) return 0;
    const seed = balanceEntry.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return (seed % 80) + 45 + (balanceVoted ? 1 : 0);
  }, [balanceEntry, balanceVoted]);

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

  useEffect(() => {
    // 밸런스 게임은 userId 변경 시에만 리셋 (피드 새로고침마다 리셋되지 않도록)
    loadBalanceEntry();
  }, [userId]);

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

  // 주차가 바뀌면 챌린지 참여 상태 재동기화 (앱을 주 경계 넘어 열어둔 경우 stale 방지)
  useEffect(() => {
    setActiveChallenge(getActiveChallengeId(currentWeekKey));
  }, [currentWeekKey]);

  async function loadBalanceEntry() {
    setBalanceEntry('loading');
    setBalanceVoted(null);
    setBalanceStats(null);
    balanceVotingRef.current = false;
    try {
      const entry = await fetchBalanceGameEntry(userId);
      setBalanceEntry(entry ?? 'empty');
    } catch {
      setBalanceEntry('empty');
    }
  }

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

  // ── 🐲 주간 공동 보스 — 전 유저 합동 레이드 ──
  const [weeklyBoss, setWeeklyBoss] = useState<WeeklyBoss | null>(null);
  const [bossRewardClaimed, setBossRewardClaimed] = useState(() => {
    try { return localStorage.getItem(`savelog_boss_reward_${getWeekKey()}`) === '1'; } catch { return false; }
  });
  useEffect(() => {
    fetchOrCreateWeeklyBoss(getWeekKey()).then(b => setWeeklyBoss(b)).catch(() => {});
  }, [refreshToken]);

  function handleClaimBossReward() {
    if (bossRewardClaimed) return;
    try { localStorage.setItem(`savelog_boss_reward_${getWeekKey()}`, '1'); } catch {}
    setBossRewardClaimed(true);
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
    ).slice(0, 3);
  }, [entries, userId, feedVotes, judgeSkipped]);

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

  function handleToggleChallenge(id: string) {
    if (activeChallenge === id) {
      setActiveChallengeId(null, currentWeekKey);
      setActiveChallenge(null);
      showFeedToast('챌린지에서 나왔어요.');
    } else {
      setActiveChallengeId(id, currentWeekKey);
      setActiveChallenge(id);
      showFeedToast('챌린지 참여 완료! 💪 이번 주 함께 버텨봐요');
    }
  }

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
    return sorted;
  }, [entries, userId, followedUsers, feedTab, selectedFriendId]);

  // 📣 짠친 소식 — 팔로우한 사람의 주요 활동(무지출/고민)을 띄워 원탭 상호작용 유도 (살아있는 그래프)
  const graphHighlights = React.useMemo(() => {
    return entries.filter(e => {
      if (e.user_id === userId || !followedUsers[e.user_id]) return false;
      const isDilemma = e.is_balance_game || e.items.some(it => it.category === '소비 고민');
      const isZero = e.total_amount === 0 && !e.items.some(it => it.category === '마일스톤' || it.category === '꿀팁' || it.category === '소비 고민' || it.category === '한마디');
      return isDilemma || isZero;
    }).slice(0, 3);
  }, [entries, userId, followedUsers]);

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
    const visibleComments = isExpanded ? comments : comments.slice(0, 2);

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
              {entry.user_id !== userId && mutualSet.has(entry.user_id) && (
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '20px', background: 'rgba(0,245,160,0.14)', color: 'var(--primary)' }}><CustomIcon emoji="🤝" /> 짝꿍</span>
              )}
              {entry.user_id !== userId && (() => {
                void relTick; // 관계 자본 갱신 반영
                // 서버(양방향, 상대도 같은 숫자를 봄) 우선, 없으면 로컬 폴백
                const sRel = serverRelations[entry.user_id];
                const local = getRelation(entry.user_id);
                const s = sRel ? effectiveServerStreak(sRel) : (local ? getEffectiveStreak(local) : 0);
                return s > 0 ? (
                  <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '20px', background: 'rgba(251,191,36,0.15)', color: '#d97706' }}><CustomIcon emoji="🔥" /> {s}일째 교류</span>
                ) : null;
              })()}
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
            {(() => {
              // 가장 많이 받은 스탬프(2개 이상) = 짠친들의 판결
              const verdict = topStamp(entry.stamp_counts || {});
              return verdict ? (
                <span className="feed-badge feed-badge--yellow" title={`짠친 판결 · ${verdict.count}표`}>
                  <CustomIcon emoji={verdict.stamp.emoji} /> {verdict.stamp.label}
                </span>
              ) : null;
            })()}
            {entry.user_id !== userId ? (
              <button
                onClick={() => handleToggleFollow(entry.user_id, entry.nickname || '')}
                className={`feed-card-ig-follow ${followedUsers[entry.user_id] ? 'following' : ''}`}
                style={{ marginLeft: '4px' }}
              >
                {followedUsers[entry.user_id] ? '팔로잉' : '팔로우'}
              </button>
            ) : (
              <span className="feed-badge feed-badge--blue" style={{ marginLeft: '4px' }}>나</span>
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
                    <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '12px', background: outcome === 'resisted' ? 'rgba(0,245,160,0.1)' : 'rgba(255,255,255,0.05)', fontSize: '12.5px', fontWeight: 800, color: outcome === 'resisted' ? 'var(--primary)' : 'var(--text-sub)', textAlign: 'center' }}>
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
                        style={{ flex: 1, padding: '9px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-main)', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}>🔥 질렀어요</button>
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

        {/* 액션 바 (인스타그램 스타일: 아이콘 + 카운트) */}
        <div className="feed-ig-actions">
          {entry.user_id !== userId ? (
            <button
              className={`ig-action-btn ${liked ? 'ig-action-btn--liked' : ''}`}
              onClick={(e) => handleReact(entry, 'trust', e)}
              disabled={toggling.has(entry.id)}
              aria-label="응원하기"
            >
              <span className="ig-action-icon"><CustomIcon emoji={liked ? '💖' : '🤍'} /></span>
              <span className="ig-action-count" style={{ fontSize: '11px', fontWeight: 800 }}>
                {likeCount > 0 ? `${likeCount}명의 응원` : '응원하기'}
              </span>
            </button>
          ) : (
            <div className="ig-action-btn ig-action-btn--readonly" aria-label="응원받음">
              <span className="ig-action-icon"><CustomIcon emoji="💖" /></span>
              <span className="ig-action-count" style={{ fontSize: '11px', fontWeight: 800 }}>
                {likeCount > 0 ? `${likeCount}명의 응원` : '응원 0'}
              </span>
            </div>
          )}
          <button
            className="ig-action-btn"
            onClick={() => {
              const el = document.getElementById(`comment-input-${entry.id}`);
              if (el) (el as HTMLInputElement).focus();
            }}
            aria-label="댓글"
          >
            <span className="ig-action-icon"><CustomIcon emoji="💬" /></span>
            {comments.length > 0 && <span className="ig-action-count">{comments.length}</span>}
          </button>
          {entry.user_id !== userId && (
            <button
              className="ig-action-btn"
              onClick={() => { setMessageRecipientEntry(entry); setMessageText(''); }}
              aria-label="메시지"
            >
              <span className="ig-action-icon"><CustomIcon emoji="✈️" /></span>
            </button>
          )}
          {onShareToChat && (
            <button
              className="ig-action-btn"
              onClick={() => onShareToChat(entry)}
              aria-label="짠톡 공유"
            >
              <span className="ig-action-icon"><CustomIcon emoji="👥" /></span>
            </button>
          )}
        </div>

        {/* 🎯 거지방 스탬프 행 — 밈 판정 도장 (1인 1개, 다시 누르면 취소) */}
        {!isMilestone && (
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', padding: '2px 0 6px', scrollbarWidth: 'none' }} className="no-scrollbar">
            {STAMPS.map(s => {
              const count = entry.stamp_counts?.[s.key] ?? 0;
              const mine = entry.my_stamp === s.key;
              const canStamp = entry.user_id !== userId;
              return (
                <button
                  key={s.key}
                  onClick={() => { if (canStamp) handleStamp(entry, s.key); }}
                  title={s.label}
                  style={{
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 9px',
                    borderRadius: '100px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: canStamp ? 'pointer' : 'default',
                    border: mine ? '1.5px solid var(--primary)' : '1px solid var(--divider)',
                    background: mine ? 'var(--primary-light)' : count > 0 ? 'rgba(0,0,0,0.03)' : 'transparent',
                    color: mine ? 'var(--primary)' : 'var(--text-sub)',
                    opacity: canStamp || count > 0 ? 1 : 0.55,
                  }}
                >
                  <CustomIcon emoji={s.emoji} /> {s.label}{count > 0 ? ` ${count}` : ''}
                </button>
              );
            })}
          </div>
        )}

        {/* 댓글 스레드 — SNS 스타일 (내 글에도 표시: 작성자가 답글을 읽을 수 있어야 대화가 성립) */}
        {!isMilestone && (() => {
          return (
            <div className="feed-thread-section">
              {/* 댓글 목록 */}
              {comments.length > 0 && (
                <div className="feed-thread-list">
                  {visibleComments.map((c, i) => (
                    <div key={i} className="feed-thread-row">
                      <div className="feed-thread-avatar">{c.sender[0] ?? '나'}</div>
                      <div className="feed-thread-content">
                        <span className="feed-thread-name">{c.sender}</span>
                        <span className="feed-thread-text">{renderTextWithEmoji(c.text)}</span>
                      </div>
                    </div>
                  ))}
                  {comments.length > 2 && !isExpanded && (
                    <button
                      className="feed-thread-more"
                      onClick={() => setCommentExpanded(prev => ({ ...prev, [entry.id]: true }))}
                    >
                      댓글 {comments.length - 2}개 더 보기
                    </button>
                  )}
                </div>
              )}

              {/* 댓글 직접 입력 */}
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
          );
        })()}
      </div>
    );
  };

  // 친구 초대 카드 — 피드 사이 인터스티셜로 노출 (SNS 추천 카드 스타일)
  const inviteCard = (
    <div className="glass-card" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
      <div style={{ textAlign: 'left' }}>
        <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)' }}><CustomIcon emoji="👯" /> 친구와 함께하면 덜 씁니다</p>
        <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: 'var(--text-sub)', lineHeight: 1.4 }}>토스 친구를 초대하면 <strong>스트릭 보호권 🛡️ +1</strong> — 하루 빠져도 불꽃이 안 꺼져요</p>
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
            <div className="feed-composer-prompt" onClick={onRecord}>
              <span className="feed-composer-avatar">
                {(() => { const p = getPersona(); return p ? <img src={PERSONAS[p].icon} alt="" className="custom-icon" /> : <CustomIcon emoji="🐷" className="custom-icon" />; })()}
              </span>
              <span className="feed-composer-placeholder">{DAILY_PROMPTS[Math.floor(new Date(getTodayStr() + 'T00:00:00').getTime() / 86400000) % DAILY_PROMPTS.length]}</span>
            </div>
            <div className="feed-composer-actions">
              <button className="feed-composer-action-btn" onClick={onRecord}>
                <CustomIcon emoji="📝" /> <span>오늘 기록</span>
              </button>
              <button className="feed-composer-action-btn" onClick={onQuickZeroSpend}>
                <CustomIcon emoji="🌿" /> <span>지갑 쉬는 날</span>
              </button>
              <button className="feed-composer-action-btn" onClick={onRecord}>
                <CustomIcon emoji="⚖️" /> <span>살까 고민</span>
              </button>
            </div>
            {!daily.recorded && streak.totalDays === 0 && (
              <p className="feed-composer-onboarding-hint"><CustomIcon emoji="✨" /> 첫 지출을 기록해보세요!</p>
            )}
          </>
        )}
      </div>

      {/* 🔥 오늘의 내 카드 — 스트릭·룰렛·배틀·듀오·포인트를 한 장으로 (상단 위계 단일화) */}
      <div className="glass-card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--text-main)' }}><CustomIcon emoji="🔥" /> {streak.streak}일 연속</span>
            {(streakShields ?? 0) > 0 && (
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-sub)' }}><CustomIcon emoji="🛡️" /> {streakShields}</span>
            )}
            <button
              onClick={() => setShowRoulette(true)}
              style={rouletteSpins > 0
                ? { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '100px', border: '1.5px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.12)', color: '#b45309', fontWeight: 800, fontSize: '11.5px', cursor: 'pointer' }
                : { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '100px', border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-mute)', fontWeight: 700, fontSize: '11.5px', cursor: 'pointer' }}
            >
              <CustomIcon emoji="🎰" /> 룰렛 {rouletteSpins}
            </button>
            {todayBattle ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '100px', border: '1px solid rgba(255,94,98,0.35)', background: 'rgba(255,94,98,0.08)', color: '#FF5E62', fontWeight: 800, fontSize: '11.5px' }}>
                <CustomIcon emoji="⚔️" /> 배틀 중
              </span>
            ) : myDuo ? (
              <button
                onClick={handleChallengeBattle}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '100px', border: '1.5px solid rgba(255,94,98,0.4)', background: 'rgba(255,94,98,0.1)', color: '#FF5E62', fontWeight: 800, fontSize: '11.5px', cursor: 'pointer' }}
              >
                <CustomIcon emoji="⚔️" /> 오늘 배틀
              </button>
            ) : null}
          </div>
          {pendingPoints > 0 ? (
            <button
              onClick={onClaimPending}
              disabled={pendingClaiming}
              style={{ flexShrink: 0, padding: '7px 12px', borderRadius: '100px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap', opacity: pendingClaiming ? 0.6 : 1 }}
            >
              {pendingClaiming ? '광고 시청 중...' : <><CustomIcon emoji="📺" /> {pendingPoints}원 받기</>}
            </button>
          ) : (
            <button
              onClick={onNavigateToMyLog}
              style={{ flexShrink: 0, background: 'none', border: 'none', fontSize: '11.5px', color: 'var(--text-mute)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              내 요정·목표 ›
            </button>
          )}
        </div>

        {/* 서브라인: 듀오 넛지 — 짝꿍은 오늘 기록 완료, 나는 아직 (호혜성 트리거) */}
        {duoPartnerNudge && !(daily.recorded && daily.date === getTodayStr()) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--divider)' }}>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.4, textAlign: 'left' }}>
              <CustomIcon emoji="💞" /> <strong>{duoPartnerNudge}</strong>님이 오늘 기록 완료 — 공동 불꽃이 기다려요!
            </p>
            <button onClick={onRecord} style={{ flexShrink: 0, padding: '6px 11px', borderRadius: '100px', background: '#FF5E62', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
              지금 기록
            </button>
          </div>
        )}

        {/* 서브라인: 어제 배틀 정산 결과 */}
        {battleResult && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '8px', borderTop: '1px solid var(--divider)' }}>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: battleResult.outcome === 'win' ? '#b45309' : 'var(--text-main)', lineHeight: 1.45, textAlign: 'left' }}>
              {battleResult.outcome === 'win' && renderTextWithEmoji(`🏆 어제 배틀 승리! ${battleResult.oppNick}님보다 덜 썼어요 — 젤리 30개 획득`)}
              {battleResult.outcome === 'lose' && renderTextWithEmoji(`😵 어제 배틀 패배... ${battleResult.oppNick}님이 더 아꼈어요. 오늘 설욕전 어때요?`)}
              {battleResult.outcome === 'draw' && renderTextWithEmoji(`🤝 어제 배틀 무승부! ${battleResult.oppNick}님과 똑같이 아꼈어요`)}
              {battleResult.outcome === 'void' && renderTextWithEmoji('💤 어제 배틀은 둘 다 기록이 없어 무효 처리됐어요')}
            </p>
            <button onClick={() => setBattleResult(null)} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-mute)', fontSize: '14px', cursor: 'pointer' }}>✕</button>
          </div>
        )}
      </div>

      {/* ⚖️ 오늘의 판정 큐 — 아직 반응 없는 짠친 기록에 원탭 판정 (반응 보장 루프) */}
      {judgeQueue.length > 0 ? (() => {
        const e = judgeQueue[0];
        const isDilemma = e.is_balance_game || e.items.some(it => it.category === '소비 고민');
        return (
          <div className="glass-card" style={{ padding: '14px 16px', textAlign: 'left', border: '1.5px solid rgba(168,85,247,0.25)', background: 'linear-gradient(135deg, rgba(168,85,247,0.07), rgba(0,245,160,0.04))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800 }}><CustomIcon emoji="⚖️" /> 오늘의 판정</span>
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
          </div>
        );
      })() : judgedCount > 0 ? (
        <div className="glass-card" style={{ padding: '12px 16px', textAlign: 'left' }}>
          <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 800, color: 'var(--primary)' }}><CustomIcon emoji="🎉" /> 오늘의 판정 완료! 짠친 {judgedCount}명에게 반응이 전달됐어요</p>
        </div>
      ) : null}

      {/* 🌌 오늘의 지갑 수비 요약 대시보드 */}
      <div className={`glass-card orbit-control-panel ${entropy > 70 ? 'entropy-warning-active' : ''}`}>
        {/* 방치 먼지 파티클 */}
        {entropy > 70 && (
          <div className="entropy-dust-effect">
            <div className="dust-particle" style={{ width: '4px', height: '4px', top: '15%', left: '20%', '--dx': '30px', '--dy': '-45px' } as any} />
            <div className="dust-particle" style={{ width: '6px', height: '6px', top: '45%', left: '75%', '--dx': '-25px', '--dy': '-60px', animationDelay: '1.5s' } as any} />
            <div className="dust-particle" style={{ width: '5px', height: '5px', top: '70%', left: '15%', '--dx': '40px', '--dy': '-30px', animationDelay: '3.2s' } as any} />
            <div className="dust-particle" style={{ width: '7px', height: '7px', top: '25%', left: '60%', '--dx': '-35px', '--dy': '45px', animationDelay: '0.8s' } as any} />
            <div className="dust-particle" style={{ width: '5px', height: '5px', top: '80%', left: '80%', '--dx': '20px', '--dy': '-50px', animationDelay: '2.4s' } as any} />
          </div>
        )}

        {/* 제어실 헤더 (탭하여 펼치기/접기 — 기본 접힘) */}
        <div onClick={() => setPhysicsOpen(o => !o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: physicsOpen ? '14px' : '0', borderBottom: physicsOpen ? '1px solid rgba(0,0,0,0.05)' : 'none', paddingBottom: physicsOpen ? '10px' : '0', cursor: 'pointer', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}><CustomIcon emoji="🌌" /></span>
            <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--text-main)' }}>오늘의 지갑 수비 요약</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '10.5px',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              padding: '4px 10px',
              borderRadius: '20px',
              fontWeight: 800
            }}>
              습관 단계: {temp >= 0.8 ? '1단계 (느슨함)' : temp >= 0.6 ? '2단계 (보통)' : temp >= 0.4 ? '3단계 (단단함)' : '4단계 (매우 단단함)'}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-sub)', transform: physicsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
          </div>
        </div>

        {physicsOpen && (<div style={{ position: 'relative', zIndex: 1 }}>
        {/* 훅의 법칙 스프링 예산 상황 */}
        <div className="physics-spring-section" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
          <div style={{ 
            background: 'rgba(49, 130, 246, 0.03)', 
            padding: '14px', 
            borderRadius: '16px', 
            border: '1px solid rgba(49, 130, 246, 0.08)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>오늘의 추천 지출 예산</span>
              <span style={{ fontSize: '16px', fontWeight: 900, color: 'var(--primary)' }}>
                {formatAmount(Math.max(0, Math.round(getWeeklyBudget() / 7) + restoringAdjustment))}
              </span>
            </div>
            
            {/* 스프링 물리 코일 비주얼 */}
            <div className="spring-viz-container">
              <svg className="spring-coil-svg" viewBox="0 0 120 50" style={{ transform: `scaleX(${springScaleX})` }}>
                <path 
                  className={`spring-path ${restoringAdjustment > 0 ? 'spring-path--relaxed' : restoringAdjustment < 0 ? 'spring-path--compressed' : ''}`}
                  d="M 10 25 C 15 5, 15 45, 20 25 C 25 5, 25 45, 30 25 C 35 5, 35 45, 40 25 C 45 5, 45 45, 50 25 C 55 5, 55 45, 60 25 C 65 5, 65 45, 70 25 C 75 5, 75 45, 80 25 C 85 5, 85 45, 90 25 C 95 5, 95 45, 100 25 C 105 5, 105 45, 110 25"
                />
              </svg>
            </div>

            <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.45 }}>
              {restoringAdjustment === 0 
                ? '어제 지출을 예산에 딱 맞게 수비하여 지갑이 평형 상태를 유지하고 있습니다.' 
                : restoringAdjustment < 0 
                  ? `⚠️ 어제 예산보다 더 썼기 때문에, 오늘 쓸 수 있는 돈이 자동으로 ${formatAmount(Math.abs(restoringAdjustment))} 타이트하게 줄어들었습니다.`
                  : `🎉 어제 지출을 아낀 덕분에, 오늘 쓸 수 있는 예산이 자동으로 ${formatAmount(restoringAdjustment)} 늘어났습니다.`}
            </p>
          </div>

          {/* 🥗 이번 주 소비 칼로리 */}
          <div style={{ 
            background: 'rgba(255,255,255,0.02)', 
            padding: '14px', 
            borderRadius: '16px', 
            border: '1px solid rgba(255,255,255,0.05)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '16px' 
          }}>
            <svg width="76" height="76" viewBox="0 0 76 76" style={{ flexShrink: 0 }}>
              <circle cx="38" cy="38" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
              <circle cx="38" cy="38" r={R} fill="none" stroke={ringColor} strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, calPct / 100))} transform="rotate(-90 38 38)" />
              <text x="38" y="35" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff">{calPct}%</text>
              <text x="38" y="49" textAnchor="middle" fontSize="9" fill="#b0b8c1">소비</text>
            </svg>
            <div style={{ flex: 1, textAlign: 'left' }}>
              <h4 style={{ margin: '0 0 4px', fontSize: '13.5px', fontWeight: 800 }}><CustomIcon emoji="🥗" /> 이번 주 소비 칼로리</h4>
              <p style={{ margin: 0, fontSize: '11.5px', lineHeight: 1.5, color: 'var(--text-sub)' }}>
                예산 <strong>{formatAmount(weeklyBudget)}</strong> 중 <strong style={{ color: ringColor }}>{formatAmount(calSpent)}</strong> 섭취<br />
                {calOver
                  ? <span style={{ color: '#ff4d4f', fontWeight: 800 }}>{formatAmount(-calRemain)} 과식 — 남은 날 단식이 필요해요 <CustomIcon emoji="🚨" /></span>
                  : <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{formatAmount(calRemain)} 더 먹을 수 있어요 <CustomIcon emoji="🍽️" /></span>}
              </p>
            </div>
          </div>
        </div>

        {/* 🛒 충동 대기방 (위시리스트 48h 쿨다운) */}
        <div style={{ 
          background: 'rgba(255,255,255,0.02)', 
          padding: '14px', 
          borderRadius: '16px', 
          border: '1px solid rgba(255,255,255,0.05)', 
          marginBottom: '16px', 
          textAlign: 'left' 
        }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '13.5px', fontWeight: 800 }}><CustomIcon emoji="🛒" /> 충동 대기방</h4>
          <p style={{ margin: '0 0 12px', fontSize: '11px', color: 'var(--text-sub)', lineHeight: 1.5 }}>지금 사고 싶은 걸 넣어두면 48시간 뒤 다시 물어봐요. 충동을 시간으로 식혀요.</p>

          {readyWish.map(it => (
            <div key={it.id} style={{ background: 'rgba(255,184,0,0.08)', border: '1.5px solid rgba(251,191,36,0.4)', borderRadius: '14px', padding: '12px', marginBottom: '10px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800 }}><CustomIcon emoji="⏰" /> "{it.name}" ({formatAmount(it.price)}) — 아직도 원하세요?</p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleWishResolve(it.id, false)} style={{ flex: 1, padding: '8px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '11.5px' }}><CustomIcon emoji="👏" /> 참았어요</button>
                <button onClick={() => handleWishResolve(it.id, true)} style={{ flex: 1, padding: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontSize: '11.5px' }}>샀어요</button>
              </div>
            </div>
          ))}

          {wishlist.filter(w => w.status === 'waiting' && !isWishlistItemReady(w)).map(it => {
            const hoursLeft = Math.max(1, Math.ceil((it.addedAt + WISHLIST_COOLDOWN_MS - Date.now()) / 3600000));
            return (
              <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: '12px', minWidth: 0 }}>{it.name} <span style={{ color: 'var(--text-sub)', fontSize: '10.5px' }}>{formatAmount(it.price)}</span></span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {buddyList.length > 0 && (
                    askedWish.has(it.id)
                      ? <span style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 800 }}><CustomIcon emoji="🤝" /> 물어봄</span>
                      : <button onClick={() => handleAskBuddy(it)} style={{ fontSize: '10px', fontWeight: 800, padding: '4px 9px', borderRadius: '100px', border: '1px solid var(--primary)', background: 'rgba(0,245,160,0.12)', color: 'var(--primary)', cursor: 'pointer', whiteSpace: 'nowrap' }}><CustomIcon emoji="🤝" /> 짝꿍에게 물어보기</button>
                  )}
                  <span style={{ fontSize: '10.5px', color: 'var(--text-mute)', whiteSpace: 'nowrap' }}><CustomIcon emoji="⏳" /> {hoursLeft}시간</span>
                </div>
              </div>
            );
          })}

          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <input className="nickname-input" value={wishName} onChange={e => setWishName(e.target.value)} maxLength={20} placeholder="사고 싶은 것"
              style={{ flex: 2, minWidth: 0, padding: '8px 12px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', fontSize: '12px' }} />
            <input className="nickname-input" value={wishPrice} onChange={e => setWishPrice(e.target.value)} inputMode="numeric" placeholder="가격"
              style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: '#fff', fontSize: '12px' }} />
            <button onClick={handleAddWish} style={{ padding: '8px 14px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>담기</button>
          </div>
        </div>

        {/* 예산 엔트로피 무질서 게이지 */}
        <div className="entropy-section" style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-main)' }}>가계부 방치 지수 (밀린 정도)</span>
            <span style={{ fontSize: '11.5px', fontWeight: 900, color: entropy > 70 ? 'var(--primary)' : 'var(--text-sub)' }}>{entropy}%</span>
          </div>
          <div style={{ height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ 
              width: `${entropy}%`, 
              height: '100%', 
              background: entropy > 70 ? 'linear-gradient(90deg, #FF4D4F, #FF7875)' : 'linear-gradient(90deg, #3182F6, #00F5A0)',
              borderRadius: '10px',
              transition: 'width 0.5s ease-out'
            }} />
          </div>
          {entropy > 70 && (
            <p style={{ margin: '6px 0 0 0', fontSize: '10.5px', color: 'var(--error)', fontWeight: 700, lineHeight: 1.4 }}>
              <CustomIcon emoji="⚠️" /> 방치 지수가 70%를 넘어 젤리 단지의 젤리 생산 속도가 절반으로 줄어들었습니다! 아래 밀린 순간들을 기록해 방치 지수를 낮춰보세요.
            </p>
          )}
        </div>

        {/* 자이가르닉 미완료 순간 카드 */}
        {skeletons.some(sk => sk.status === 'pending') && (
          <div className="zeigarnik-skeletons" style={{ borderTop: '1px dashed rgba(0,0,0,0.08)', paddingTop: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-sub)', display: 'block', marginBottom: '8px' }}>
              <CustomIcon emoji="⏳" /> 오늘 기록해야 할 지갑 수비 순간
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {skeletons.filter(sk => sk.status === 'pending').map(sk => (
                <div key={sk.id} className="zeigarnik-skeleton-card">
                  <div className="zeigarnik-skeleton-inner">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>{sk.emoji}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>{sk.name}</span>
                        <span style={{ fontSize: '9.5px', color: 'var(--text-mute)' }}>기록 알림 시간 {sk.timeLabel}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        onClick={() => {
                          resolveSkeleton(sk.id);
                          onQuickZeroSpend();
                        }}
                        style={{ 
                          fontSize: '10px', 
                          background: 'var(--primary-light)', 
                          color: 'var(--primary)', 
                          border: 'none', 
                          padding: '6px 10px', 
                          borderRadius: '8px', 
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        무지출 완료 🌿
                      </button>
                      <button 
                        onClick={onRecord}
                        style={{ 
                          fontSize: '10px', 
                          background: 'rgba(0,0,0,0.04)', 
                          color: 'var(--text-main)', 
                          border: 'none', 
                          padding: '6px 10px', 
                          borderRadius: '8px', 
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        기록하기 💸
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>)}
      </div>

      {/* 컴포저·코쿼핏은 상단(대시보드 위)으로 이동했습니다 */}

      {/* 탭 필터: 전체 / 팔로우 / 절약 그룹 */}
      <div className="feed-tab-bar">
        {(['all', 'follow', 'group'] as const).map((t) => (
          <button
            key={t}
            className={`feed-tab-btn${feedTab === t ? ' feed-tab-btn--active' : ''}`}
            onClick={() => setFeedTab(t)}
          >
            {t === 'all' ? '전체' : t === 'follow' ? `팔로우${Object.keys(followedUsers).length > 0 ? ` (${Object.keys(followedUsers).length})` : ''}` : '절약 그룹'}
          </button>
        ))}
      </div>

      {/* 🐲 이번 주 공동 보스 — 모두의 절약이 공격이 됩니다 */}
      {feedTab !== 'group' && weeklyBoss && (() => {
        const pct = Math.max(0, Math.round((weeklyBoss.hp / weeklyBoss.max_hp) * 100));
        const dead = weeklyBoss.hp <= 0;
        return (
          <div className="glass-card" style={{ padding: '14px 16px', textAlign: 'left', marginBottom: '16px', border: dead ? '1.5px solid rgba(245,158,11,0.4)' : '1.5px solid rgba(168,85,247,0.22)', background: dead ? 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(255,222,104,0.06))' : 'linear-gradient(135deg, rgba(168,85,247,0.06), rgba(0,0,0,0.02))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 800 }}><CustomIcon emoji={weeklyBoss.boss_emoji || '🐲'} /> {weeklyBoss.boss_name}</span>
              <span style={{ fontSize: '10.5px', color: 'var(--text-mute)', fontWeight: 700 }}>이번 주 공동 보스</span>
            </div>
            {dead ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                <p style={{ margin: 0, fontSize: '12.5px', fontWeight: 800, color: '#b45309' }}>{renderTextWithEmoji('🎉 처치 완료! 모두의 절약이 보스를 쓰러뜨렸어요')}</p>
                <button
                  onClick={handleClaimBossReward}
                  disabled={bossRewardClaimed}
                  style={{ flexShrink: 0, padding: '7px 12px', borderRadius: '100px', border: 'none', background: bossRewardClaimed ? 'rgba(0,0,0,0.06)' : 'var(--primary)', color: bossRewardClaimed ? 'var(--text-mute)' : '#fff', fontWeight: 800, fontSize: '11.5px', cursor: bossRewardClaimed ? 'default' : 'pointer' }}
                >
                  {bossRewardClaimed ? '보상 수령 완료 ✓' : renderTextWithEmoji('🐹 젤리 50 받기')}
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 800, marginBottom: '4px' }}>
                  <span style={{ color: '#a855f7' }}>HP {weeklyBoss.hp} / {weeklyBoss.max_hp}</span>
                  <span style={{ color: 'var(--text-sub)' }}>{pct}%</span>
                </div>
                <div style={{ height: '10px', borderRadius: '100px', background: 'rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '8px' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: '100px', background: 'linear-gradient(90deg, #a855f7, #FF5E62)', transition: 'width 0.5s' }} />
                </div>
                <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-sub)', lineHeight: 1.5 }}>
                  하루 첫 기록이 공격이 됩니다 — {renderTextWithEmoji('🌿')} 무지출 30딜 · {renderTextWithEmoji('🛡️')} 절약 방어 20딜 · {renderTextWithEmoji('✍️')} 기록 10딜. 처치 시 <strong style={{ color: 'var(--primary)' }}>전원 젤리 50</strong>
                </p>
              </>
            )}
          </div>
        );
      })()}

      {/* 📣 짠친 소식 — 팔로우한 짠친의 활동 + 원탭 상호작용 (살아있는 그래프) */}
      {feedTab !== 'group' && graphHighlights.length > 0 && (
        <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', textAlign: 'left' }}>
          <p style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 800 }}>📣 짠친 소식</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {graphHighlights.map(e => {
              const isDilemma = e.is_balance_game || e.items.some(it => it.category === '소비 고민');
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '13px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong>{e.nickname}</strong>{isDilemma ? '님이 살까 말까 고민 중 🤔' : '님이 무지출 달성 🌿'}
                  </span>
                  {isDilemma ? (
                    <button onClick={() => { handleFeedVote(e.id, 'ok'); recordInteraction(e.user_id, e.nickname || undefined); setRelTick(t => t + 1); }}
                      style={{ flexShrink: 0, fontSize: '12px', fontWeight: 800, padding: '6px 12px', borderRadius: '100px', border: '1.5px solid var(--primary)', background: 'rgba(0,245,160,0.1)', color: 'var(--primary)', cursor: 'pointer' }}>{renderTextWithEmoji('🌱 참아!')}</button>
                  ) : (
                    <button onClick={(ev) => handleReact(e, 'trust', ev)}
                      style={{ flexShrink: 0, fontSize: '12px', fontWeight: 800, padding: '6px 12px', borderRadius: '100px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>{renderTextWithEmoji('👏 짠내난다')}</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {feedTab === 'group' ? (
        activeGroup === null ? (
          /* 그룹 미가입 상태 - 그룹 디렉토리 */
          <div className="group-directory">
            <div className="group-directory-header">
              <h3 className="group-sec-title"><CustomIcon emoji="🔥" /> 추천 절약 그룹</h3>
              <button className="create-group-btn" onClick={() => setShowCreateGroupModal(true)}>
                + 내 그룹 만들기
              </button>
            </div>
            <p className="group-directory-sub">함께 지출을 기록하고 예산 리그에 도전해 보세요.</p>
            <div className="group-list">
              {allGroups.map((group) => (
                <div key={group.id} className="group-item-card glass-card">
                  <div className="group-item-header">
                    <span className="group-item-name">{renderTextWithEmoji(group.name)}</span>
                    <span className="group-item-members"><CustomIcon emoji="👥" /> {group.members.length}명</span>
                  </div>
                  <p className="group-item-desc">{renderTextWithEmoji(group.desc)}</p>
                  <div className="group-item-footer">
                    <div className="group-item-meta">
                      <span>하루: <strong>{group.dailyBudget.toLocaleString('ko-KR')}원</strong></span>
                      <span className="dot-separator">·</span>
                      <span>주 평균: <strong>{group.averageSpent.toLocaleString('ko-KR')}원</strong></span>
                    </div>
                    <button className="group-join-btn" onClick={() => handleJoinGroup(group.id)}>
                      가입
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* 그룹 가입 상태 - 그룹 대시보드 */
          <div className="group-dashboard">
            <div className="group-info-card glass-card">
              <div className="group-info-header">
                <div>
                  <h3 className="group-title">{renderTextWithEmoji(activeGroup.name)}</h3>
                  <p className="group-desc">{renderTextWithEmoji(activeGroup.desc)}</p>
                </div>
                <button className="group-leave-btn" onClick={handleLeaveGroup}>그룹 탈퇴</button>
              </div>
              <div className="group-info-stats">
                <div className="group-stat-col">
                  <span className="stat-label">하루 예산</span>
                  <span className="stat-val">{activeGroup.dailyBudget.toLocaleString('ko-KR')}원</span>
                </div>
                <div className="group-stat-col">
                  <span className="stat-label">멤버 수</span>
                  <span className="stat-val">{activeGroup.members.length}명</span>
                </div>
                <div className="group-stat-col">
                  <span className="stat-label">우리 그룹 평균</span>
                  {(() => {
                    const userSpent = weekRank?.find((r) => r.user_id === userId)?.total ?? 0;
                    const otherCount = Math.max(1, activeGroup.members.includes(getNickname() || '나') ? activeGroup.members.length - 1 : activeGroup.members.length);
                    const otherSpentTotal = activeGroup.averageSpent * otherCount;
                    const avgSpent = Math.round((otherSpentTotal + userSpent) / (otherCount + 1));
                    return (
                      <span className="stat-val">{avgSpent.toLocaleString('ko-KR')}원</span>
                    );
                  })()}
                </div>
              </div>
            </div>

            {/* 주간 공동 예산 소진율 Gauge */}
            <div className="group-budget-gauge-box glass-card">
              {(() => {
                const userSpent = weekRank?.find((r) => r.user_id === userId)?.total ?? 0;
                const otherCount = Math.max(1, activeGroup.members.includes(getNickname() || '나') ? activeGroup.members.length - 1 : activeGroup.members.length);
                const otherSpentTotal = activeGroup.averageSpent * otherCount;
                const avgSpent = Math.round((otherSpentTotal + userSpent) / (otherCount + 1));
                
                const weeklyBudget = activeGroup.dailyBudget * 7;
                const usePercent = Math.min(200, Math.round((avgSpent / weeklyBudget) * 100));
                
                const isSafe = usePercent < 70;
                const isWarning = usePercent >= 70 && usePercent <= 100;
                const stateColor = isSafe ? 'var(--success)' : isWarning ? 'var(--warning)' : 'var(--error)';
                const stateText = isSafe ? (
                  <span><CustomIcon emoji="🌿" /> 여유 있게 페이스 유지 중</span>
                ) : isWarning ? (
                  <span><CustomIcon emoji="✨" /> 절반쯤 왔어요</span>
                ) : (
                  <span><CustomIcon emoji="🌈" /> 이번 주는 좀 더 썼네요</span>
                );
                
                return (
                  <>
                    <div className="gauge-header">
                      <span className="gauge-label"><CustomIcon emoji="📊" /> 주간 공동 예산 소진율</span>
                      <span className="gauge-percent" style={{ color: stateColor }}>{usePercent}%</span>
                    </div>
                    <div className="gauge-bar-bg">
                      <div className="gauge-bar-fill" style={{ width: `${Math.min(100, usePercent)}%`, background: stateColor }} />
                    </div>
                    <div className="gauge-footer">
                      <span className="gauge-status-desc">{stateText}</span>
                      <span className="gauge-budget-info">{avgSpent.toLocaleString('ko-KR')}원 / {weeklyBudget.toLocaleString('ko-KR')}원</span>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* 리그 순위 판 (Leagues Leaderboard) */}
            <div className="group-league-board glass-card">
              <h4 className="league-title"><CustomIcon emoji="🏆" /> 실시간 절약 리그</h4>
              <p className="league-sub">평균 지출이 적을수록 높은 순위를 차지합니다.</p>
              <div className="league-rows">
                {(() => {
                  const userSpent = weekRank?.find((r) => r.user_id === userId)?.total ?? 0;
                  
                  const sortedGroups = allGroups.map((g) => {
                    const isMine = g.id === activeGroup.id;
                    const otherCount = Math.max(1, g.members.includes(getNickname() || '나') ? g.members.length - 1 : g.members.length);
                    const otherSpentTotal = g.averageSpent * otherCount;
                    const avgSpent = isMine 
                      ? Math.round((otherSpentTotal + userSpent) / (otherCount + 1))
                      : g.averageSpent;
                    return {
                      ...g,
                      avgSpent,
                      isMine
                    };
                  }).sort((a, b) => a.avgSpent - b.avgSpent);

                  return sortedGroups.map((g, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}위`;
                    return (
                      <div key={g.id} className={`league-row${g.isMine ? ' league-row--mine' : ''}`}>
                        <span className="league-rank">{medal}</span>
                        <span className="league-name">
                          {g.name}
                          {g.isMine && <span className="my-group-tag">우리 그룹</span>}
                        </span>
                        <span className="league-spent">{g.avgSpent.toLocaleString('ko-KR')}원</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* 💬 그룹 한마디 방명록 (Guestbook) */}
            <div className="group-guestbook glass-card">
              <h4 className="guestbook-title">💬 실시간 그룹 응원 방명록</h4>
              <p className="guestbook-sub">그룹원들과 응원 메시지나 절약 다짐을 나누어보세요.</p>
              
              <div className="guestbook-messages">
                {((groupMessages[activeGroup.id]) || []).map((msg, index) => (
                  <div key={index} className="guestbook-msg-row">
                    <div className="msg-sender-wrap">
                      <span className="msg-sender">{msg.sender}</span>
                    </div>
                    <span className="msg-text">{msg.text}</span>
                    <span className="msg-time">{msg.time}</span>
                  </div>
                ))}
                {((groupMessages[activeGroup.id]) || []).length === 0 && (
                  <p className="guestbook-empty">작성된 방명록이 없습니다. 첫 한마디를 적어보세요!</p>
                )}
              </div>

              <div className="guestbook-input-row">
                <input
                  type="text"
                  placeholder="응원이나 오늘 지출 각오 한마디..."
                  value={newGroupMessageText}
                  onChange={(e) => setNewGroupMessageText(e.target.value.slice(0, 50))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handlePostGroupMessage(); } }}
                  maxLength={50}
                  className="guestbook-input"
                />
                <button
                  onClick={handlePostGroupMessage}
                  disabled={!newGroupMessageText.trim()}
                  className="guestbook-submit-btn"
                >
                  등록
                </button>
              </div>
            </div>

            {/* 💪 이번 주 그룹 챌린지 */}
            <div className="glass-card challenge-card">
              <div className="challenge-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="challenge-card-title">💪 이번 주 그룹 챌린지</span>
                <button
                  className="challenge-create-custom-btn"
                  onClick={() => setShowCustomModal(true)}
                  style={{
                    background: 'linear-gradient(135deg, #FF7893 0%, #FF5E7E 100%)',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '3px 10px',
                    color: '#fff',
                    fontSize: '10px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}
                >
                  <CustomIcon emoji="➕" /> 놀이 만들기
                </button>
              </div>
              <div className="challenge-card-body">
                <span className="challenge-emoji"><CustomIcon emoji={weekChallenge.emoji} /></span>
                <div className="challenge-info">
                  <p className="challenge-name">{renderTextWithEmoji(weekChallenge.title)}</p>
                  <p className="challenge-desc">{renderTextWithEmoji(weekChallenge.desc)}</p>
                </div>
                <button
                  onClick={() => handleToggleChallenge(weekChallenge.id)}
                  className={`challenge-join-btn${activeChallenge === weekChallenge.id ? ' challenge-join-btn--active' : ''}`}
                >
                  {activeChallenge === weekChallenge.id ? '참여 중 ✓' : '참여하기'}
                </button>
              </div>
            </div>

            {/* 그룹 전용 피드 */}
            <div className="group-feed">
              <h4 className="group-feed-title"><CustomIcon emoji="💬" /> 우리 그룹 소식통</h4>
              {groupFilteredEntries.length === 0 ? (
                <div className="empty-state">
                  <p>우리 그룹 멤버의 이번 주 지출 기록이 없어요.</p>
                  <p className="empty-sub">짧은 한 줄, 사진 한 장이면 충분해요</p>
                </div>
              ) : (
                <div className="feed-list">
                  {groupFilteredEntries.map((entry, idx) => (
                    <React.Fragment key={entry.id}>
                      {renderFeedCard(entry)}
                      {(idx + 1) % 5 === 0 && <FeedBannerSlot />}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        /* 일반 피드 (전체 & 팔로우 탭) */
        <>
          {/* ⚖️ 밸런스 게임 — 실제 유저 기록 기반 */}
          {balanceEntry !== 'empty' && (
            <div className="glass-card balance-game-card-glow">
              <div className="balance-card-header">
                <span className="balance-card-title"><CustomIcon emoji="⚖️" /> 실시간 짠물 배틀</span>
                {balanceEntry !== 'loading' && typeof balanceEntry === 'object' && (
                  <span className="balance-card-status">판정 진행 중</span>
                )}
              </div>

              {balanceEntry === 'loading' ? (
                <div className="balance-loading-lg" />
              ) : typeof balanceEntry === 'object' && balanceEntry !== null ? (() => {
                const entry = balanceEntry;
                const spendItems = entry.items.filter(it => it.category !== '한마디' && it.category !== '마일스톤');
                const noteItem = entry.items.find(it => it.category === '한마디');
                return (
                  <div className="balance-receipt-wrap">
                    {/* 닉네임 */}
                    <p className="balance-receipt-author">{entry.nickname}님의 지출</p>

                    {/* 지출 항목 영수증 컨테이너 */}
                    <div className="balance-receipt-box">
                      <div className="balance-receipt-items">
                        {spendItems.map((item, i) => (
                          <div key={i} className="balance-receipt-item">
                            <span className="balance-receipt-item-label"><CustomIcon emoji={item.emoji} /> {item.comment || item.category}</span>
                            <span className="balance-receipt-item-amount">{item.amount.toLocaleString('ko-KR')}원</span>
                          </div>
                        ))}
                        <div className="balance-receipt-total">
                          <span className="balance-receipt-total-label">합계</span>
                          <span className="balance-receipt-total-amount">{entry.total_amount.toLocaleString('ko-KR')}원</span>
                        </div>
                      </div>
                    </div>

                    {/* 한마디 */}
                    {noteItem && (
                      <p className="balance-note"><CustomIcon emoji="💬" /> {noteItem.comment}</p>
                    )}

                    {balanceVoted ? (
                      /* 투표 후 결과 */
                      balanceStats ? (
                        <div className="balance-results">
                          <div className="balance-result-row">
                            <span className="balance-result-over">
                              과소비 {balanceStats.over}%
                              {balanceVoted === 'over' && <span className="balance-result-badge balance-result-badge--over">내 판정 <CustomIcon emoji="💸" /></span>}
                            </span>
                            <span className="balance-result-total">총 {totalVotes}명 참여</span>
                            <span className="balance-result-ok">
                              {balanceVoted === 'ok' && <span className="balance-result-badge balance-result-badge--ok">내 판정 <CustomIcon emoji="🌿" /></span>}
                              합리적 {balanceStats.ok}%
                            </span>
                          </div>

                          <div className="balance-bar-container">
                            <div
                              className="balance-bar-fill balance-bar-fill--over"
                              style={{ width: `${balanceStats.over}%` }}
                            />
                            <div
                              className="balance-bar-fill balance-bar-fill--ok"
                              style={{ width: `${balanceStats.ok}%` }}
                            />
                          </div>
                          
                          <button
                            onClick={loadBalanceEntry}
                            className="next-battle-btn"
                          >
                            다음 지출 판정하기 →
                          </button>
                        </div>
                      ) : (
                        /* 집계 중 스켈레톤 */
                        <div className="balance-loading-sm" />
                      )
                    ) : (
                      /* 투표 전 버튼 */
                      <div className="balance-vote-buttons">
                        <button
                          onClick={async () => {
                            if (balanceVotingRef.current) return;
                            balanceVotingRef.current = true;
                            setBalanceVoted('over');
                            // 피드 인라인 디일레마 카드와 투표 상태 동기화 (이중 투표/리워드 방지)
                            setFeedVotes(prev => ({ ...prev, [entry.id]: 'over' }));
                            try {
                              const stats = await submitBalanceVote(entry.id, userId, 'over');
                              setBalanceStats(stats);
                              showFeedToast('⚖️ 투표 완료!');
                            } catch {
                              setBalanceStats(null);
                              setBalanceVoted(null);
                              setFeedVotes(prev => { const { [entry.id]: _, ...rest } = prev; return rest; });
                              showFeedToast('투표 중 오류가 발생했어요. 다시 시도해 주세요.');
                            } finally {
                              balanceVotingRef.current = false;
                            }
                          }}
                          className="balance-vote-card balance-vote-card--over"
                        >
                          <span className="vote-emoji"><CustomIcon emoji="💸" /></span>
                          <span className="vote-title">과소비</span>
                          <span className="vote-desc">참을 수 없던 사치</span>
                        </button>
                        <button
                          onClick={async () => {
                            if (balanceVotingRef.current) return;
                            balanceVotingRef.current = true;
                            setBalanceVoted('ok');
                            // 피드 인라인 디일레마 카드와 투표 상태 동기화 (이중 투표/리워드 방지)
                            setFeedVotes(prev => ({ ...prev, [entry.id]: 'ok' }));
                            try {
                              const stats = await submitBalanceVote(entry.id, userId, 'ok');
                              setBalanceStats(stats);
                              showFeedToast('⚖️ 투표 완료!');
                            } catch {
                              setBalanceStats(null);
                              setBalanceVoted(null);
                              setFeedVotes(prev => { const { [entry.id]: _, ...rest } = prev; return rest; });
                              showFeedToast('투표 중 오류가 발생했어요. 다시 시도해 주세요.');
                            } finally {
                              balanceVotingRef.current = false;
                            }
                          }}
                          className="balance-vote-card balance-vote-card--ok"
                        >
                          <span className="vote-emoji"><CustomIcon emoji="🌿" /></span>
                          <span className="vote-title">합리적</span>
                          <span className="vote-desc">생존형 필수 소비</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })() : null}
            </div>
          )}

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
                  <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', textAlign: 'left', background: 'linear-gradient(135deg, rgba(0,245,160,0.08), rgba(255,255,255,0.02))', border: '1.5px solid rgba(0,245,160,0.2)' }}>
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
                  background: 'rgba(255, 255, 255, 0.02)',
                  padding: '16px 16px 12px',
                  borderRadius: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
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
                        background: 'rgba(255,255,255,0.02)'
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
                            boxShadow: isSelected ? '0 0 8px rgba(0, 245, 160, 0.4)' : 'none',
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
                  background: 'rgba(0, 245, 160, 0.08)',
                  border: '1px solid rgba(0, 245, 160, 0.2)',
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

      {/* 👥 절약 그룹 만들기 모달 */}
      {showCreateGroupModal && (
        <div className="story-modal-overlay" onClick={() => setShowCreateGroupModal(false)}>
          <div className="story-modal-sheet glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="story-modal-header">
              <h3 className="story-modal-name">새로운 절약 그룹 개설 <CustomIcon emoji="👥" /></h3>
              <p className="story-modal-label">목표와 하루 지출 예산을 설정하고 짠친들을 모집하세요.</p>
            </div>
            <div className="story-modal-content">
              <div className="group-form-field">
                <label className="group-form-label">그룹 이름</label>
                <input
                  type="text"
                  placeholder="예) 올리브영 불매위원회, 식비 5만원 챌린지"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value.slice(0, 20))}
                  maxLength={20}
                  className="feed-thread-input"
                  style={{ width: '100%', marginBottom: 12 }}
                />
              </div>
              <div className="group-form-field">
                <label className="group-form-label">그룹 설명</label>
                <textarea
                  placeholder="그룹의 규칙이나 각오를 적어주세요..."
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value.slice(0, 100))}
                  className="message-modal-textarea"
                  style={{ minHeight: 60, marginBottom: 12 }}
                  maxLength={100}
                />
              </div>
              <div className="group-form-field">
                <label className="group-form-label">하루 예산 한도 (원): <strong>{newGroupBudget.toLocaleString('ko-KR')}원</strong></label>
                <input
                  type="range"
                  min="0"
                  max="100000"
                  step="5000"
                  value={newGroupBudget}
                  onChange={(e) => setNewGroupBudget(Number(e.target.value))}
                  className="group-budget-range"
                  style={{ width: '100%', marginTop: 8 }}
                />
              </div>
            </div>
            <div className="story-modal-footer">
              <div>
                <Button size="large" display="full" color="dark" variant="weak" onClick={() => setShowCreateGroupModal(false)}>취소</Button>
              </div>
              <div>
                <Button size="large" display="full" color="primary" variant="fill" disabled={!newGroupName.trim() || !newGroupDesc.trim()} onClick={handleCreateGroupSubmit}>그룹 개설</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ➕ 우리만의 절약 놀이 만들기 모달 */}
      {showCustomModal && (
        <div className="story-modal-overlay" onClick={() => setShowCustomModal(false)}>
          <div className="story-modal-sheet glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="story-modal-header">
              <span style={{ fontSize: '24px' }}><CustomIcon emoji="🎮" /></span>
              <div>
                <h3 className="story-modal-name">우리만의 절약 놀이 만들기 <CustomIcon emoji="➕" /></h3>
                <p className="story-modal-label">친구들과 함께하고 싶은 새로운 규칙을 정의해 보세요!</p>
              </div>
            </div>

            <div className="story-modal-content">
              <div className="group-form-field" style={{ marginBottom: 12 }}>
                <label className="group-form-label">놀이 이름 (예: 물 마시기 챌린지)</label>
                <input
                  type="text"
                  placeholder="예) 물 마시기 챌린지, 만보 걷기 등..."
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value.slice(0, 24))}
                  className="group-name-input"
                  style={{ width: '100%', marginTop: 6 }}
                  maxLength={24}
                />
              </div>

              <div className="group-form-field" style={{ marginBottom: 12 }}>
                <label className="group-form-label">놀이 규칙 설명</label>
                <textarea
                  placeholder="구체적인 규칙을 적어주세요. 예) 하루 물 2L 마시기 인증 샷을 올리면 플러스!"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value.slice(0, 100))}
                  className="message-modal-textarea"
                  style={{ minHeight: 60, marginBottom: 12 }}
                  maxLength={100}
                />
              </div>

              <div className="group-form-field">
                <label className="group-form-label">대표 이모지</label>
                <div style={{ display: 'flex', gap: '8px', marginTop: 6, flexWrap: 'wrap' }}>
                  {['🏆', '💧', '🏃', '☕', '🍱', '🍳', '🎨', '📚'].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setCustomEmoji(emoji)}
                      style={{
                        fontSize: '20px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: customEmoji === emoji ? '2px solid var(--primary)' : '1px solid var(--border)',
                        background: customEmoji === emoji ? 'var(--primary-light)' : 'rgba(255,255,255,0.05)',
                        cursor: 'pointer'
                      }}
                    >
                      <CustomIcon emoji={emoji} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="story-modal-footer" style={{ marginTop: 16 }}>
              <div>
                <Button size="large" display="full" color="dark" variant="weak" onClick={() => setShowCustomModal(false)}>취소</Button>
              </div>
              <div>
                <Button size="large" display="full" color="primary" variant="fill" disabled={!customTitle.trim() || !customDesc.trim()} onClick={handleCreateCustomChallenge}>놀이 개설</Button>
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
