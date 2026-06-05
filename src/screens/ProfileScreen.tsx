import React, { useState, useEffect, useRef } from 'react';
import { Badge, Button } from '@toss/tds-mobile';
import { contactsViral } from '@apps-in-toss/web-framework';

function SimpleModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ padding: '24px 20px calc(24px + env(safe-area-inset-bottom, 0))', gap: 16 }}>
        {children}
      </div>
    </div>
  );
}
import type { Entry } from '../lib/supabase';
import { fetchMyWeekEntries } from '../lib/supabase';
import type { StreakData, CheeringMessage } from '../lib/storage';
import { setNickname, getPersona, PERSONAS, getCheeringMessages } from '../lib/storage';
import { formatAmount, formatDate, getWeekKey, timeAgo } from '../lib/utils';

interface Props {
  userId: string;
  nickname: string;
  streak: StreakData;
  onNicknameChange: (name: string) => void;
  onStartTest: () => void;
  refreshToken?: number;
  onShieldEarned?: () => void;
}

export default function ProfileScreen({ userId, nickname, streak, onNicknameChange, onStartTest, refreshToken = 0, onShieldEarned }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nickname);

  // nickname prop이 바뀔 때(저장 완료 후) draft를 동기화
  React.useEffect(() => {
    if (!editing) setDraft(nickname);
  }, [nickname, editing]);
  const [myEntries, setMyEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState(false);
  const [entriesRetry, setEntriesRetry] = useState(0);
  const [messages, setMessages] = useState<CheeringMessage[]>([]);
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearConfirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [marketingModalOpen, setMarketingModalOpen] = useState(false);
  const viralCleanupRef = useRef<(() => void) | null>(null);

  function handleShare() {
    if (viralCleanupRef.current) return;
    try {
      viralCleanupRef.current = contactsViral({
        options: { moduleId: 'f92f08bb-0044-4762-bbdd-25d8458a1a07' },
        onEvent: (event) => {
          if (event.type === 'sendViral') {
            onShieldEarned?.();
          } else if (event.type === 'close') {
            viralCleanupRef.current?.();
            viralCleanupRef.current = null;
          }
        },
        onError: () => {
          viralCleanupRef.current?.();
          viralCleanupRef.current = null;
        },
      });
    } catch {
      viralCleanupRef.current = null;
    }
  }

  useEffect(() => {
    return () => { viralCleanupRef.current?.(); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEntriesLoading(true);
      setEntriesError(false);
      try {
        const data = await fetchMyWeekEntries(userId, getWeekKey());
        if (!cancelled) {
          if (data === null) {
            setEntriesError(true);
          } else {
            setMyEntries(data);
          }
        }
      } finally {
        if (!cancelled) setEntriesLoading(false);
      }
    })();
    setMessages(getCheeringMessages());
    return () => { cancelled = true; };
  }, [userId, refreshToken, entriesRetry]);

  useEffect(() => {
    return () => {
      if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current);
    };
  }, []);

  function saveNickname() {
    if (!draft.trim()) return;
    setNickname(draft.trim());
    onNicknameChange(draft.trim());
    setEditing(false);
  }

  function handleClearAllMessages() {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearConfirmTimerRef.current = setTimeout(() => {
        setClearConfirm(false);
        clearConfirmTimerRef.current = null;
      }, 3000);
      return;
    }
    if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current);
    setClearConfirm(false);
    localStorage.setItem('savelog_user_messages', JSON.stringify([]));
    setMessages([]);
  }

  const weekTotal = myEntries.reduce((s, e) => s + e.total_amount, 0);

  const personaKey = getPersona();
  const p = personaKey ? PERSONAS[personaKey] : null;

  return (
    <div className="screen screen-profile">
      {/* 닉네임 */}
      <div className="glass-card profile-card">
        {editing ? (
          <div className="nickname-edit">
            <input
              className="nickname-input"
              value={draft}
              maxLength={12}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveNickname()}
              autoFocus
            />
            <Button size="small" color="primary" variant="fill" onClick={saveNickname} disabled={!draft.trim()}>저장</Button>
            <Button size="small" color="dark" variant="weak" onClick={() => { setDraft(nickname); setEditing(false); }}>취소</Button>
          </div>
        ) : (
          <div className="profile-nickname-row">
            <div>
              <p className="profile-nickname">{nickname}</p>
              <p className="profile-sub">나의 짠물 프로필</p>
            </div>
            <button className="nickname-edit-btn" onClick={() => setEditing(true)}>수정</button>
          </div>
        )}
      </div>

      {/* 소비 성향 배너 */}
      {p ? (
        <div className="profile-persona-banner" onClick={onStartTest}>
          <div className="profile-persona-left">
            <span className="profile-persona-emoji">
              <img src={p.icon} alt="" className="custom-icon--lg" style={{ verticalAlign: 'middle', width: 36, height: 36, objectFit: 'contain' }} />
            </span>
            <div className="profile-persona-info">
              <span className="profile-persona-name" style={{ color: p.color }}>{p.name}</span>
              <span className="profile-persona-label">나의 소비 성향 배지</span>
            </div>
          </div>
          <span className="profile-persona-btn">다시 분석</span>
        </div>
      ) : (
        <div className="profile-persona-banner profile-persona-banner--empty" onClick={onStartTest}>
          <span className="profile-persona-emoji">
            <img src="/images/savelog_main_character.png" className="custom-icon--lg" style={{ verticalAlign: 'middle' }} />
          </span>
          <div className="profile-persona-info">
            <span className="profile-persona-name">나의 소비 성향(MBTI)은?</span>
            <span className="profile-persona-label">4가지 문항으로 소비 성향 분석하기</span>
          </div>
          <span className="profile-persona-btn">시작하기</span>
        </div>
      )}

      {/* 🛡️ 친구 공유하고 스트릭 보호권 받기 */}
      <div
        className="glass-card"
        style={{ padding: '14px 16px', border: '1px solid rgba(99,179,237,0.25)', background: 'linear-gradient(135deg, rgba(99,179,237,0.06) 0%, rgba(255,255,255,0.01) 100%)', cursor: 'pointer' }}
        onClick={handleShare}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🛡️</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#63B3ED' }}>친구에게 공유하고 보호권 받기</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.4 }}>
                하루 기록을 빠뜨려도 스트릭이 끊기지 않아요
              </p>
            </div>
          </div>
          <span style={{ fontSize: 20, color: '#63B3ED', fontWeight: 900 }}>›</span>
        </div>
      </div>

      {/* 📊 소비 성향 육각형 레이더 차트 Widget */}
      {(() => {
        // 스탯 연산
        const selfControl = Math.max(30, Math.min(100, 100 - Math.floor(weekTotal / 5000)));
        const savings = Math.max(40, Math.min(100, 40 + streak.streak * 10));
        const zeroDays = myEntries.filter(e => e.total_amount === 0).length;
        const survival = Math.max(35, Math.min(100, 35 + zeroDays * 20));
        const social = Math.max(50, Math.min(100, 50 + messages.length * 10));
        const salty = personaKey === 'hamster' ? 95 : personaKey === 'keeper' ? 80 : personaKey === 'cost_ai' ? 90 : 60;

        const scores = [selfControl, savings, survival, social, salty];

        const getPoint = (score: number, idx: number, maxRadius = 64) => {
          const angle = (Math.PI * 2 / 5) * idx - Math.PI / 2;
          const r = (score / 100) * maxRadius;
          const x = 100 + r * Math.cos(angle);
          const y = 92 + r * Math.sin(angle);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        };

        const myPoints = [0, 1, 2, 3, 4].map(i => getPoint(scores[i], i)).join(' ');

        // 가이드 격자 레이어
        const gridPoints = [0.2, 0.4, 0.6, 0.8, 1.0].map((ratio) => {
          return [0, 1, 2, 3, 4].map(i => getPoint(100 * ratio, i)).join(' ');
        });

        const labels = [
          { name: '자제력', x: 100, y: 15, align: 'middle' },
          { name: '절약력', x: 176, y: 72, align: 'start' },
          { name: '생존력', x: 148, y: 168, align: 'start' },
          { name: '사교력', x: 52, y: 168, align: 'end' },
          { name: '짠내력', x: 24, y: 72, align: 'end' }
        ] as const;

        return (
          <div className="glass-card radar-chart-card" style={{ padding: 18, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-main)' }}>소비 오각형 스탯 📊</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
              <svg width="200" height="184" style={{ overflow: 'visible' }}>
                {/* 1. Concentric Pentagonal Grid */}
                {gridPoints.map((pts, idx) => (
                  <polygon
                    key={idx}
                    points={pts}
                    fill="none"
                    stroke="rgba(255,255,255,0.05)"
                    strokeWidth="0.8"
                  />
                ))}

                {/* 2. Concentric Grid Labels */}
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((ratio, idx) => {
                  const pt = getPoint(100 * ratio, 0);
                  const [x, y] = pt.split(',').map(Number);
                  return (
                    <text
                      key={idx}
                      x={x + 4}
                      y={y + 3}
                      fill="rgba(255,255,255,0.18)"
                      fontSize="7"
                      fontWeight="900"
                    >
                      {ratio * 100}
                    </text>
                  );
                })}

                {/* 3. Radial Axis Lines */}
                {[0, 1, 2, 3, 4].map((i) => {
                  const pt = getPoint(100, i);
                  return (
                    <line
                      key={i}
                      x1="100"
                      y1="92"
                      x2={pt.split(',')[0]}
                      y2={pt.split(',')[1]}
                      stroke="rgba(255,255,255,0.04)"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* 4. My Polygon */}
                <polygon
                  points={myPoints}
                  fill="rgba(168, 85, 247, 0.28)"
                  stroke="#A855F7"
                  strokeWidth="2"
                  style={{ filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))', transition: 'all 0.5s' }}
                />

                {/* 6. Label Text Nodes */}
                {labels.map((lbl, i) => (
                  <text
                    key={i}
                    x={lbl.x}
                    y={lbl.y}
                    fill="#fff"
                    fontSize="10"
                    fontWeight="900"
                    textAnchor={lbl.align}
                    style={{ fill: i === 4 && p ? p.color : i === 0 ? '#FF5E62' : 'var(--text-sub)' }}
                  >
                    {lbl.name}
                  </text>
                ))}
              </svg>
            </div>
          </div>
        );
      })()}

      {/* 내 쪽지함 📬 */}
      <div className="glass-card mailbox-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <p style={{ fontSize: 15, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}>
            내 쪽지함
            <img src="/images/icon_mailbox.png" className="custom-icon" />
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {messages.length > 0 && (
              <>
                <button
                  onClick={handleClearAllMessages}
                  style={{
                    border: 'none',
                    background: clearConfirm ? 'rgba(255,77,79,0.15)' : 'rgba(255,255,255,0.06)',
                    color: clearConfirm ? '#FF4D4F' : 'var(--text-mute)',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 100,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {clearConfirm ? '한 번 더 탭하면 삭제' : '전체 삭제'}
                </button>
                <Badge size="small" color="blue" variant="weak">{messages.length}개</Badge>
              </>
            )}
          </div>
        </div>
        
        {messages.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-mute)', textAlign: 'center', padding: '10px 0' }}>
            응원 쪽지 내역이 없어요.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((msg) => {
              const isSent = msg.senderNickname === nickname;
              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    padding: 12,
                    background: isSent ? 'rgba(255, 255, 255, 0.01)' : 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${isSent ? 'rgba(255,255,255,0.04)' : 'rgba(255, 255, 255, 0.05)'}`,
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {!isSent && (
                        <span
                          style={{
                            fontSize: 12,
                            background: `${msg.senderPersonaColor || '#00F5A0'}15`,
                            color: msg.senderPersonaColor || '#00F5A0',
                            padding: '2px 6px',
                            borderRadius: 100,
                            fontWeight: 700
                          }}
                        >
                          {msg.senderPersonaEmoji || '🐷'} {msg.senderNickname}
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: 'var(--text-mute)' }}>
                        {isSent ? `✉️ ${msg.recipientNickname || '상대방'}님에게 보낸 쪽지` : '받은 응원'}
                      </span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-mute)' }}>{msg.created_at ? timeAgo(msg.created_at) : msg.timestamp}</span>
                  </div>
                  <p style={{ fontSize: 12, color: isSent ? 'var(--text-mute)' : 'var(--text-sub)', lineHeight: 1.4 }}>
                    {msg.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 이번 주 기록 */}
      <div className="glass-card week-entries-card">
        <div className="week-entries-header">
          <p className="week-entries-title">이번 주 내 기록</p>
          {myEntries.length > 0 && (
            <Badge size="small" color="blue" variant="weak">총 {formatAmount(weekTotal)}</Badge>
          )}
        </div>

        {entriesLoading ? (
          <p className="week-entries-empty" style={{ color: 'var(--text-mute)' }}>불러오는 중...</p>
        ) : entriesError ? (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <p className="week-entries-empty" style={{ color: '#FF4D4F', marginBottom: 8 }}>기록을 불러오지 못했어요</p>
            <button
              onClick={() => setEntriesRetry((n) => n + 1)}
              style={{ fontSize: 12, color: 'var(--text-sub)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 16px', cursor: 'pointer' }}
            >
              다시 시도
            </button>
          </div>
        ) : myEntries.length === 0 ? (
          <p className="week-entries-empty">아직 기록이 없어요</p>
        ) : (
          <div className="week-entries-list">
            {myEntries.map((entry) => (
              <div key={entry.id} className="week-entry-row">
                <span className="week-entry-date">{formatDate(entry.date)}</span>
                <div className="week-entry-items">
                  {entry.items.filter(it => it.category !== '한마디').map((item, i) => (
                    <span key={i} className="week-entry-item-chip">
                      {item.emoji} {item.category}
                    </span>
                  ))}
                </div>
                <span className={`week-entry-amount ${entry.total_amount === 0 ? 'week-entry-amount--zero' : ''}`}>
                  {formatAmount(entry.total_amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 포인트 획득 방법 */}
      <div className="glass-card how-to-card">
        <p className="how-to-title">포인트 획득 방법</p>
        <div className="how-to-rows">
          <div className="how-to-row"><span>📝 매일 기록</span><span style={{color:'var(--text-mute)',fontSize:10}}>+3원 대기</span></div>
          <div className="how-to-row"><span>🔥 7일 연속 완주</span><span style={{color:'var(--text-mute)',fontSize:10}}>+20원 대기</span></div>
          <div className="how-to-row"><span style={{fontSize:11,color:'var(--text-mute)',marginLeft:8}}>└ 광고 시청 후 토스포인트 지급</span><span></span></div>
          <div className="how-to-row"><span>❤️ 게시글 반응하기</span><span>+1원</span></div>
          <div className="how-to-row"><span>🥇 주간 1위 (3일↑)</span><span style={{color:'var(--text-mute)',fontSize:10}}>광고 후 +50원</span></div>
          <div className="how-to-row"><span>📊 상위 10% (3일↑)</span><span style={{color:'var(--text-mute)',fontSize:10}}>광고 후 +30원</span></div>
        </div>
      </div>

      {/* ⚙️ 약관 및 마케팅 설정 */}
      <div className="glass-card setting-menu-card">
        <div
          className="setting-menu-item"
          onClick={() => {
            localStorage.removeItem('savelog_tutorial_completed');
            window.location.reload();
          }}
        >
          <span style={{ color: 'var(--primary)', fontWeight: 800 }}>🎓 가이드 튜토리얼 다시 보기</span>
          <span className="setting-arrow" style={{ color: 'var(--primary)' }}>›</span>
        </div>
        <div className="setting-menu-item" onClick={() => setTermsModalOpen(true)}>
          <span>서비스 이용약관</span>
          <span className="setting-arrow">›</span>
        </div>
        <div className="setting-menu-item" onClick={() => setMarketingModalOpen(true)}>
          <span>마케팅 정보 수신 동의</span>
          <span className="setting-arrow">›</span>
        </div>
      </div>

      <div style={{ height: 24 }} />

      {/* 서비스 이용약관 모달 */}
      <SimpleModal open={termsModalOpen} onClose={() => setTermsModalOpen(false)}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>서비스 이용약관</h3>
          <p style={{ fontSize: 11, color: 'var(--text-mute)' }}>세이브로그 서비스 이용 동의서</p>
        </div>
        <div className="terms-content-box">
          <h4>제 1 조 (목적)</h4>
          <p>본 약관은 "세이브로그"(이하 "회사"라 함)가 제공하는 제반 서비스의 이용조건 및 절차, 회원과 회사 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
          <h4>제 2 조 (용어의 정의)</h4>
          <p>1. "서비스"라 함은 이용자가 모바일 기기를 통해 소비 내역을 기록하고, 짠물 미션 및 피드 기능을 제공받는 서비스를 말합니다.<br/>2. "토스포인트"라 함은 서비스 내 미션이나 활동 수행 시 토스 플랫폼을 통해 지급되는 포인트를 의미합니다.</p>
          <h4>제 3 조 (리워드)</h4>
          <p>회사는 서비스 활성화를 위해 기록 및 미션 달성 보상으로 토스포인트를 적립해 드리며, 적립 조건은 회사 내부 정책에 따릅니다.</p>
        </div>
        <Button display="full" size="large" color="primary" variant="fill" onClick={() => setTermsModalOpen(false)}>확인</Button>
      </SimpleModal>

      {/* 마케팅 수신동의 모달 */}
      <SimpleModal open={marketingModalOpen} onClose={() => setMarketingModalOpen(false)}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>마케팅 정보 수신 동의</h3>
          <p style={{ fontSize: 11, color: 'var(--text-mute)' }}>혜택 알림 및 이벤트 정보 안내</p>
        </div>
        <div className="terms-content-box">
          <h4>1. 개인정보 수집 및 이용 목적</h4>
          <p>서비스 내 신규 미션, 주간 챌린지 혜택, 이벤트 정보 등 맞춤 안내를 제공하기 위해 활용합니다.</p>
          <h4>2. 수집하는 개인정보 항목</h4>
          <p>닉네임, 기기 고유 식별값 및 마케팅 광고 식별값</p>
          <h4>3. 보유 및 이용 기간</h4>
          <p>동의 철회 시 또는 회원 탈퇴 시까지 보유 및 이용하며, 거부 시에도 서비스 기본 기능은 정상 이용 가능합니다.</p>
        </div>
        <Button display="full" size="large" color="primary" variant="fill" onClick={() => setMarketingModalOpen(false)}>동의 완료</Button>
      </SimpleModal>
    </div>
  );
}
