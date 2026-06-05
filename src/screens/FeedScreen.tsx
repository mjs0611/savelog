import React, { useEffect, useState } from 'react';
import { Badge, Button } from '@toss/tds-mobile';
import type { EntryWithReactions } from '../lib/supabase';
import { fetchFeed, toggleReaction } from '../lib/supabase';
import { formatAmount, formatDate, timeAgo, getTodayStr } from '../lib/utils';
import { PERSONAS, getPersona, getNickname, sendCheeringMessage, sendPokeNotification } from '../lib/storage';

interface Props {
  userId: string;
  onEarnPending?: (amount: number) => void;
  onGrantFeedReward?: () => void;
  refreshToken?: number;
}

const MOCK_BALANCE_CARDS = [
  {
    id: 1,
    nickname: '시발비용맨 🦄',
    spent: '스타벅스 시그니처 핫초코',
    amount: 6500,
    emoji: '☕',
    description: '스트레스 잔뜩 받아서 당 충전용으로 벤티 사이즈 주문함 ㅠ'
  },
  {
    id: 2,
    nickname: '자린고비 햄스터 🐹',
    spent: '지각 방지용 카카오 택시',
    amount: 14200,
    emoji: '🚕',
    description: '9시 정각 출근 세이프를 위해 어쩔 수 없이 지른 시발비용...'
  },
  {
    id: 3,
    nickname: '가성비 AI 🤖',
    spent: '삼성 초고속 무선 충전기',
    amount: 28000,
    emoji: '🔌',
    description: '충전 속도 너무 답답해서 지르긴 했는데 이거 과소비일까요?'
  }
];

const COMMENT_CHIPS = ['지갑 지켜! 🛡️', '절약 요정 인정 🧚‍♀️', '시발비용 화이팅 😭', '이건 어쩔 수 없지 ☕'];

