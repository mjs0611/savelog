import React, { useEffect, useState } from 'react';
import { Badge, Button } from '@toss/tds-mobile';
import type { EntryWithReactions } from '../lib/supabase';
import { fetchFeed, toggleReaction } from '../lib/supabase';
import { formatAmount, formatDate, timeAgo } from '../lib/utils';
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
const STORY_EMOJI_REACTIONS = ['❤️', '👏', '🔥', '😮', '😢', '💸', '👑'];

const MOCK_STORIES = [
  { id: '1', name: '자린고비', icon: '/images/mbti_hamster.png', color: '#FF9500', spent: '0원', text: '점심 동료가 사줌 개이득!', recorded: true },
  { id: '2', name: '가성비킹', icon: '/images/mbti_robot.png', color: '#00F5A0', spent: '4,500원', text: '편의점 학식 정식 얌얌', recorded: true },
  { id: '3', name: '장바요정', icon: '/images/mbti_cart.png', color: '#3182F6', spent: '0원', text: '오늘도 지름신 참았다', recorded: false },
  { id: '4', name: '시발비용맨', icon: '/images/icon_flame.png', color: '#FF4D4F', spent: '12,500원', text: '부장님 땜에 매운 떡볶이 흡입 ㅠ', recorded: true },
  { id: '5', name: '탕진러', icon: '/images/mbti_unicorn.png', color: '#E0A0FF', spent: '148,000원', text: '헤어샵에서 플렉스했어용', recorded: false },
];

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
  const [selectedStory, setSelectedStory] = useState<typeof MOCK_STORIES[number] | null>(null);
  
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

  // ⚡ 인스타그램 감성 특화 상태 추가
  const [risingHearts, setRisingHearts] = useState<{ id: number; emoji: string; left: number }[]>([]);
  const [selectedReceiptEntry, setSelectedReceiptEntry] = useState<EntryWithReactions | null>(null);
  const [instagramShareMockup, setInstagramShareMockup] = useState(false);

  // 🎴 짠물 밸런스 게임 상태
  const [balanceIndex, setBalanceIndex] = useState(0);
  const [balanceVoted, setBalanceVoted] = useState<'over' | 'ok' | null>(null);
  const balanceVotingRef = React.useRef(false);
  const [balanceStats, setBalanceStats] = useState<{ over: number; ok: number } | null>(null);

  const myPersonaKey = getPersona();

  useEffect(() => {
    // 최초 로드는 스켈레톤 표시, 이후 refreshToken 변경은 조용히 갱신
    load(initialLoaded.current);
  }, [refreshToken]);

  async function load(silent = false) {
    const loadId = ++loadIdRef.current;
    if (!silent) setLoading(true);
    try {
      const data = await fetchFeed(userId);
      if (loadId !== loadIdRef.current) return; // 더 최신 요청이 진행 중 → 결과 버림
      if (data === null) {
        if (!silent) setLoadFailed(true);
        return; // 네트워크 오류 — 기존 피드 그대로 유지
      }
      setLoadFailed(false);
      setEntries(data);

      // 현재 피드에 없는 엔트리의 댓글을 localStorage에서 정리
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
      }
    } catch {
      if (loadId !== loadIdRef.current) return;
      if (!silent) setLoadFailed(true);
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

  function handleAddRisingHeart(emoji: string) {
    const id = Date.now() + Math.random();
    const left = 20 + Math.random() * 60; // 20% to 80% from left
    setRisingHearts((prev) => [...prev, { id, emoji, left }]);
    setTimeout(() => {
      setRisingHearts((prev) => prev.filter((h) => h.id !== id));
    }, 2000);
  }

  async function handleReact(entry: EntryWithReactions, type: 'trust' | 'doubt', e: React.MouseEvent<HTMLButtonElement>) {
    if (entry.user_id === userId) return;
    if (togglingRef.current.has(entry.id)) return;
    togglingRef.current.add(entry.id);
    setToggling(prev => new Set(prev).add(entry.id));

    // 반응이 없는 상태에서 처음 추가할 때만 포인트 지급 (타입 전환 시 중복 지급 방지)
    const isAdding = entry.my_reaction === null;
    if (isAdding) {
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
        <button className="refresh-btn" onClick={() => load(false)}>↻</button>
      </div>

      {/* 인스타그램 스토리 스타일 영역 */}
      <div className="feed-stories-container">
        {MOCK_STORIES.map((s) => (
          <div key={s.id} className="story-avatar-wrap" onClick={() => s.recorded && setSelectedStory(s)} style={{ opacity: s.recorded ? 1 : 0.4 }}>
            <div className="story-ring" style={s.recorded ? { borderImage: `linear-gradient(45deg, ${s.color}, #000) 1` } : { border: '2px solid rgba(255,255,255,0.15)' }}>
              <div className="story-circle">
                <img src={s.icon} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
              </div>
            </div>
            <span className="story-name" style={{ color: s.recorded ? 'var(--text-sub)' : 'var(--text-mute)' }}>
              {s.recorded ? s.name : `${s.name} 👀`}
            </span>
          </div>
        ))}
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
                      setBalanceIndex(prev => prev + 1);
                      setBalanceVoted(null);
                      setBalanceStats(null);
                      balanceVotingRef.current = false;
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
                      setBalanceStats({ over: overPct, ok: 100 - overPct });
                      setBalanceVoted('over');
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
                      setBalanceStats({ over: 100 - okPct, ok: okPct });
                      setBalanceVoted('ok');
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

                {/* 지출 항목 */}
                <div className="feed-items">
                  {entry.items.map((item, i) => (
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
                      onClick={() => {
                        setSelectedReceiptEntry(entry);
                        setInstagramShareMockup(false);
                      }}
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
                      {COMMENT_CHIPS.map((cmt) => (
                        <button
                          key={cmt}
                          className="comment-chip-btn"
                          onClick={() => addComment(entry.id, cmt)}
                        >
                          {cmt}
                        </button>
                      ))}
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

      {/* 스토리 디테일 팝업 (인스타그램 라이브 스타일 오버레이) */}
      {selectedStory && (
        <div
          className="story-modal-overlay"
          onClick={() => setSelectedStory(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: '#090A10',
            zIndex: 5000,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            overflow: 'hidden'
          }}
        >
          {/* 상단 프로그레스 바 */}
          <div style={{ display: 'flex', gap: 4, padding: '12px 16px 4px 16px', zIndex: 10 }}>
            <div style={{ flex: 1, height: 2, background: 'var(--primary)', borderRadius: 100 }} />
            <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.2)', borderRadius: 100 }} />
            <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.2)', borderRadius: 100 }} />
          </div>

          {/* 상단 프로필 영역 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.05)', borderRadius: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${selectedStory.color}` }}>
                <img src={selectedStory.icon} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#fff' }}>{selectedStory.name}</h4>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>오늘 지출: {selectedStory.spent}</span>
              </div>
            </div>
            <button
              onClick={() => setSelectedStory(null)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', width: 28, height: 28, borderRadius: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ×
            </button>
          </div>

          {/* 실시간 이모지 비구름 (Canvas 대체 Rising Hearts) */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 80, overflow: 'hidden', pointerEvents: 'none', zIndex: 5 }}>
            {risingHearts.map((heart) => (
              <span
                key={heart.id}
                className="rising-heart"
                style={{ left: `${heart.left}%` }}
              >
                {heart.emoji}
              </span>
            ))}
          </div>

          {/* 메인 스토리 이미지 & 한마디 내용 */}
          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 24, zIndex: 6 }}>
            <div style={{ width: 140, height: 140, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 28, boxShadow: `0 0 35px ${selectedStory.color}15`, animation: 'floating 4s infinite ease-in-out' }}>
              <img src={selectedStory.icon} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
            </div>
            <p style={{ fontSize: 21, fontWeight: 900, color: '#fff', margin: 0, lineHeight: 1.6, padding: '0 20px', textAlign: 'center', textShadow: '0 2px 10px rgba(0,0,0,0.6)' }}>
              “ {selectedStory.text} ”
            </p>
          </div>

          {/* 하단 리액션 전송 바 (인스타그램 스타일) */}
          <div style={{ padding: '16px 16px 36px 16px', background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 100%)', display: 'flex', flexDirection: 'column', gap: 12, zIndex: 10 }}>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {STORY_EMOJI_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddRisingHeart(emoji);
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: 'none',
                    borderRadius: 100,
                    minWidth: 40,
                    height: 40,
                    fontSize: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'transform 0.1s'
                  }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.9)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🧾 인스타그램 특화 감성 영수증 & 스토리 공유 모달 */}
      {selectedReceiptEntry && (
        <div
          className="story-modal-overlay"
          onClick={() => { setSelectedReceiptEntry(null); setInstagramShareMockup(false); }}
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
          {instagramShareMockup ? (
            /* 📸 인스타그램 스토리 업로드 피드백 모의 화면 */
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 340,
                height: 580,
                background: 'linear-gradient(180deg, #E1306C 0%, #C13584 50%, #833AB4 100%)',
                borderRadius: 24,
                border: '4px solid #fff',
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '24px 20px',
                overflow: 'hidden'
              }}
            >
              {/* 인스타 스토리 상단바 */}
              <div style={{ position: 'absolute', top: 12, left: 16, right: 16, display: 'flex', gap: 3, zIndex: 10 }}>
                <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.8)', borderRadius: 100 }} />
                <div style={{ flex: 1, height: 2, background: 'rgba(255,255,255,0.3)', borderRadius: 100 }} />
              </div>

              {/* 인스타 유저 상단바 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, zIndex: 10 }}>
                <div style={{ width: 28, height: 28, background: 'rgba(255,255,255,0.2)', borderRadius: 100, border: '1px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 11 }}>🐷</span>
                </div>
                <div>
                  <h5 style={{ margin: 0, fontSize: 11, fontWeight: 900, color: '#fff' }}>내 인스타 스토리 스티커</h5>
                  <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>방금 전 • Instagram Story</span>
                </div>
              </div>

              {/* 중앙에 비스듬히 배치된 힙스터 유리 영수증 */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  color: '#111',
                  borderRadius: 16,
                  padding: 20,
                  transform: 'rotate(-4deg) scale(0.92)',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
                  fontFamily: '"Courier New", Courier, monospace',
                  fontSize: 10,
                  border: '1px solid rgba(255,255,255,0.5)',
                  zIndex: 8
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0, fontSize: 12, letterSpacing: 2, fontWeight: 900, color: '#00F5A0', textShadow: '0 0 1px #000' }}>🧾 SAVELOG PROOF</h4>
                  <span style={{ fontSize: 7, color: '#666' }}>OFFICIAL SAVINGS CERTIFICATE</span>
                </div>

                <div style={{ borderBottom: '1px dashed #999', paddingBottom: 6, marginBottom: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
                  <span>지출 내역</span>
                  <span>금액</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {(selectedReceiptEntry.items || []).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{item.emoji} {item.comment || item.category}</span>
                      <span>{formatAmount(item.amount)}</span>
                    </div>
                  ))}
                  {(!selectedReceiptEntry.items || selectedReceiptEntry.items.length === 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>무지출 데이 🌿</span>
                      <span>0원</span>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px dashed #999', paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: 11, marginBottom: 10 }}>
                  <span>TOTAL SAVED</span>
                  <span style={{ color: '#E1306C' }}>{formatAmount(selectedReceiptEntry.total_amount)}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ display: 'flex', height: 18, width: '70%', background: '#fff', gap: 1, alignItems: 'stretch' }}>
                    {[1,3,1,2,4,1,2,1,3,2,1].map((w, i) => (
                      <div key={i} style={{ flex: w, background: '#000' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 7, color: '#777' }}>*SVL-STORY-SHARE*</span>
                </div>
              </div>

              {/* 하단 스토리 업로드 버튼 & 제어 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, zIndex: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
                  <p style={{ fontSize: 11, fontWeight: 800, color: '#fff', margin: 0 }}>
                    ✨ 스토리에 절약 영수증 공유 준비 완료!
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => setInstagramShareMockup(false)}
                    style={{ flex: 1, padding: 12, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', borderRadius: 100, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}
                  >
                    ← 뒤로
                  </button>
                  <button
                    onClick={() => {
                      setSelectedReceiptEntry(null);
                      setInstagramShareMockup(false);
                    }}
                    style={{ flex: 2, padding: 12, background: '#fff', border: 'none', color: '#C13584', borderRadius: 100, fontSize: 11, fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    🚀 스토리 공유하기
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* 🧾 짠내 감성 핀테크 영수증 뷰 */
            <div
              className="story-modal-sheet glass-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 330, width: '100%', padding: 22, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(10, 11, 16, 0.95)', borderRadius: 20 }}
            >
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 13, letterSpacing: 4, fontWeight: 900, color: 'var(--primary)', margin: 0 }}>🧾 SAVELOG RECEIPT</h3>
                <p style={{ fontSize: 9, color: 'var(--text-mute)', margin: '4px 0 0 0', textTransform: 'uppercase' }}>Official spend certification</p>
              </div>

              {/* 영수증 종이 룩앤필 */}
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
                  {(selectedReceiptEntry.items || []).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{item.emoji} {item.comment || item.category}</span>
                      <span>{formatAmount(item.amount)}</span>
                    </div>
                  ))}
                  {(!selectedReceiptEntry.items || selectedReceiptEntry.items.length === 0) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>무지출 챌린지 성공 🌿</span>
                      <span>0원</span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #CED4DA', paddingTop: 6, fontWeight: 900, fontSize: 12, marginBottom: 12 }}>
                  <span>TOTAL SUM</span>
                  <span style={{ color: 'var(--primary)' }}>{formatAmount(selectedReceiptEntry.total_amount)}</span>
                </div>

                {/* 바코드 목업 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, marginTop: 8 }}>
                  <div style={{ display: 'flex', height: 22, width: '80%', background: '#fff', padding: '2px 4px', gap: 1, alignItems: 'stretch' }}>
                    {[2,1,3,1,2,4,1,2,1,3,2,1,4,1,2].map((w, i) => (
                      <div key={i} style={{ flex: w, background: '#000' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 7, letterSpacing: 1.5, color: '#868E96' }}>*SVL-{selectedReceiptEntry.id.substring(0, 8).toUpperCase()}*</span>
                </div>
              </div>

              {/* 영수증 제어 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
                <button
                  onClick={() => setInstagramShareMockup(true)}
                  style={{
                    width: '100%',
                    padding: 12,
                    background: 'linear-gradient(135deg, #FF5E62 0%, #FF9966 100%)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 4px 15px rgba(255, 94, 98, 0.25)',
                    transition: 'transform 0.2s'
                  }}
                  onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.97)'}
                  onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                  📸 인스타 스토리 공유하기
                </button>
                
                <button
                  onClick={() => { setSelectedReceiptEntry(null); setInstagramShareMockup(false); }}
                  style={{
                    width: '100%',
                    padding: 12,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-sub)',
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                >
                  닫기
                </button>
              </div>
            </div>
          )}
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
            
            <div className="story-modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
              <Button
                size="large"
                color="dark"
                variant="weak"
                onClick={() => setMessageRecipientEntry(null)}
                style={{ flex: 1 }}
              >
                취소
              </Button>
              <Button
                size="large"
                color="primary"
                variant="fill"
                disabled={!messageText.trim()}
                onClick={handleSendMessageSubmit}
                style={{ flex: 1 }}
              >
                쪽지 보내기
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 가상 토스트 노티파이어 */}
      {toastText && (
        <div className="point-toast" style={{ top: 'auto', bottom: 90, background: 'rgba(18, 18, 20, 0.9)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}>
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
