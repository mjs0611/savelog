import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@toss/tds-mobile';
import { TossAds } from '@apps-in-toss/web-framework';
import type { EntryWithReactions, WeekRankRow } from '../lib/supabase';
import { fetchFeed, toggleReaction, fetchBalanceGameEntry, submitBalanceVote, fetchFollows, toggleFollowSupabase, searchUsers, type BalanceEntry, type SearchUser } from '../lib/supabase';
import { formatAmount, timeAgo, getWeekKey, getTodayStr } from '../lib/utils';
import { PERSONAS, getPersona, getNickname, sendCheeringMessage, getFollowedUsers, saveFollowedUsers, getActiveChallengeId, setActiveChallengeId, type StreakData, type DailyState } from '../lib/storage';
import { FEED_BANNER_AD_ID, initBannerAds } from '../lib/ads';
import CustomIcon, { hasMappedIcon } from '../components/CustomIcon';

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

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


const MOCK_TIPS: any[] = [];

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
}


const WEEKLY_CHALLENGES = [
  { id: 'signature-tumbler', title: '시그니처 텀블러 데이 ☕', desc: '일회용 컵 대신 내 최애 텀블러로 힙하게 음료 채우기', emoji: '🥤' },
  { id: 'home-chef', title: '냉장고 털기 홈셰프 🍳', desc: '냉장고 속 잠자던 재료로 나만의 5성급 집밥 만들기', emoji: '🍳' },
  { id: 'local-healing', title: '동네 무료 핫플 탐험 🌿', desc: '돈 안 들이고 친구와 즐기는 숲길 산책 및 미술관 탐방', emoji: '🌳' },
  { id: 'health-charging', title: '물 마시기 & 만보 걷기 루틴 💧', desc: '지갑도 내 몸도 함께 활력 플러스 충전하기', emoji: '💧' },
];

function renderTextWithEmoji(text: string) {
  if (!text) return <></>;
  const result: React.ReactNode[] = [];
  let buffer = '';
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (hasMappedIcon(segment)) {
      if (buffer) { result.push(buffer); buffer = ''; }
      result.push(<CustomIcon key={result.length} emoji={segment} />);
    } else {
      buffer += segment;
    }
  }
  if (buffer) result.push(buffer);
  return <>{result}</>;
}