export default function FeedScreen({ userId, onEarnPending, onGrantFeedReward, refreshToken = 0 }: Props) {
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

  const [selectedReceiptEntry, setSelectedReceiptEntry] = useState<EntryWithReactions | null>(null);

  // 🎴 짠물 밸런스 게임 상태 (날짜별 localStorage persist — 같은 날 새로고침 시 재투표 방지)
  const [balanceIndex, setBalanceIndex] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('savelog_balance_idx_' + getTodayStr());
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  });
  const [balanceVoted, setBalanceVoted] = useState<'over' | 'ok' | null>(() => {
    try {
      const todayStr = getTodayStr();
      const idxStr = localStorage.getItem('savelog_balance_idx_' + todayStr);
      const idx = idxStr ? parseInt(idxStr, 10) : 0;
      const s = localStorage.getItem(`savelog_balance_voted_${todayStr}_${idx}`);
      return (s === 'over' || s === 'ok') ? s : null;
    } catch { return null; }
  });
  const balanceVotingRef = React.useRef(false);
  const balanceDateRef = React.useRef(getTodayStr());
  const [balanceStats, setBalanceStats] = useState<{ over: number; ok: number } | null>(() => {
    try {
      const todayStr = getTodayStr();
      const idxStr = localStorage.getItem('savelog_balance_idx_' + todayStr);
      const idx = idxStr ? parseInt(idxStr, 10) : 0;
      const voted = localStorage.getItem(`savelog_balance_voted_${todayStr}_${idx}`);
      if (!voted) return null;
      // 투표 시 저장한 stats 우선 로드 (재로드 시 % 수치 일관성 보장)
      const savedStats = localStorage.getItem(`savelog_balance_stats_${todayStr}_${idx}`);
      if (savedStats) {
        const parsed = JSON.parse(savedStats) as { over: number; ok: number };
        if (typeof parsed.over === 'number' && typeof parsed.ok === 'number') return parsed;
      }
      // fallback: hash 기반 결정론적 값
      const hash = (todayStr + idx).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
      const overPct = 65 + Math.abs(hash) % 20;
      return { over: overPct, ok: 100 - overPct };
    } catch { return null; }
  });

  const myPersonaKey = getPersona();

  useEffect(() => {
    // 날짜가 바뀌면 밸런스 게임 상태를 오늘 날짜 기준으로 초기화 (자정 넘어 앱이 열려있을 때 대비)
    const today = getTodayStr();
    if (balanceDateRef.current !== today) {
      balanceDateRef.current = today;
      try {
        const savedIdx = localStorage.getItem('savelog_balance_idx_' + today);
        const newIdx = savedIdx ? parseInt(savedIdx, 10) : 0;
        const votedRaw = localStorage.getItem(`savelog_balance_voted_${today}_${newIdx}`);
        const newVoted = (votedRaw === 'over' || votedRaw === 'ok') ? votedRaw as 'over' | 'ok' : null;
        let newStats: { over: number; ok: number } | null = null;
        if (newVoted) {
          const raw = localStorage.getItem(`savelog_balance_stats_${today}_${newIdx}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as { over: number; ok: number };
              if (typeof parsed.over === 'number' && typeof parsed.ok === 'number') newStats = parsed;
            } catch { /* ignore */ }
          }
        }
        setBalanceIndex(newIdx);
        setBalanceVoted(newVoted);
        setBalanceStats(newStats);
        balanceVotingRef.current = false;
      } catch { /* ignore */ }
    }
    // 최초 로드는 스켈레톤 표시, 이후 refreshToken/userId 변경은 현재 로드 상태에 따라 갱신
    // userId는 anonymousKey 발급 시 변경될 수 있어 my_reaction 정합성을 위해 포함
    load(initialLoaded.current);
  }, [refreshToken, userId]);

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
      if (data.length > 0) {
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
      }
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

      {/* 🎴 짠물 밸런스 게임 (Tinder Swipe Widget) */}
      <div className="glass-card balance-game-card" style={{ margin: '0 0 4px 0', padding: 18, border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
            🎴 짠물 밸런스 게임
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-mute)', fontWeight: 700 }}>
            {balanceIndex < MOCK_BALANCE_CARDS.length ? `${balanceIndex + 1} / ${MOCK_BALANCE_CARDS.length}` : '완료 🏆'}
          </span>
        </div>

        {balanceIndex < MOCK_BALANCE_CARDS.length ? (() => {
          const card = MOCK_BALANCE_CARDS[balanceIndex];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <span style={{ fontSize: 32, marginBottom: 8, animation: 'floating 3s infinite ease-in-out' }}>{card.emoji}</span>
              <h4 style={{ margin: '0 0 4px 0', fontSize: 13, color: '#fff', fontWeight: 800, lineHeight: 1.4 }}>
                {card.nickname}님이 <span style={{ color: '#FF5E62' }}>{card.spent}</span>에 <span style={{ color: '#00F5A0' }}>{formatAmount(card.amount)}</span>을 소비했습니다!
              </h4>
              <p style={{ margin: '8px 0 16px 0', fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.4, background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
                “ {card.description} ”
              </p>

              {balanceVoted ? (
                /* 투표 후 결과 바 */
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', height: 22, borderRadius: 100, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ width: `${balanceStats?.over}%`, background: 'linear-gradient(90deg, #FF5E62, #FF9966)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff', transition: 'width 0.4s ease-out' }}>
                      과소비 {balanceStats?.over}%
                    </div>
                    <div style={{ width: `${balanceStats?.ok}%`, background: 'linear-gradient(90deg, #00F5A0, #00D9F5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#090A10', transition: 'width 0.4s ease-out' }}>
                      합리적 {balanceStats?.ok}%
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const next = balanceIndex + 1;
                      const todayStr = getTodayStr();
                      try { localStorage.setItem('savelog_balance_idx_' + todayStr, String(next)); } catch {}

                      // 다음 카드의 기존 투표 여부를 복원하여 중복 포인트 지급 방지
                      const nextVotedRaw = localStorage.getItem(`savelog_balance_voted_${todayStr}_${next}`);
                      const nextVoted = (nextVotedRaw === 'over' || nextVotedRaw === 'ok') ? nextVotedRaw : null;
                      let nextStats: { over: number; ok: number } | null = null;
                      if (nextVoted) {
                        try {
                          const raw = localStorage.getItem(`savelog_balance_stats_${todayStr}_${next}`);
                          if (raw) {
                            const parsed = JSON.parse(raw) as { over: number; ok: number };
                            if (typeof parsed.over === 'number' && typeof parsed.ok === 'number') nextStats = parsed;
                          }
                        } catch {}
                        if (!nextStats) {
                          const hash = (todayStr + next).split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
                          const overPct = 65 + Math.abs(hash) % 20;
                          nextStats = { over: overPct, ok: 100 - overPct };
                        }
                      }

                      setBalanceIndex(next);
                      setBalanceVoted(nextVoted);
                      setBalanceStats(nextStats);
                      balanceVotingRef.current = nextVoted !== null;
                    }}
                    style={{
                      width: '100%',
                      padding: '12px 0',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    다음 지출 판정하기 →
                  </button>
                </div>
              ) : (
                /* 투표 전 버튼 */
                <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                  <button
                    onClick={(e) => {
                      if (balanceVotingRef.current) return;
                      balanceVotingRef.current = true;
                      const overPct = 65 + Math.floor(Math.random() * 20);
                      const overStats = { over: overPct, ok: 100 - overPct };
                      setBalanceStats(overStats);
                      setBalanceVoted('over');
                      try {
                        localStorage.setItem(`savelog_balance_voted_${getTodayStr()}_${balanceIndex}`, 'over');
                        localStorage.setItem(`savelog_balance_stats_${getTodayStr()}_${balanceIndex}`, JSON.stringify(overStats));
                      } catch {}
                      onEarnPending?.(1);
                      showFeedToast('⚖️ +1원 대기 중 (광고 보고 받기)');

                      // spawn emoji particles
                      const rect = e.currentTarget.getBoundingClientRect();
                      const fakeEvent = {
                        currentTarget: {
                          getBoundingClientRect: () => rect
                        }
                      } as unknown as React.MouseEvent<HTMLButtonElement>;
                      spawnParticles('💸', fakeEvent);
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      borderRadius: 100,
                      border: 'none',
                      background: 'rgba(255, 77, 79, 0.15)',
                      color: '#FF4D4F',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: 'pointer',
                      boxShadow: '0 4px 10px rgba(255, 77, 79, 0.05)',
                      transition: 'all 0.2s'
                    }}
                  >
                    과소비 💸
                  </button>

                  <button
                    onClick={(e) => {
                      if (balanceVotingRef.current) return;
                      balanceVotingRef.current = true;
                      const okPct = 60 + Math.floor(Math.random() * 25);
                      const okStats = { over: 100 - okPct, ok: okPct };
                      setBalanceStats(okStats);
                      setBalanceVoted('ok');
                      try {
                        localStorage.setItem(`savelog_balance_voted_${getTodayStr()}_${balanceIndex}`, 'ok');
                        localStorage.setItem(`savelog_balance_stats_${getTodayStr()}_${balanceIndex}`, JSON.stringify(okStats));
                      } catch {}
                      onEarnPending?.(1);
                      showFeedToast('⚖️ +1원 대기 중 (광고 보고 받기)');

                      // spawn emoji particles
                      const rect = e.currentTarget.getBoundingClientRect();
                      const fakeEvent = {
                        currentTarget: {
                          getBoundingClientRect: () => rect
                        }
                      } as unknown as React.MouseEvent<HTMLButtonElement>;
                      spawnParticles('🌿', fakeEvent);
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      borderRadius: 100,
                      border: 'none',
                      background: 'rgba(0, 245, 160, 0.15)',
                      color: '#00F5A0',
                      fontSize: 12,
                      fontWeight: 900,
                      cursor: 'pointer',
                      boxShadow: '0 4px 10px rgba(0, 245, 160, 0.05)',
                      transition: 'all 0.2s'
                    }}
                  >
                    합리적 🌿
                  </button>
                </div>
              )}
            </div>
          );
        })() : (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <span style={{ fontSize: 28, animation: 'floating 4s infinite ease-in-out', display: 'inline-block' }}>🏆</span>
            <h4 style={{ margin: '8px 0 2px 0', fontSize: 13, color: 'var(--primary)', fontWeight: 900 }}>오늘의 밸런스 완료!</h4>
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-mute)' }}>내일 더 핫한 과소비 의심 영수증이 도착합니다.</p>
          </div>
        )}
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
          {entries.map((entry) => {
            const personaKey = entry.persona || (entry.user_id === userId ? myPersonaKey : null);
            const p = personaKey ? PERSONAS[personaKey] : null;
            
            // 지출 레벨 파악 (0원 무지출 / 5만원 이상 FLEX)
            const isZeroSpend = entry.total_amount === 0;
            const isFlexSpend = entry.total_amount > 50000;
            const cardClass = isZeroSpend
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
                  <div className={`feed-total ${entry.total_amount === 0 ? 'feed-total--zero' : ''}`}>
                    {entry.total_amount === 0 ? '0원 🎉' : formatAmount(entry.total_amount)}
                  </div>
                </div>

                {/* 오늘 한마디 (💬 한마디 특수 항목) */}
                {entry.items.filter(it => it.category === '한마디').map((it, i) => (
                  <p key={i} style={{ margin: '4px 0 8px 0', fontSize: 12, color: 'var(--text-sub)', lineHeight: 1.5, fontStyle: 'italic', paddingLeft: 4, borderLeft: '2px solid var(--primary)' }}>
                    💬 {it.comment}
                  </p>
                ))}

                {/* 지출 항목 */}
                <div className="feed-items">
                  {entry.items.filter(it => it.category !== '한마디').map((item, i) => (
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

                {/* 리액션 버튼 */}
                {entry.user_id !== userId && (
                  <div className="feed-reactions">
                    <button
                      className={`reaction-btn ${entry.my_reaction === 'trust' ? 'reaction-btn--active reaction-btn--trust' : ''}`}
                      onClick={(e) => handleReact(entry, 'trust', e)}
                      disabled={toggling.has(entry.id)}
                    >
                      👃 짠내난다 {entry.trust_count > 0 && <span className="reaction-count">{entry.trust_count}</span>}
                    </button>
                    <button
                      className={`reaction-btn ${entry.my_reaction === 'doubt' ? 'reaction-btn--active reaction-btn--doubt' : ''}`}
                      onClick={(e) => handleReact(entry, 'doubt', e)}
                      disabled={toggling.has(entry.id)}
                    >
                      🤔 진짜야? {entry.doubt_count > 0 && <span className="reaction-count">{entry.doubt_count}</span>}
                    </button>
                    
                    {/* 콕 찌르기 단축 단추 */}
                    <button
                      className="reaction-btn"
                      disabled={pokedEntries.has(entry.id)}
                      onClick={(e) => {
                        if (pokedEntries.has(entry.id)) return;
                        setPokedEntries(prev => {
                          const next = new Set(prev).add(entry.id);
                          try { localStorage.setItem('savelog_poked_entries', JSON.stringify([...next])); } catch {}
                          return next;
                        });
                        spawnParticles('⚡', e);
                        const myName = getNickname() || '나';
                        sendPokeNotification(entry.nickname || '익명', myName, myPersonaKey, isZeroSpend);
                      }}
                      style={{
                        borderColor: pokedEntries.has(entry.id) ? 'rgba(255,255,255,0.08)' : isZeroSpend ? 'rgba(0, 245, 160, 0.2)' : 'rgba(255, 77, 79, 0.2)',
                        background: pokedEntries.has(entry.id) ? 'rgba(255,255,255,0.03)' : isZeroSpend ? 'rgba(0, 245, 160, 0.05)' : 'rgba(255, 77, 79, 0.05)',
                        color: pokedEntries.has(entry.id) ? 'var(--text-mute)' : isZeroSpend ? '#00F5A0' : '#FF4D4F',
                        fontWeight: 800,
                        cursor: pokedEntries.has(entry.id) ? 'default' : 'pointer',
                      }}
                    >
                      {pokedEntries.has(entry.id) ? '콕 찌름 ✓' : isZeroSpend ? '칭찬 ⚡' : '일침 ⚡'}
                    </button>

                    <button
                      className="reaction-btn"
                      onClick={() => setSelectedReceiptEntry(entry)}
                      style={{
                        borderColor: 'rgba(0, 245, 160, 0.08)',
                        background: 'rgba(0, 245, 160, 0.03)',
                        color: '#00F5A0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      🧾 영수증
                    </button>

                    <button
                      className="reaction-btn"
                      onClick={() => {
                        setMessageRecipientEntry(entry);
                        setMessageText('');
                      }}
                      style={{
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        background: 'rgba(255, 255, 255, 0.03)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <img src="/images/icon_mailbox.png" className="custom-icon--sm" />
                      쪽지
                    </button>
                  </div>
                )}

                {/* 신뢰도 경고 */}
                {entry.doubt_count > 0 && entry.doubt_count / (entry.trust_count + entry.doubt_count) > 0.3 && (
                  <div className="doubt-warning">
                    🚨 일부 사용자가 의심하고 있어요 ({Math.round(entry.doubt_count / (entry.trust_count + entry.doubt_count) * 100)}%)
                  </div>
                )}

                {/* 한마디 퀵 코멘트 칩 — 내 게시물에는 표시하지 않음 */}
                {entry.user_id !== userId && (
                  <div className="feed-comment-chips-container">
                    <span className="comment-chips-label">말 한마디:</span>
                    <div className="comment-chips-scroll">
                      {COMMENT_CHIPS.map((cmt) => {
                        const used = (localComments[entry.id] || []).some(
                          (c) => c.sender === '나' && c.text === cmt
                        );
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
                  </div>
                )}

                {/* 한마디 코멘트 목록 */}
                {(localComments[entry.id] || []).length > 0 && (
                  <div className="feed-comments-box">
                    {(localComments[entry.id] || []).map((c, i) => (
                      <div key={i} className="feed-comment-row">
                        <span className="feed-comment-sender">{c.sender}</span>
                        <span className="feed-comment-text">{c.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 🧾 영수증 모달 */}
      {selectedReceiptEntry && (
        <div
          className="story-modal-overlay"
          onClick={() => setSelectedReceiptEntry(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(9, 10, 16, 0.85)',
            backdropFilter: 'blur(12px)',
            zIndex: 4000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20
          }}
        >
          <div
            className="story-modal-sheet glass-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 330, width: '100%', padding: 22, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(10, 11, 16, 0.95)', borderRadius: 20 }}
          >
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, letterSpacing: 4, fontWeight: 900, color: 'var(--primary)', margin: 0 }}>🧾 SAVELOG RECEIPT</h3>
              <p style={{ fontSize: 9, color: 'var(--text-mute)', margin: '4px 0 0 0', textTransform: 'uppercase' }}>Official spend certification</p>
            </div>

            <div
              style={{
                background: '#F8F9FA',
                color: '#1A1A1A',
                fontFamily: '"Courier New", Courier, monospace',
                padding: 18,
                borderRadius: 8,
                fontSize: 10,
                position: 'relative',
                border: '1px solid #E9ECEF',
                boxShadow: 'inset 0 0 10px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #CED4DA', paddingBottom: 6, marginBottom: 8, fontWeight: 800 }}>
                <span>지출 항목</span>
                <span>금액</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                {(selectedReceiptEntry.items || []).filter(it => it.category !== '한마디').map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.emoji} {item.comment || item.category}</span>
                    <span>{formatAmount(item.amount)}</span>
                  </div>
                ))}
                {(!selectedReceiptEntry.items || selectedReceiptEntry.items.filter(it => it.category !== '한마디').length === 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>무지출 챌린지 성공 🌿</span>
                    <span>0원</span>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #CED4DA', paddingTop: 6, fontWeight: 900, fontSize: 12, marginBottom: 12 }}>
                <span>TOTAL SUM</span>
                <span style={{ color: '#059669' }}>{formatAmount(selectedReceiptEntry.total_amount)}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 8 }}>
                <div style={{ display: 'flex', height: 22, width: '80%', background: '#fff', padding: '2px 4px', gap: 1, alignItems: 'stretch' }}>
                  {[2,1,3,1,2,4,1,2,1,3,2,1,4,1,2].map((w, i) => (
                    <div key={i} style={{ flex: w, background: '#000' }} />
                  ))}
                </div>
                <span style={{ fontSize: 7, letterSpacing: 1.5, color: '#868E96' }}>*SVL-{selectedReceiptEntry.id.substring(0, 8).toUpperCase()}*</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedReceiptEntry(null)}
              style={{
                width: '100%',
                marginTop: 18,
                padding: 12,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-sub)',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
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
