import { useState } from 'react';
import { Badge, Button } from '@toss/tds-mobile';
import type { DailyState, StreakData } from '../lib/storage';
import { getDailyMission, getNickname, getPersona, PERSONAS, sendPokeNotification } from '../lib/storage';
import { formatAmount, formatWeekRange, getWeekKey } from '../lib/utils';
import type { WeekRankRow } from '../lib/supabase';


interface Props {
  daily: DailyState;
  streak: StreakData;
  weekRank: WeekRankRow[];
  userId: string;
  pendingPoints: number;
  submitting?: boolean;
  pendingClaiming?: boolean;
  onRecord: () => void;
  onQuickZeroSpend: () => void;
  onClaimPending: () => void;
}

const WEEK_DAYS = 7;

function getCompatibilityScore(userPersona: string, myPersona: string) {
  if (!userPersona || !myPersona) return 72;
  const hash = (userPersona.charCodeAt(0) + myPersona.charCodeAt(0)) % 29;
  return 72 + hash;
}

const MOCK_ONLINE_USERS = [
  { id: 'user-1', nickname: '시발비용맨', spentAmount: 12500, personaKey: 'flexer', isOnline: true, hasPoked: false },
  { id: 'user-2', nickname: '자린고비 햄스터', spentAmount: 0, personaKey: 'hamster', isOnline: true, hasPoked: false },
  { id: 'user-3', nickname: '가성비 AI', spentAmount: 4500, personaKey: 'cost_ai', isOnline: false, hasPoked: false },
  { id: 'user-4', nickname: '장바구니 키퍼', spentAmount: 0, personaKey: 'keeper', isOnline: true, hasPoked: false }
];

