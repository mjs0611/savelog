import React, { useEffect, useState } from 'react';
import { Badge, Button } from '@toss/tds-mobile';
import type { EntryWithReactions } from '../lib/supabase';
import { fetchFeed, toggleReaction, fetchBalanceGameEntry, submitBalanceVote, fetchFollows, toggleFollowSupabase, type BalanceEntry } from '../lib/supabase';
import { formatAmount, formatDate, timeAgo, getWeekKey } from '../lib/utils';
import { PERSONAS, getPersona, getNickname, sendCheeringMessage, sendPokeNotification, getFollowedUsers, saveFollowedUsers, toggleFollow, getActiveChallengeId, setActiveChallengeId } from '../lib/storage';

interface Props {
  userId: string;
  onGrantFeedReward?: () => void;
  refreshToken?: number;
}

const COMMENT_CHIPS = ['지갑 지켜! 🛡️', '절약 요정 인정 🧚‍♀️', '시발비용 화이팅 😭', '이건 어쩔 수 없지 ☕'];

const WEEKLY_CHALLENGES = [
  { id: 'no-delivery', title: '배달 금지 챌린지', desc: '배달 앱 없이 한 주 버티기', emoji: '🍱' },
  { id: 'no-cafe', title: '카페 금지 챌린지', desc: '카페 지출 0원 7일 도전', emoji: '☕' },
  { id: 'home-cooking', title: '집밥 챌린지', desc: '식비를 집밥으로만 해결', emoji: '🍳' },
  { id: 'no-shopping', title: '쇼핑 금지 챌린지', desc: '온라인 쇼핑 0원 7일', emoji: '🛒' },
];