export default function FeedScreen({ userId, refreshToken = 0, weekRank = [], daily, streak, pendingPoints, pendingClaiming, onRecord, onQuickZeroSpend, onClaimPending, onShareToChat }: Props) {
  const [entries, setEntries] = useState<EntryWithReactions[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoaded = React.useRef(false);
  const loadIdRef = React.useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(() => new Set());
  const togglingRef = React.useRef<Set<string>>(new Set());
  // 쪽지 및 하트 인터랙션 관련 상태
  const [messageRecipientEntry, setMessageRecipientEntry] = useState<EntryWithReactions | null>(null);
  const [messageText, setMessageText] = useState('');
  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFeedToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastText(msg);
    toastTimerRef.current = setTimeout(() => { setToastText(null); toastTimerRef.current = null; }, 2200);
  }
  const [doubleTappedHearts, setDoubleTappedHearts] = useState<Record<string, boolean>>({});

  // 팔로우 / 탭 필터
  const [feedTab, setFeedTab] = useState<'all' | 'follow' | 'group'>('all');
  const [followedUsers, setFollowedUsers] = useState<Record<string, string>>(() => getFollowedUsers());
  const followInFlight = React.useRef<Set<string>>(new Set());

  // 검색
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pull-to-refresh
  const [pullState, setPullState] = useState<{ y: number; refreshing: boolean }>({ y: 0, refreshing: false });
  const pullStartRef = React.useRef<number | null>(null);
  const screenRef = React.useRef<HTMLDivElement>(null);

  // 🏆 금주의 베스트 꿀팁
  const topTips = React.useMemo(() => {
    const tips = entries.flatMap(entry => 
      entry.items
        .filter(item => item.category === '꿀팁')
        .map(item => ({
          entryId: entry.id,
          nickname: entry.nickname,
          persona: entry.persona,
          item,
          likes: (entry.trust_count || 0) + (entry.doubt_count || 0)
        }))
    );
    // 실제 데이터가 없으면 Mock 데이터 노출
    return tips.length > 0 ? tips.slice(0, 3) : MOCK_TIPS;
  }, [entries]);



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

  // 자유 텍스트 댓글 입력 상태 (엔트리별)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
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

  async function handleReact(entry: EntryWithReactions, type: 'trust' | 'doubt', e: React.MouseEvent<HTMLButtonElement>) {
    if (entry.user_id === userId) return;
    if (togglingRef.current.has(entry.id)) return;
    togglingRef.current.add(entry.id);
    setToggling(prev => new Set(prev).add(entry.id));

    // 파티클 생성
    spawnParticles(type === 'trust' ? '💖' : '🤔', e);

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

  function submitCommentInput(entryId: string) {
    const text = (commentInputs[entryId] || '').trim();
    if (!text) return;
    addComment(entryId, text);
    setCommentInputs(prev => ({ ...prev, [entryId]: '' }));
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
      showFeedToast(following ? `${targetNickname}님을 팔로우했어요 👥` : `${targetNickname}님 팔로우 해제`);
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

  // 피드 정렬: 항상 최신순 (created_at desc). 팔로우 탭만 친구로 필터.
  const displayedEntries = React.useMemo(() => {
    const sorted = entries.slice().sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (feedTab === 'follow') {
      return sorted.filter(e => e.user_id === userId || !!followedUsers[e.user_id]);
    }
    return sorted;
  }, [entries, userId, followedUsers, feedTab]);

  const renderFeedCard = (entry: EntryWithReactions) => {
    const personaKey = entry.persona || (entry.user_id === userId ? myPersonaKey : null);
    const p = personaKey ? PERSONAS[personaKey] : null;

    const isMilestone = entry.items.some(it => it.category === '마일스톤');
    const isTipPost = entry.items.some(it => it.category === '꿀팁');
    const isDilemmaPost = entry.items.some(it => it.category === '소비 고민') || entry.is_balance_game;

    const comments = localComments[entry.id] || [];
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
        {/* 카드 헤더 — 아바타 + 닉네임 + 팔로우 */}
        <div className="feed-card-ig-header">
          <div
            className="feed-card-ig-avatar"
            style={p ? { borderColor: p.color } : {}}
          >
            {p ? <img src={p.icon} alt="" /> : (entry.nickname ? entry.nickname.charAt(0).toUpperCase() : '?')}
          </div>
          <div className="feed-card-ig-meta">
            <div className="feed-card-ig-nickname-row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span className="feed-card-ig-nickname">{entry.nickname}</span>
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
                  {p.emoji} {p.name}
                </span>
              )}
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
          
          const seed = entry.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
          const overPctBase = (seed % 40) + 30; // 30% ~ 70%
          
          let overPct = overPctBase;
          let okPct = 100 - overPct;
          if (myVote === 'over') {
            overPct = Math.min(95, overPct + 5);
            okPct = 100 - overPct;
          } else if (myVote === 'ok') {
            okPct = Math.min(95, okPct + 5);
            overPct = 100 - okPct;
          }
          
          const totalFeedVotes = (seed % 30) + 12 + (myVote ? 1 : 0);

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
            </div>
          );
        })()}

        {/* 오늘 한마디 (💬 한마디 특수 항목) */}
        {entry.items.filter(it => it.category === '한마디').map((it, i) => (
          <p key={i} className="feed-note"><CustomIcon emoji="💬" /> {it.comment}</p>
        ))}

        {/* 인증샷 / 영수증 이미지 */}
        {entry.image && (
          <div className="feed-card-image-wrap" onDoubleClick={(e) => handleDoubleTap(entry, e)} style={{ position: 'relative' }}>
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
              {spendItems.map((item, i) => (
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
                    </span>
                    {item.comment && <span className="feed-item-comment">{(item.comment || '').replace(/^\[.*?\]\s*/, '')}</span>}
                  </div>
                  <span className={`feed-item-amount ${item.amount === 0 ? 'feed-item-amount--zero' : ''}`}>
                    {item.amount === 0 ? '0원' : formatAmount(item.amount)}
                  </span>
                </div>
              ))}
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


        {/* 댓글 스레드 — SNS 스타일 */}
        {entry.user_id !== userId && !isMilestone && (() => {
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
                        <span className="feed-thread-text">{c.text}</span>
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
            {pullState.refreshing ? '🔄' : (pullState.y >= 60 ? '↑ 놓으면 새로고침' : '↓ 당겨서 새로고침')}
          </span>
        </div>
      )}



      {/* 🏆 금주의 짠테크 꿀팁 베스트 */}
      {feedTab === 'all' && topTips.length > 0 && (
        <div className="top-tips-container">
          <h3 className="top-tips-title"><CustomIcon emoji="🏆" /> 금주의 짠테크 꿀팁 베스트</h3>
          <div className="top-tips-scroll">
            {topTips.map((tip, idx) => {
              const p = tip.persona ? PERSONAS[tip.persona] : null;
              return (
                <div key={`${tip.entryId}-${idx}`} className="top-tip-card">
                  <div className="top-tip-header">
                    <span className="top-tip-avatar" style={p ? { background: `${p.color}20`, color: p.color } : {}}>
                      {p ? <img src={p.icon} alt="" className="custom-icon--sm" /> : <CustomIcon emoji="🐷" className="custom-icon--sm" />}
                    </span>
                    <span className="top-tip-nickname">{tip.nickname}</span>
                  </div>
                  <p className="top-tip-text">
                    <span className="top-tip-emoji"><CustomIcon emoji={tip.item.emoji} /></span>
                    {(tip.item.comment || '').replace(/^\[.*?\]\s*/, '') /* Remove category prefix if any */}
                  </p>
                  <div className="top-tip-footer">
                    <span className="top-tip-likes"><CustomIcon emoji="❤️" /> {tip.likes}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 📝 인라인 포스트 컴포저 (Facebook/LinkedIn 스타일 기록 CTA) */}
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
              <span className="feed-composer-placeholder">오늘 어떤 하루였어요?</span>
            </div>
            <div className="feed-composer-actions">
              <button className="feed-composer-action-btn" onClick={onRecord}>
                <CustomIcon emoji="📝" /> <span>오늘 기록</span>
              </button>
              <button className="feed-composer-action-btn" onClick={onQuickZeroSpend}>
                <CustomIcon emoji="🌿" /> <span>지갑 쉬는 날</span>
              </button>
            </div>
            {!daily.recorded && streak.totalDays === 0 && (
              <p className="feed-composer-onboarding-hint"><CustomIcon emoji="✨" /> 첫 지출을 기록해보세요!</p>
            )}
          </>
        )}


      </div>

      {/* 💰 보류 포인트 배너 */}
      {pendingPoints > 0 && (
        <div className="feed-pending-banner" onClick={onClaimPending}>
          <span className="feed-pending-icon"><CustomIcon emoji="💰" /></span>
          <span className="feed-pending-text">미수령 포인트 <strong>{pendingPoints}원</strong>이 있어요!</span>
          <span className="feed-pending-cta">{pendingClaiming ? '처리 중...' : '받기 →'}</span>
        </div>
      )}

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

          {entries.length === 0 ? (
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
          ) : (
            <div className="feed-list">
              {loadFailed && (
                <div className="rank-stale-banner">
                  <span className="rank-stale-text">⚠ 피드 갱신 실패 · 마지막 데이터 표시 중</span>
                  <button onClick={() => load(false)} className="rank-stale-retry-btn">재시도</button>
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
                    {tpl}
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

      <div className="rank-bottom-spacer" />
    </div>
  );
}