export default function HomeScreen({ daily, streak, weekRank, userId, pendingPoints, submitting = false, pendingClaiming = false, onRecord, onQuickZeroSpend, onClaimPending }: Props) {
  const weekKey = getWeekKey();
  const weekRangeStr = formatWeekRange(weekKey);
  const myRank = weekRank.findIndex((r) => r.user_id === userId);
  const myRow = weekRank.find((r) => r.user_id === userId);

  const [onlineUsers, setOnlineUsers] = useState(MOCK_ONLINE_USERS);
  const [selectedAffinityUser, setSelectedAffinityUser] = useState<typeof MOCK_ONLINE_USERS[number] | null>(null);

  const [tutorialStep, setTutorialStep] = useState<number | null>(() => {
    try {
      const completed = localStorage.getItem('savelog_tutorial_completed');
      return completed === 'true' ? null : 1;
    } catch {
      return null;
    }
  });

  const doneCount = daily.recorded
    ? (streak.streak > 0 && streak.streak % WEEK_DAYS === 0 ? WEEK_DAYS : streak.streak % WEEK_DAYS)
    : (streak.streak % WEEK_DAYS);

  function handlePokeUser(id: string, targetNickname: string, isPraise: boolean) {
    setOnlineUsers(prev => prev.map(u => u.id === id ? { ...u, hasPoked: true } : u));
    const myName = getNickname() || '나';
    const myPersona = getPersona();
    sendPokeNotification(targetNickname, myName, myPersona, isPraise);
  }

  return (
    <div className="screen screen-home">
      {/* 헤더 */}
      <div className="home-header-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 className="home-logo-title" style={{ fontSize: 21, fontWeight: 900, background: 'linear-gradient(90deg, #00F5A0, #00D2FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, letterSpacing: '-0.5px' }}>세이브로그</h1>
          <p className="home-week-range" style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-mute)', fontWeight: 700 }}>{weekRangeStr}</p>
        </div>
      </div>

      {/* ✍️ 핵심 소비/무지출 기록 콘솔 (최상단 전면 배치) */}
      <div className="glass-card primary-record-card" id="tutorial-step-1" style={{ padding: 14, border: '1.5px solid var(--primary)', background: 'linear-gradient(135deg, rgba(0, 245, 160, 0.04) 0%, rgba(255,255,255,0.01) 100%)', boxShadow: '0 8px 24px rgba(0, 245, 160, 0.05)' }}>
        {daily.recorded ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🌿</span>
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: 'var(--primary)' }}>오늘의 짠내 기록 완료! 🎉</p>
              <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'var(--text-mute)', lineHeight: 1.3 }}>
                {daily.spentAmount === 0 ? '무지출 달성으로 완벽하게 지갑을 철통 방어했습니다!' : `오늘 ${formatAmount(daily.spentAmount ?? 0)} 지출 기록이 피드에 공유되었습니다.`}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <img src="/images/savelog_main_character.png" className="custom-icon--lg" style={{ animation: 'floating 4s infinite ease-in-out' }} />
              <div>
                <h4 style={{ margin: 0, fontSize: 13, fontWeight: 900, color: '#fff' }}>오늘 짠내 나는 저축 일기 쓰기 ✍️</h4>
                <p style={{ margin: '1px 0 0 0', fontSize: 10, color: 'var(--text-mute)' }}>매일 기록하면 짠물 온도 상승 & 토스포인트 적립!</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={onQuickZeroSpend}
                disabled={submitting}
                style={{
                  flex: 1.2,
                  padding: '12px 0',
                  borderRadius: 12,
                  border: 'none',
                  background: submitting ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #00F5A0 0%, #00D9F5 100%)',
                  color: submitting ? 'var(--text-mute)' : '#090A10',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: submitting ? 'default' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  boxShadow: submitting ? 'none' : '0 4px 15px rgba(0, 245, 160, 0.25)',
                  transition: 'all 0.2s'
                }}
              >
                {submitting ? '저장 중...' : '🌿 오늘 무지출 완료'}
              </button>

              <button
                onClick={onRecord}
                disabled={submitting}
                style={{
                  flex: 0.8,
                  padding: '12px 0',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.15)',
                  background: 'rgba(255,255,255,0.06)',
                  color: submitting ? 'var(--text-mute)' : '#fff',
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: submitting ? 'default' : 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                소비 내역 쓰기 💸
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 📊 오늘의 절약 온도 */}
      {(() => {
        const spent = daily.spentAmount ?? 0;
        const temp = daily.recorded ? (spent === 0 ? 100 : Math.max(10, Math.min(99, Math.round(100 - (spent / 1000))))) : 0;
        return (
          <div className="glass-card savings-temp-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 4 }}>
                오늘의 절약 온도
                <span style={{ fontSize: 13 }}>🔥</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>
                {daily.recorded ? (spent === 0 ? '100% (무지출)' : `${temp}%`) : '측정 대기 중'}
              </span>
            </div>
            
            <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 100, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${daily.recorded ? temp : 0}%`, background: '#00F5A0', borderRadius: 100, transition: 'width 0.6s ease-out' }} />
            </div>
            
            <p style={{ fontSize: 11, color: 'var(--text-mute)', marginTop: 8, lineHeight: 1.4, margin: '8px 0 0 0' }}>
              {daily.recorded ? (
                spent === 0 ? (
                  '완벽한 하루! 무지출 달성으로 절약 온도가 뜨겁습니다 👑'
                ) : (
                  `오늘 ${formatAmount(spent)} 지출 완료. 현명하고 통제된 소비 온도입니다.`
                )
              ) : (
                '오늘 소비 기록을 남기면 실시간 절약 온도가 시각화됩니다.'
              )}
            </p>
          </div>
        );
      })()}

      {/* 🐹 절약 요정 다마고치 키우기 Widget (초슬림 가로형 컴팩트 레이아웃) */}
      {(() => {
        const personaKey = getPersona() || 'hamster';
        const p = PERSONAS[personaKey];
        const petLevel = Math.min(5, 1 + Math.floor(streak.totalDays / 3));

        return (
          <div className="glass-card pet-card" id="tutorial-step-3" style={{ padding: '12px 14px', border: '1px solid rgba(255,255,255,0.08)', background: 'linear-gradient(135deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              {/* 캐릭터 바디 및 장착된 악세사리 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: `1.8px solid ${p?.color || '#FF5E62'}`,
                    borderRadius: 100,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    boxShadow: `0 0 15px ${(p?.color || '#FF5E62')}15`,
                    animation: 'floating 4s infinite ease-in-out',
                    flexShrink: 0
                  }}
                >
                  <img src={p?.icon} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: '#fff' }}>{p?.name} 요정</span>
                    <span style={{ fontSize: 8, background: 'rgba(168,85,247,0.15)', color: '#C084FC', padding: '1px 5px', borderRadius: 4, fontWeight: 900 }}>LV.{petLevel}</span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-mute)', display: 'block', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {daily.recorded ? (daily.spentAmount === 0 ? '🔋 기분 최고! (무지출 상태)' : '🥱 지출 발생으로 피곤함') : '💤 기록을 기다리는 중...'}
                  </span>
                </div>
              </div>

            </div>
          </div>
        );
      })()}

      {/* 펜딩 포인트 (광고 보고 받기) */}
      {pendingPoints > 0 && (
        <div className="glass-card" style={{ padding: '16px', border: '1px solid rgba(255, 200, 0, 0.25)', background: 'linear-gradient(135deg, rgba(255, 200, 0, 0.06) 0%, rgba(255,255,255,0.01) 100%)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>🎁</span>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: '#FFC800' }}>적립된 토스포인트</p>
                <p style={{ margin: '3px 0 0 0', fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.4, wordBreak: 'keep-all' }}>
                  리워드 광고를 시청하면 지급됩니다 · 최대 50원
                </p>
              </div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#FFC800', flexShrink: 0 }}>{pendingPoints}원</span>
          </div>
          <button
            onClick={onClaimPending}
            disabled={pendingClaiming}
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: 12,
              border: 'none',
              background: pendingClaiming ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #FFC800 0%, #FF9500 100%)',
              color: pendingClaiming ? 'var(--text-mute)' : '#090A10',
              fontSize: 13,
              fontWeight: 900,
              cursor: pendingClaiming ? 'default' : 'pointer',
              boxShadow: pendingClaiming ? 'none' : '0 4px 15px rgba(255, 200, 0, 0.25)',
              textAlign: 'center',
              transition: 'all 0.2s',
            }}
          >
            {pendingClaiming ? '광고 시청 중...' : '광고 보고 받기'}
          </button>
        </div>
      )}

      {/* 스트릭 로드맵 */}
      <div className="glass-card streak-card">
        <div className="streak-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span className="streak-title" style={{ fontSize: 13, fontWeight: 800 }}>연속 기록</span>
          {streak.streak > 0 && (
            <Badge size="small" color="red" variant="weak">
              <img src="/images/icon_flame.png" className="custom-icon--sm" style={{ marginRight: 3, verticalAlign: 'middle' }} />
              {streak.streak}일
            </Badge>
          )}
        </div>
        <div className="streak-roadmap">
          {Array.from({ length: WEEK_DAYS }, (_, i) => {
            const isDone = i < doneCount;
            const isCurrent = i === doneCount && !daily.recorded;
            const isGift = i === 6;
            return (
              <div key={i} className={`streak-node-wrap ${isDone ? 'past' : isCurrent ? 'current' : 'future'}`}>
                <div className="streak-line" />
                <div className="streak-node">
                  {isDone ? (
                    '✔️'
                  ) : isGift ? (
                    <img src="/images/icon_target.png" className="custom-icon" style={{ width: '1.3em', height: '1.3em', objectFit: 'contain' }} />
                  ) : isCurrent ? (
                    <img src="/images/icon_flame.png" className="custom-icon" style={{ width: '1.3em', height: '1.3em', objectFit: 'contain' }} />
                  ) : (
                    <img src="/images/icon_lock.png" className="custom-icon" style={{ width: '1.0em', height: '1.0em', objectFit: 'contain' }} />
                  )}
                </div>
                <div className="streak-day-label">{i + 1}일</div>
              </div>
            );
          })}
        </div>
        {streak.streak > 0 && streak.streak % 7 === 0 && pendingPoints > 0 && (
          <p className="streak-reward-hint" style={{ fontSize: 11, color: 'var(--primary)', marginTop: 8, textAlign: 'center', fontWeight: 700 }}>🔥 7일 연속 완주 보너스 포함 · 위에서 광고 보고 받기</p>
        )}
      </div>



      {/* 오늘의 짠물 미션 */}
      {(() => {
        const mission = getDailyMission(daily.date);
        return (
          <div className="glass-card daily-mission-card">
            <div className="mission-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="mission-title" style={{ fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center' }}>
                오늘의 짠물 미션
                <img src="/images/icon_target.png" className="custom-icon" style={{ marginLeft: 5 }} />
              </span>
              {mission.completed ? (
                <span className="mission-completed-badge" style={{ fontSize: 10, fontWeight: 800, color: 'var(--primary)', background: 'rgba(0,245,160,0.15)', padding: '2px 8px', borderRadius: 100 }}>🎉 미션 완료</span>
              ) : (
                <span className="mission-badge" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-mute)', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 100 }}>진행 중</span>
              )}
            </div>
            <div className="mission-content" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p className="mission-text" style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>{mission.action}</p>
              </div>
              <div>
                {mission.completed ? (
                  <span className="mission-completed-row" style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>✅ 달성</span>
                ) : (
                  <span className="mission-reward" style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-mute)' }}>도전 중</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ⚡ 실시간 절약 배틀 콕 찌르기 (Social Loop Widget) */}
      <div className="glass-card battle-card" style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 4 }}>
            실시간 절약 배틀
            <span style={{ fontSize: 12, color: 'var(--primary)' }}>⚡</span>
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-mute)', fontWeight: 700 }}>
            절약 중인 친구들과 소통해요
          </span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {onlineUsers.map((u) => {
            const p = PERSONAS[u.personaKey];
            const isZero = u.spentAmount === 0;
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 100, border: `1px solid ${p?.color ?? '#fff'}40` }}>
                    <img src={p?.icon} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {u.nickname}
                      {u.isOnline && <span style={{ width: 5, height: 5, background: '#00F5A0', borderRadius: 100, display: 'inline-block' }} />}
                      
                      {/* 💖 짠친 궁합 매칭 칩 */}
                      <span
                        onClick={() => setSelectedAffinityUser(u)}
                        style={{
                          fontSize: 8,
                          fontWeight: 900,
                          background: 'linear-gradient(135deg, rgba(255,94,98,0.15) 0%, rgba(255,153,102,0.15) 100%)',
                          color: '#FF5E62',
                          border: '0.5px solid rgba(255,94,98,0.25)',
                          borderRadius: 100,
                          padding: '1px 5px',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 2,
                          marginLeft: 4,
                          boxShadow: '0 0 6px rgba(255,94,98,0.1)'
                        }}
                      >
                        💖 궁합 {getCompatibilityScore(u.personaKey, getPersona() || 'hamster')}%
                      </span>
                    </span>
                    <span style={{ fontSize: 10, color: isZero ? 'var(--primary)' : 'var(--text-mute)', fontWeight: 700 }}>
                      {isZero ? '무지출 👑' : `오늘 ${formatAmount(u.spentAmount)}`}
                    </span>
                  </div>
                </div>

                <button
                  disabled={u.hasPoked}
                  onClick={() => handlePokeUser(u.id, u.nickname, isZero)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 100,
                    border: 'none',
                    background: u.hasPoked ? 'rgba(255,255,255,0.05)' : isZero ? 'rgba(0, 245, 160, 0.15)' : 'rgba(255, 77, 79, 0.15)',
                    color: u.hasPoked ? 'var(--text-mute)' : isZero ? '#00F5A0' : '#FF4D4F',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: u.hasPoked ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: u.hasPoked ? 'none' : `0 0 8px ${isZero ? 'rgba(0,245,160,0.1)' : 'rgba(255,77,79,0.1)'}`
                  }}
                >
                  {u.hasPoked ? '콕 찌름 ✓' : isZero ? '칭찬 ⚡' : '일침 ⚡'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 이번 주 내 현황 */}
      {myRow && (
        <div className="glass-card week-summary-card" style={{ padding: '12px 14px' }}>
          <p className="week-summary-label" style={{ margin: 0, fontSize: 11, color: 'var(--text-mute)', fontWeight: 700 }}>이번 주 내 소비</p>
          <p className="week-summary-amount" style={{ margin: '4px 0 8px 0', fontSize: 18, fontWeight: 900, color: 'var(--text-main)' }}>{formatAmount(myRow.total)}</p>
          <div className="week-summary-meta" style={{ display: 'flex', gap: 6 }}>
            <Badge size="small" color="blue" variant="weak">{myRow.days}일 기록</Badge>
            {myRank >= 0 && (
              <Badge size="small" color={myRank === 0 ? 'yellow' : 'elephant'} variant="weak">
                {myRank === 0 ? '👑 ' : ''}{myRank + 1}위 / {weekRank.length}명
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* 순위 미리보기 (상위 3명) */}
      {weekRank.length > 0 && (
        <div className="glass-card rank-preview-card" style={{ padding: '12px 14px' }}>
          <p className="rank-preview-title" style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 800 }}>이번 주 절약왕 🏆</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {weekRank.slice(0, 3).map((row, i) => (
              <div key={row.user_id} className={`rank-preview-row ${row.user_id === userId ? 'rank-mine' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="rank-medal" style={{ fontSize: 14 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <span className="rank-nickname" style={{ fontSize: 12, fontWeight: 700, color: row.user_id === userId ? 'var(--primary)' : 'var(--text-main)' }}>{row.nickname}</span>
                </div>
                <span className="rank-amount" style={{ fontSize: 12, fontWeight: 800, color: row.user_id === userId ? 'var(--primary)' : 'var(--text-sub)' }}>{formatAmount(row.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 하단 띠 배너 광고 */}
      <div
        className="mock-bottom-banner glass-card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'linear-gradient(90deg, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0.04) 100%)',
          cursor: 'pointer'
        }}
        onClick={() => window.open('https://toss.im', '_blank')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/images/ad_toss_piggy.png" alt="Toss Piggy" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <div style={{ textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>토스 숨은 돈 찾기 💰</p>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-mute)', marginTop: 2 }}>잠자고 있는 계좌 속 숨은 꽁돈을 지금 조회해 보세요</p>
          </div>
        </div>
        <span style={{ fontSize: 9, fontWeight: 900, background: 'rgba(255,255,255,0.1)', color: 'var(--text-mute)', padding: '2px 5px', borderRadius: 2 }}>AD</span>
      </div>

      {/* 💖 짠친 MBTI 궁합 분석 모달 */}
      {selectedAffinityUser && (() => {
        const myPersonaKey = getPersona() || 'hamster';
        const myPersonaObj = PERSONAS[myPersonaKey];
        const targetPersonaObj = PERSONAS[selectedAffinityUser.personaKey];
        const score = getCompatibilityScore(selectedAffinityUser.personaKey, myPersonaKey);
        const isZero = selectedAffinityUser.spentAmount === 0;

        return (
          <div
            className="story-modal-overlay"
            onClick={() => setSelectedAffinityUser(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(9, 10, 16, 0.8)',
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
              style={{
                maxWidth: 340,
                width: '100%',
                padding: 24,
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: 'rgba(10, 11, 16, 0.95)',
                borderRadius: 24,
                textAlign: 'center'
              }}
            >
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 24 }}>💖</span>
                <h3 style={{ fontSize: 16, fontWeight: 900, color: '#fff', margin: '6px 0 2px 0' }}>짠친 궁합 분석</h3>
                <p style={{ fontSize: 11, color: 'var(--text-mute)', margin: 0 }}>서로의 소비 페르소나 화학 결합도</p>
              </div>

              {/* 매칭 매개체 비주얼화 */}
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', margin: '24px 0', position: 'relative' }}>
                {/* 나 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 80 }}>
                  <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.03)', border: `2px solid ${myPersonaObj?.color || '#fff'}`, borderRadius: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={myPersonaObj?.icon} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#fff', fontWeight: 800 }}>나 ({myPersonaObj?.name})</span>
                </div>

                {/* 중앙 점수 링 */}
                <div
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 100,
                    background: 'linear-gradient(135deg, rgba(255,94,98,0.1) 0%, rgba(255,153,102,0.1) 100%)',
                    border: '3px solid #FF5E62',
                    boxShadow: '0 0 20px rgba(255,94,98,0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 900, color: '#FF5E62' }}>{score}%</span>
                  <span style={{ fontSize: 8, color: '#FF9966', fontWeight: 900, letterSpacing: 0.5 }}>MATCH</span>
                </div>

                {/* 상대방 */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 80 }}>
                  <div style={{ width: 48, height: 48, background: 'rgba(255,255,255,0.03)', border: `2px solid ${targetPersonaObj?.color || '#fff'}`, borderRadius: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={targetPersonaObj?.icon} alt="" style={{ width: '70%', height: '70%', objectFit: 'contain' }} />
                  </div>
                  <span style={{ fontSize: 11, color: '#fff', fontWeight: 800 }}>{selectedAffinityUser.nickname}</span>
                </div>
              </div>

              {/* 📊 양자 소비 성향 비교 레이더 차트 */}
              {(() => {
                const myScores = [75, 80, 85, 70, 90];
                const targetScores = selectedAffinityUser.personaKey === 'hamster' ? [85, 90, 80, 60, 95] : selectedAffinityUser.personaKey === 'keeper' ? [80, 85, 75, 70, 85] : selectedAffinityUser.personaKey === 'cost_ai' ? [90, 95, 85, 55, 90] : [55, 60, 50, 90, 60];

                const getRadarPt = (score: number, idx: number, maxRadius = 40) => {
                  const angle = (Math.PI * 2 / 5) * idx - Math.PI / 2;
                  const r = (score / 100) * maxRadius;
                  const x = 70 + r * Math.cos(angle);
                  const y = 62 + r * Math.sin(angle);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                };

                const myPoints = [0, 1, 2, 3, 4].map(i => getRadarPt(myScores[i], i)).join(' ');
                const targetPoints = [0, 1, 2, 3, 4].map(i => getRadarPt(targetScores[i], i)).join(' ');
                const gridPoints = [0.4, 0.7, 1.0].map((ratio) => {
                  return [0, 1, 2, 3, 4].map(i => getRadarPt(100 * ratio, i)).join(' ');
                });

                const labels = ['자제', '절약', '생존', '사교', '짠내'];

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0 0 20px 0', background: 'rgba(255,255,255,0.01)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 16, padding: '14px 10px' }}>
                    <p style={{ margin: '0 0 10px 0', fontSize: 10, color: 'var(--text-mute)', fontWeight: 800 }}>성향 능력치 화학 구조 비교 📊</p>
                    <svg width="140" height="124" style={{ overflow: 'visible' }}>
                      {/* Grid */}
                      {gridPoints.map((pts, idx) => (
                        <polygon key={idx} points={pts} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.8" />
                      ))}
                      
                      {/* Axis */}
                      {[0, 1, 2, 3, 4].map((i) => {
                        const pt = getRadarPt(100, i);
                        return (
                          <line key={i} x1="70" y1="62" x2={pt.split(',')[0]} y2={pt.split(',')[1]} stroke="rgba(255,255,255,0.03)" strokeWidth="0.8" />
                        );
                      })}

                      {/* My polygon */}
                      <polygon points={myPoints} fill="rgba(168, 85, 247, 0.22)" stroke="#A855F7" strokeWidth="1.5" />

                      {/* Target polygon */}
                      <polygon points={targetPoints} fill={`${targetPersonaObj?.color || '#00F5A0'}18`} stroke={targetPersonaObj?.color || '#00F5A0'} strokeWidth="1.5" strokeDasharray="2,2" />

                      {/* Labels */}
                      {labels.map((name, i) => {
                        const pt = getRadarPt(115, i);
                        const [x, y] = pt.split(',').map(Number);
                        return (
                          <text key={i} x={x} y={y + 3} fill="var(--text-mute)" fontSize="8" fontWeight="900" textAnchor="middle">
                            {name}
                          </text>
                        );
                      })}
                    </svg>

                    {/* 범례 */}
                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                      <span style={{ fontSize: 9, color: '#A855F7', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, background: '#A855F7', borderRadius: 100 }} /> 나
                      </span>
                      <span style={{ fontSize: 9, color: targetPersonaObj?.color || '#00F5A0', fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, background: targetPersonaObj?.color || '#00F5A0', borderRadius: 100 }} /> {selectedAffinityUser.nickname}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* 궁합 설명 복사본 */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, marginBottom: 24 }}>
                <p style={{ fontSize: 12, color: 'var(--text-sub)', margin: 0, lineHeight: 1.5, textAlign: 'left' }}>
                  {score > 85 ? (
                    `✨ 두 분은 절약의 소울메이트입니다! 소비 욕구를 함께 억제하며 서로에게 최고의 긍정적인 시너지를 주는 완벽한 파트너입니다. 서로 응원을 남겨 힘을 불어넣어주세요!`
                  ) : score > 75 ? (
                    `🌱 균형 잡힌 짠친 사이입니다. 서로 다른 매력의 소비 가치관을 가지고 있지만, 지갑을 지키겠다는 목표 하에선 훌륭한 시너지를 이뤄내고 있습니다.`
                  ) : (
                    `⚡ 충돌 위험! 두 분의 궁합은 파멸적입니다! 한 분의 충동 구매가 다른 한 분의 지갑까지 뒤흔들 수 있으니, 지금 당장 일침 콕 찌르기로 상대의 정신을 똑바로 깨워주세요!`
                  )}
                </p>
              </div>

              {/* 제어 버튼 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button
                  size="large"
                  display="full"
                  color="primary"
                  variant="fill"
                  disabled={selectedAffinityUser.hasPoked}
                  onClick={() => {
                    handlePokeUser(selectedAffinityUser.id, selectedAffinityUser.nickname, isZero);
                    setSelectedAffinityUser(null);
                  }}
                >
                  {selectedAffinityUser.hasPoked ? '오늘의 궁합 콕 완료 ✓' : '⚡ 궁합 콕 찌르기'}
                </Button>

                <Button
                  size="large"
                  display="full"
                  color="dark"
                  variant="weak"
                  onClick={() => setSelectedAffinityUser(null)}
                >
                  닫기
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 🎓 신규 사용자를 위한 고품격 안내 튜토리얼 Overlay */}
      {tutorialStep !== null && (() => {
        const getTutorialContent = () => {
          switch (tutorialStep) {
            case 1:
              return {
                title: "1. 간편 지출 및 무지출 기록하기 🌿",
                desc: "오늘 아낀 돈이나 소비 내역을 최상단에서 손쉽게 기록해 보세요! 단 한 번의 터치로 무지출 기록이 끝납니다.",
                icon: "✍️",
                targetId: "tutorial-step-1"
              };
            case 2:
              return {
                title: "2. 짠친 피드에서 밸런스 게임 즐기기 🎴",
                desc: "피드 탭으로 이동하면 짠친들의 영수증을 보고 '과소비' vs '합리적 지출' 스와이프 투표를 하거나 콕 찌르며 지속적으로 놀 수 있습니다.",
                icon: "🎴",
                targetId: null
              };
            case 3:
              return {
                title: "3. 절약 요정 키우기 🐹",
                desc: "매일 소비를 기록하면 절약 요정이 함께 성장해요! 연속 기록 스트릭을 유지하면 레벨이 올라갑니다.",
                icon: "🐹",
                targetId: "tutorial-step-3"
              };
            default:
              return null;
          }
        };

        const current = getTutorialContent();
        if (!current) return null;

        return (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(9, 10, 16, 0.88)',
              zIndex: 5000,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
              animation: 'fadeInOverlay 0.22s ease-out'
            }}
          >
            {/* 스포트라이트 안내 카드 */}
            <div
              className="glass-card"
              style={{
                maxWidth: 320,
                width: '100%',
                padding: 24,
                border: '1.5px solid var(--primary)',
                background: 'rgba(15, 17, 26, 0.95)',
                borderRadius: 24,
                textAlign: 'center',
                boxShadow: '0 12px 40px rgba(0, 245, 160, 0.15)'
              }}
            >
              <span style={{ fontSize: 36, display: 'block', marginBottom: 12 }}>{current.icon}</span>
              <h3 style={{ fontSize: 15, fontWeight: 900, color: '#fff', margin: '0 0 10px 0' }}>{current.title}</h3>
              <p style={{ fontSize: 11, color: 'var(--text-mute)', margin: '0 0 20px 0', lineHeight: 1.5, wordBreak: 'keep-all' }}>
                {current.desc}
              </p>

              <button
                onClick={() => {
                  if (tutorialStep < 3) {
                    setTutorialStep(tutorialStep + 1);
                  } else {
                    localStorage.setItem('savelog_tutorial_completed', 'true');
                    setTutorialStep(null);
                  }
                }}
                style={{
                  width: '100%',
                  padding: 12,
                  background: 'linear-gradient(135deg, #00F5A0 0%, #00D9F5 100%)',
                  border: 'none',
                  borderRadius: 14,
                  color: '#090A10',
                  fontSize: 12,
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0, 245, 160, 0.2)',
                  transition: 'all 0.2s'
                }}
              >
                {tutorialStep === 3 ? "가이드 마치고 시작하기! 🎉" : "다음으로 〉"}
              </button>
            </div>

            {/* 스포트라이트 인디케이터 도트 */}
            <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  style={{
                    width: step === tutorialStep ? 18 : 6,
                    height: 6,
                    borderRadius: 100,
                    background: step === tutorialStep ? 'var(--primary)' : 'rgba(255,255,255,0.15)',
                    transition: 'all 0.3s ease'
                  }}
                />
              ))}
            </div>
          </div>
        );
      })()}

      {/* 하단 여백 */}
      <div style={{ height: 24 }} />
    </div>
  );
}