export default function FeedScreen({ userId, onGrantFeedReward, refreshToken = 0 }: Props) {
  const [entries, setEntries] = useState<EntryWithReactions[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoaded = React.useRef(false);
  const loadIdRef = React.useRef(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [toggling, setToggling] = useState<Set<string>>(() => new Set());
  const togglingRef = React.useRef<Set<string>>(new Set());
  const [pokedEntries, setPokedEntries] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('savelog_poked_entries');
      return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
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
  // 세션 내 리액션 리워드 지급된 엔트리 추적 — 언리액션 후 재반응 시 중복 지급 방지
  const [reactionRewardedEntries, setReactionRewardedEntries] = useState<Set<string>>(() => new Set());

  // 팔로우 / 탭 필터
  const [feedTab, setFeedTab] = useState<'all' | 'follow'>('all');
  const [followedUsers, setFollowedUsers] = useState<Record<string, string>>(() => getFollowedUsers());

  // 자유 텍스트 댓글 입력 상태 (엔트리별)
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  // 댓글 스레드 펼침 상태 (2개 초과 시)
  const [commentExpanded, setCommentExpanded] = useState<Record<string, boolean>>({});

  // 그룹 챌린지 참여 상태
  const [activeChallenge, setActiveChallenge] = useState<string | null>(() => getActiveChallengeId());

  // 이번 주 챌린지 (주차별 결정론적 선택)
  const weekChallenge = (() => {
    const wk = getWeekKey();
    const hash = wk.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
    return WEEKLY_CHALLENGES[Math.abs(hash) % WEEKLY_CHALLENGES.length];
  })();

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

  const myPersonaKey = getPersona();

  useEffect(() => {
    // 최초 로드는 스켈레톤 표시, 이후 refreshToken/userId 변경은 현재 로드 상태에 따라 갱신
    // userId는 anonymousKey 발급 시 변경될 수 있어 my_reaction 정합성을 위해 포함
    load(initialLoaded.current);
  }, [refreshToken, userId]);

  useEffect(() => {
    // 밸런스 게임은 userId 변경 시에만 리셋 (피드 새로고침마다 리셋되지 않도록)
    loadBalanceEntry();
    // Supabase에서 팔로우 목록 동기화 (로컬캐시 덮어쓰기)
    fetchFollows(userId).then((remote) => {
      saveFollowedUsers(remote);
      setFollowedUsers(remote);
    }).catch(() => {/* 오류 시 로컬캐시 유지 */});
  }, [userId]);

  async function loadBalanceEntry() {
    setBalanceEntry('loading');
    setBalanceVoted(null);
    setBalanceStats(null);
    balanceVotingRef.current = false;
    const entry = await fetchBalanceGameEntry(userId);
    setBalanceEntry(entry ?? 'empty');
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

      // 현재 피드에 없는 엔트리의 댓글 및 콕 찌르기를 localStorage에서 정리
      // data가 빈 배열이어도 정리 실행 (validIds가 빈 Set이면 고아 키 전체 제거)
      const validIds = new Set(data.map((e) => e.id));
      setLocalComments((prev) => {
        const pruned = Object.fromEntries(
          Object.entries(prev).filter(([id]) => validIds.has(id))
        );
        if (Object.keys(pruned).length < Object.keys(prev).length) {
          localStorage.setItem('feed_comments', JSON.stringify(pruned));
        }
        return pruned;
      });
      setPokedEntries((prev) => {
        const cleaned = new Set([...prev].filter((id) => validIds.has(id)));
        if (cleaned.size !== prev.size) {
          try { localStorage.setItem('savelog_poked_entries', JSON.stringify([...cleaned])); } catch {}
        }
        return cleaned;
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

    // 반응이 없는 상태에서 처음 추가할 때만 포인트 지급
    // reactionRewardedEntries로 세션 내 중복 지급 방지 (un-react 후 재반응 케이스)
    const isAdding = entry.my_reaction === null && !reactionRewardedEntries.has(entry.id);
    if (isAdding) {
      setReactionRewardedEntries(prev => new Set(prev).add(entry.id));
      onGrantFeedReward?.();
      showFeedToast('👃 +1원 즉시 지급!');
    }

    // 파티클 생성
    spawnParticles(type === 'trust' ? '👃' : '🤔', e);

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
    setLocalComments((prev) => {
      const existing = prev[entryId] || [];
      if (existing.some((c) => c.sender === '나' && c.text === text)) return prev;
      const updated = { ...prev, [entryId]: [...existing, { sender: '나', text }] };
      localStorage.setItem('feed_comments', JSON.stringify(updated));
      return updated;
    });
  }

  function submitCommentInput(entryId: string) {
    const text = (commentInputs[entryId] || '').trim();
    if (!text) return;
    addComment(entryId, text);
    setCommentInputs(prev => ({ ...prev, [entryId]: '' }));
  }

  function handleToggleFollow(entry: EntryWithReactions) {
    // 낙관적 로컬 업데이트
    const nowFollowing = toggleFollow(entry.user_id, entry.nickname || '');
    setFollowedUsers(getFollowedUsers());
    showFeedToast(nowFollowing ? `${entry.nickname}님을 팔로우했어요 👥` : `${entry.nickname}님 팔로우 해제`);
    // Supabase 동기화 (best-effort, 실패해도 로컬 상태 유지)
    toggleFollowSupabase(userId, entry.user_id, entry.nickname || '').catch(() => {});
  }

  function handleToggleChallenge(id: string) {
    if (activeChallenge === id) {
      setActiveChallengeId(null);
      setActiveChallenge(null);
      showFeedToast('챌린지에서 나왔어요.');
    } else {
      setActiveChallengeId(id);
      setActiveChallenge(id);
      showFeedToast('챌린지 참여 완료! 💪 이번 주 함께 버텨봐요');
    }
  }

  // 팔로우 탭일 때 필터링
  const displayedEntries = feedTab === 'follow'
    ? entries.filter(e => e.user_id === userId || !!followedUsers[e.user_id])
    : entries;

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
    <div className="screen screen-feed">
      {/* 헤더 */}
      <div className="feed-header">
        <h2 className="feed-title">
          짠내 피드
          <img src="/images/savelog_main_character.png" className="custom-icon" style={{ marginLeft: 5 }} />
        </h2>
        <button className="refresh-btn" onClick={() => load(entries.length > 0)}>↻</button>
      </div>

      {/* 탭 필터: 전체 / 팔로우 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {(['all', 'follow'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFeedTab(t)}
            style={{
              padding: '6px 16px',
              borderRadius: 100,
              border: feedTab === t ? '1.5px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)',
              background: feedTab === t ? 'rgba(0,245,160,0.1)' : 'rgba(255,255,255,0.03)',
              color: feedTab === t ? 'var(--primary)' : 'var(--text-mute)',
              fontSize: 12,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {t === 'all' ? '전체' : `팔로우${Object.keys(followedUsers).length > 0 ? ` (${Object.keys(followedUsers).length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ⚖️ 밸런스 게임 — 실제 유저 기록 기반 */}
      {balanceEntry !== 'empty' && (
        <div className="glass-card" style={{ margin: '0 0 4px 0', padding: 18, border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--primary)' }}>⚖️ 이 지출, 합리적일까?</span>
            {balanceEntry !== 'loading' && typeof balanceEntry === 'object' && (
              <span style={{ fontSize: 10, color: 'var(--text-mute)', fontWeight: 700 }}>판정 요청 중</span>
            )}
          </div>

          {balanceEntry === 'loading' ? (
            <div style={{ height: 80, background: 'rgba(255,255,255,0.03)', borderRadius: 10, animation: 'pulse 1.5s infinite' }} />
          ) : typeof balanceEntry === 'object' && balanceEntry !== null ? (() => {
            const entry = balanceEntry;
            const spendItems = entry.items.filter(it => it.category !== '한마디' && it.category !== '마일스톤');
            const noteItem = entry.items.find(it => it.category === '한마디');
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 닉네임 */}
                <p style={{ margin: 0, fontSize: 11, color: 'var(--text-mute)', fontWeight: 700 }}>
                  {entry.nickname}님의 지출
                </p>

                {/* 지출 항목 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {spendItems.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-sub)' }}>{item.emoji} {item.comment || item.category}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{item.amount.toLocaleString('ko-KR')}원</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-mute)', fontWeight: 700 }}>합계</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{entry.total_amount.toLocaleString('ko-KR')}원</span>
                  </div>
                </div>

                {/* 한마디 */}
                {noteItem && (
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--text-mute)', fontStyle: 'italic', paddingLeft: 8, borderLeft: '2px solid var(--primary)', lineHeight: 1.5 }}>
                    💬 {noteItem.comment}
                  </p>
                )}

                {balanceVoted ? (
                  /* 투표 후 결과 */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', height: 22, borderRadius: 100, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${balanceStats?.over ?? 50}%`, background: 'linear-gradient(90deg, #FF5E62, #FF9966)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff', transition: 'width 0.5s ease-out' }}>
                        과소비 {balanceStats?.over}%
                      </div>
                      <div style={{ width: `${balanceStats?.ok ?? 50}%`, background: 'linear-gradient(90deg, #00F5A0, #00D9F5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#090A10', transition: 'width 0.5s ease-out' }}>
                        합리적 {balanceStats?.ok}%
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: 10, color: 'var(--text-mute)', textAlign: 'center' }}>
                      내 판정: {balanceVoted === 'over' ? '💸 과소비' : '🌿 합리적'}
                    </p>
                    <button
                      onClick={loadBalanceEntry}
                      style={{ width: '100%', padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                    >
                      다음 지출 판정하기 →
                    </button>
                  </div>
                ) : (
                  /* 투표 전 버튼 */
                  <div style={{ display: 'flex', gap: 10 }}>
                    {(['over', 'ok'] as const).map(v => (
                      <button
                        key={v}
                        onClick={async () => {
                          if (balanceVotingRef.current) return;
                          balanceVotingRef.current = true;
                          setBalanceVoted(v);
                          const stats = await submitBalanceVote(entry.id, userId, v);
                          setBalanceStats(stats);
                          balanceVotingRef.current = false;
                        }}
                        style={{
                          flex: 1,
                          padding: '11px 0',
                          borderRadius: 100,
                          border: 'none',
                          background: v === 'over' ? 'rgba(255,77,79,0.15)' : 'rgba(0,245,160,0.15)',
                          color: v === 'over' ? '#FF4D4F' : '#00F5A0',
                          fontSize: 12,
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        {v === 'over' ? '💸 과소비' : '🌿 합리적'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })() : null}
        </div>
      )}

      {/* 💪 이번 주 그룹 챌린지 */}
      <div className="glass-card" style={{ margin: '4px 0', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>💪 이번 주 그룹 챌린지</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 26, flexShrink: 0 }}>{weekChallenge.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: '0 0 2px 0', fontSize: 13, fontWeight: 900, color: '#fff' }}>{weekChallenge.title}</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-mute)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{weekChallenge.desc}</p>
          </div>
          <button
            onClick={() => handleToggleChallenge(weekChallenge.id)}
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 100,
              border: activeChallenge === weekChallenge.id ? '1px solid rgba(0,245,160,0.3)' : 'none',
              background: activeChallenge === weekChallenge.id
                ? 'rgba(0,245,160,0.12)'
                : 'linear-gradient(135deg, #00F5A0, #00D9F5)',
              color: activeChallenge === weekChallenge.id ? 'var(--primary)' : '#090A10',
              fontSize: 11,
              fontWeight: 900,
              cursor: 'pointer',
            }}
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
              <p className="empty-sub">네트워크 상태를 확인하고 새로고침 버튼을 눌러보세요</p>
            </>
          ) : (
            <>
              <p>아직 기록이 없어요</p>
              <p className="empty-sub">첫 번째로 오늘 소비를 기록해 보세요!</p>
            </>
          )}
        </div>
      ) : (
        <div className="feed-list">
          {loadFailed && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', marginBottom: 8, background: 'rgba(255,200,0,0.06)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,200,0,0.9)', fontWeight: 700 }}>⚠ 피드 갱신 실패 · 마지막 데이터 표시 중</span>
              <button
                onClick={() => load(false)}
                style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,200,0,0.9)', background: 'rgba(255,200,0,0.12)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 100, padding: '3px 10px', cursor: 'pointer' }}
              >
                재시도
              </button>
            </div>
          )}
          {displayedEntries.length === 0 && feedTab === 'follow' && (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-mute)' }}>
              <p style={{ fontSize: 24, marginBottom: 8 }}>👥</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>팔로우한 짠친이 없어요</p>
              <p style={{ margin: '4px 0 0 0', fontSize: 11 }}>피드에서 팔로우 버튼을 눌러 짠친을 추가해 보세요</p>
            </div>
          )}
          {displayedEntries.map((entry) => {
            const personaKey = entry.persona || (entry.user_id === userId ? myPersonaKey : null);
            const p = personaKey ? PERSONAS[personaKey] : null;
            
            // 지출 레벨 파악 (0원 무지출 / 5만원 이상 FLEX)
            const isMilestone = entry.items.some(it => it.category === '마일스톤');
            const isZeroSpend = !isMilestone && entry.total_amount === 0;
            const isFlexSpend = !isMilestone && entry.total_amount > 50000;
            const cardClass = isMilestone
              ? 'feed-card--milestone'
              : isZeroSpend
              ? 'feed-card--zero'
              : isFlexSpend
              ? 'feed-card--flex'
              : '';

            return (
              <div
                key={entry.id}
                className={`feed-card glass-card ${cardClass} ${entry.user_id === userId ? 'feed-card--mine' : ''}`}
              >
                {/* 카드 헤더 */}
                <div className="feed-card-header">
                  <div className="feed-avatar-wrap">
                    <div
                      className={`feed-avatar ${entry.user_id === userId ? 'feed-avatar--mine' : ''}`}
                      style={p ? { borderColor: p.color } : {}}
                    >
                      {entry.nickname ? entry.nickname.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className="feed-card-meta">
                      <span className="feed-nickname">
                        {entry.nickname}
                        {entry.user_id === userId && (
                          <Badge size="xsmall" color="blue" variant="weak" style={{ marginLeft: 6 }}>나</Badge>
                        )}
                        {p && (
                          <span
                            className="feed-persona-tag"
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              fontWeight: 700,
                              background: `${p.color}15`,
                              color: p.color,
                              border: `1px solid ${p.color}25`,
                              padding: '2px 6px',
                              borderRadius: 100,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              verticalAlign: 'middle',
                            }}
                          >
                            <img src={p.icon} alt="" style={{ width: 11, height: 11, objectFit: 'contain' }} />
                            <span>{p.name}</span>
                          </span>
                        )}
                        {isMilestone && (
                          <span className="feed-tier-tag" style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid rgba(255,215,0,0.3)' }}>🏆 마일스톤</span>
                        )}
                        {isZeroSpend && (
                          <span className="feed-tier-tag zero-tag">👑 무지출</span>
                        )}
                        {isFlexSpend && (
                          <span className="feed-tier-tag flex-tag">🚨 FLEX</span>
                        )}
                      </span>
                      <span className="feed-date">{formatDate(entry.date)} · {timeAgo(entry.created_at)}</span>
                    </div>
                  </div>
                  <div className={`feed-total ${!isMilestone && entry.total_amount === 0 ? 'feed-total--zero' : ''}`} style={isMilestone ? { color: '#FFD700', fontSize: 13 } : {}}>
                    {isMilestone ? '🏆 달성' : entry.total_amount === 0 ? '0원 🎉' : formatAmount(entry.total_amount)}
                  </div>
                </div>

                {/* 마일스톤 달성 메시지 */}
                {entry.items.filter(it => it.category === '마일스톤').map((it, i) => (
                  <p key={i} style={{ margin: '4px 0 8px 0', fontSize: 13, color: '#FFD700', lineHeight: 1.5, fontWeight: 800, paddingLeft: 8, borderLeft: '3px solid #FFD700', background: 'rgba(255,215,0,0.04)', borderRadius: '0 6px 6px 0', padding: '6px 8px' }}>
                    {it.comment}
                  </p>
                ))}

                {/* 오늘 한마디 (💬 한마디 특수 항목) */}
                {entry.items.filter(it => it.category === '한마디').map((it, i) => (
                  <p key={i} style={{ margin: '4px 0 8px 0', fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5, fontStyle: 'italic', paddingLeft: 4, borderLeft: '2px solid var(--primary)' }}>
                    💬 {it.comment}
                  </p>
                ))}

                {/* 지출 항목 */}
                <div className="feed-items">
                  {entry.items.filter(it => it.category !== '한마디' && it.category !== '마일스톤').map((item, i) => (
                    <div key={i} className="feed-item">
                      <span className="feed-item-emoji">{item.emoji}</span>
                      <div className="feed-item-info">
                        <span className="feed-item-cat">{item.category}</span>
                        {item.comment && <span className="feed-item-comment">{item.comment}</span>}
                      </div>
                      <span className={`feed-item-amount ${item.amount === 0 ? 'feed-item-amount--zero' : ''}`}>
                        {item.amount === 0 ? '0원' : formatAmount(item.amount)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 인증샷 / 영수증 이미지 */}
                {entry.image && (
                  <div className="feed-card-image-wrap" onDoubleClick={(e) => handleDoubleTap(entry, e)} style={{ position: 'relative' }}>
                    <img src={entry.image} alt="Spending Proof" className="feed-card-img" />
                    {doubleTappedHearts[entry.id] && (
                      <div className="heart-double-tap-overlay">❤️</div>
                    )}
                  </div>
                )}

                {/* 리액션 카운트 — 정보 표시 라인 (인스타 스타일) */}
                {entry.user_id !== userId && (entry.trust_count > 0 || entry.doubt_count > 0) && (
                  <div className="feed-reaction-counts">
                    {entry.trust_count > 0 && <span>👃 {entry.trust_count}명</span>}
                    {entry.doubt_count > 0 && <span>🤔 {entry.doubt_count}명</span>}
                  </div>
                )}

                {/* 액션 버튼 행 */}
                {entry.user_id !== userId && (
                  <div className="feed-actions-row">
                    {/* 왼쪽: 감정 리액션 버튼 (카운트 없음) */}
                    <div className="feed-reactions-group">
                      <button
                        className={`reaction-btn ${entry.my_reaction === 'trust' ? 'reaction-btn--active reaction-btn--trust' : ''}`}
                        onClick={(e) => handleReact(entry, 'trust', e)}
                        disabled={toggling.has(entry.id)}
                      >
                        👃 짠내난다
                      </button>
                      <button
                        className={`reaction-btn ${entry.my_reaction === 'doubt' ? 'reaction-btn--active reaction-btn--doubt' : ''}`}
                        onClick={(e) => handleReact(entry, 'doubt', e)}
                        disabled={toggling.has(entry.id)}
                      >
                        🤔 진짜야?
                      </button>
                    </div>

                    {/* 오른쪽: 아이콘 액션 */}
                    <div className="feed-actions-group">
                      {/* 콕 찌르기 */}
                      <button
                        className={`action-icon-btn${pokedEntries.has(entry.id) ? ' action-icon-btn--done' : isZeroSpend ? ' action-icon-btn--praise' : ' action-icon-btn--warn'}`}
                        disabled={pokedEntries.has(entry.id)}
                        title={pokedEntries.has(entry.id) ? '콕 찌름 완료' : isZeroSpend ? '칭찬 콕!' : '일침 콕!'}
                        onClick={(e) => {
                          if (pokedEntries.has(entry.id)) return;
                          setPokedEntries(prev => {
                            const next = new Set(prev).add(entry.id);
                            try { localStorage.setItem('savelog_poked_entries', JSON.stringify([...next])); } catch {}
                            return next;
                          });
                          spawnParticles('⚡', e);
                          sendPokeNotification(entry.nickname || '익명', getNickname() || '나', myPersonaKey, isZeroSpend);
                        }}
                      >
                        {pokedEntries.has(entry.id) ? '✓' : '⚡'}
                      </button>

                      {/* 응원 쪽지 */}
                      <button
                        className="action-icon-btn"
                        title="응원 쪽지 보내기"
                        onClick={() => { setMessageRecipientEntry(entry); setMessageText(''); }}
                      >
                        ✉️
                      </button>

                      {/* 팔로우 */}
                      <button
                        className={`action-icon-btn${followedUsers[entry.user_id] ? ' action-icon-btn--following' : ''}`}
                        onClick={() => handleToggleFollow(entry)}
                        title={followedUsers[entry.user_id] ? '팔로잉' : '팔로우'}
                      >
                        {followedUsers[entry.user_id] ? '👥' : '👤'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 신뢰도 경고 */}
                {entry.doubt_count > 0 && entry.doubt_count / (entry.trust_count + entry.doubt_count) > 0.3 && (
                  <div className="doubt-warning">
                    🚨 일부 사용자가 의심하고 있어요 ({Math.round(entry.doubt_count / (entry.trust_count + entry.doubt_count) * 100)}%)
                  </div>
                )}

                {/* 댓글 스레드 — SNS 스타일 */}
                {entry.user_id !== userId && !isMilestone && (() => {
                  const comments = localComments[entry.id] || [];
                  const isExpanded = !!commentExpanded[entry.id];
                  const visible = isExpanded ? comments : comments.slice(0, 2);
                  return (
                    <div className="feed-thread-section">
                      {/* 댓글 목록 */}
                      {comments.length > 0 && (
                        <div className="feed-thread-list">
                          {visible.map((c, i) => (
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

                      {/* 퀵 칩 */}
                      <div className="feed-thread-chips">
                        {COMMENT_CHIPS.map((cmt) => {
                          const used = comments.some(c => c.sender === '나' && c.text === cmt);
                          return (
                            <button
                              key={cmt}
                              className={`comment-chip-btn${used ? ' comment-chip-btn--used' : ''}`}
                              onClick={() => addComment(entry.id, cmt)}
                              disabled={used}
                            >
                              {cmt}
                            </button>
                          );
                        })}
                      </div>

                      {/* 댓글 직접 입력 */}
                      <div className="feed-thread-input-row">
                        <input
                          type="text"
                          value={commentInputs[entry.id] || ''}
                          onChange={e => setCommentInputs(prev => ({ ...prev, [entry.id]: e.target.value.slice(0, 60) }))}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitCommentInput(entry.id); } }}
                          placeholder="댓글 달기..."
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
          })}
        </div>
      )}

      {/* 응원 쪽지 보내기 모달 */}
      {messageRecipientEntry && (
        <div className="story-modal-overlay" onClick={() => setMessageRecipientEntry(null)}>
          <div className="story-modal-sheet glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 340 }}>
            <div className="story-modal-header" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 16 }}>
              <img src="/images/icon_mailbox.png" className="custom-icon" style={{ width: 28, height: 28, objectFit: 'contain' }} />
              <div>
                <h3 className="story-modal-name" style={{ fontSize: 16, color: 'var(--primary)' }}>
                  {messageRecipientEntry.nickname}님에게 응원 보내기
                </h3>
                <p className="story-modal-label" style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>
                  익명으로 전달되는 짠내 응원 쪽지입니다.
                </p>
              </div>
            </div>
            
            <div className="story-modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
              {/* 퀵 템플릿 칩 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {[
                  '오늘 하루도 잘 버텼어요! 👏',
                  '무지출 성공 축하드려요! 🎉',
                  '절약 고수의 품격이네요 👑',
                  '저도 자극받아 허리띠 졸라맵니다 🔥'
                ].map((tpl) => (
                  <button
                    key={tpl}
                    onClick={() => setMessageText(tpl)}
                    style={{
                      fontSize: 11,
                      color: 'var(--text-sub)',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      padding: '6px 10px',
                      borderRadius: 100,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary)';
                      e.currentTarget.style.color = '#fff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.color = 'var(--text-sub)';
                    }}
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
                style={{
                  width: '100%',
                  height: 90,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 'var(--radius-sm)',
                  padding: 12,
                  color: 'var(--text-main)',
                  fontSize: 13,
                  resize: 'none',
                  outline: 'none',
                  marginTop: 8
                }}
              />
              <span style={{ alignSelf: 'flex-end', fontSize: 10, color: 'var(--text-mute)' }}>
                {messageText.length}/100자
              </span>
            </div>

            <div className="story-modal-footer" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <Button
                  size="large"
                  display="full"
                  color="dark"
                  variant="weak"
                  onClick={() => setMessageRecipientEntry(null)}
                >
                  취소
                </Button>
              </div>
              <div style={{ flex: 1 }}>
                <Button
                  size="large"
                  display="full"
                  color="primary"
                  variant="fill"
                  disabled={!messageText.trim()}
                  onClick={handleSendMessageSubmit}
                >
                  쪽지 보내기
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 가상 토스트 노티파이어 */}
      {toastText && (
        <div className="point-toast" style={{ top: 'auto', bottom: 'calc(var(--tab-h, 64px) + env(safe-area-inset-bottom, 0px) + 10px)', background: 'rgba(18, 18, 20, 0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}>
          {toastText}
        </div>
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

      <div style={{ height: 24 }} />
    </div>
  );
}
