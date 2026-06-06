import { useState } from 'react';
import { Badge } from '@toss/tds-mobile';
import type { DailyState, StreakData } from '../lib/storage';
import { getDailyMission, getPersona, PERSONAS } from '../lib/storage';
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
  streakShields?: number;
  onRecord: () => void;
  onQuickZeroSpend: () => void;
  onClaimPending: () => void;
}

const WEEK_DAYS = 7;

export default function HomeScreen({ daily, streak, weekRank, userId, pendingPoints, submitting = false, pendingClaiming = false, streakShields = 0, onRecord, onQuickZeroSpend, onClaimPending }: Props) {
  const weekKey = getWeekKey();
  const weekRangeStr = formatWeekRange(weekKey);
  const spendGroup = weekRank.filter((r) => r.total > 0);
  const zeroGroup = weekRank.filter((r) => r.total === 0);
  const myRow = weekRank.find((r) => r.user_id === userId);
  const mySpendIdx = spendGroup.findIndex((r) => r.user_id === userId);
  const myZeroIdx = zeroGroup.findIndex((r) => r.user_id === userId);
  const inSpendGroup = mySpendIdx >= 0;
  const inZeroGroup = myZeroIdx >= 0;

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

  return (
    <div className="screen screen-home">
      {/* 헤더 */}
      <div className="home-header-row" style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 className="home-logo-title">세이브로그</h1>
          <p className="home-week-range" style={{ margin: '2px 0 0 0', fontSize: 11, color: 'var(--text-mute)', fontWeight: 700 }}>{weekRangeStr}</p>
        </div>
      </div>

      {/* ✍️ 핵심 소비/무지출 기록 콘솔 (최상단 전면 배치) */}
      <div className="glass-card primary-record-card" id="tutorial-step-1" style={{ padding: 14, border: '1.5px solid var(--primary)', background: 'linear-gradient(135deg, rgba(0, 245, 160, 0.04) 0%, rgba(255,255,255,0.01) 100%)', boxShadow: '0 8px 24px rgba(0, 245, 160, 0.05)' }}>
        {daily.recorded ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>🌿</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: 'var(--primary)' }}>오늘의 짠내 기록 완료! 🎉</p>
                <p style={{ margin: '2px 0 0 0', fontSize: 10, color: 'var(--text-mute)', lineHeight: 1.3 }}>
                  {(daily.spentAmount ?? 0) === 0 ? '무지출 달성!' : `오늘 ${formatAmount(daily.spentAmount ?? 0)} 기록됨`}
                </p>
              </div>
            </div>
            <button
              onClick={onRecord}
              disabled={submitting}
              style={{
                flexShrink: 0,
                padding: '7px 14px',
                borderRadius: 100,
                border: '1px solid rgba(0, 245, 160, 0.3)',
                background: 'rgba(0, 245, 160, 0.08)',
                color: 'var(--primary)',
                fontSize: 11,
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              + 추가 기록
            </button>
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
                    {daily.recorded ? ((daily.spentAmount ?? 0) === 0 ? '🔋 기분 최고! (무지출 상태)' : '🥱 지출 발생으로 피곤함') : '💤 기록을 기다리는 중...'}
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
              <img
                src={pendingClaiming ? "/images/lucky_chest_opened.png" : "/images/lucky_chest_closed.png"}
                alt="Lucky Chest"
                className="lucky-chest-img lucky-chest-bob"
                style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0 }}
              />
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {streakShields > 0 && (
              <Badge size="small" color="blue" variant="weak">🛡️ 보호권 {streakShields}개</Badge>
            )}
            {streak.streak > 0 && (
              <Badge size="small" color="red" variant="weak">
                <img src="/images/icon_flame.png" className="custom-icon--sm" style={{ marginRight: 3, verticalAlign: 'middle' }} />
                {streak.streak}일
              </Badge>
            )}
          </div>
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
                  {isGift ? (
                    isDone ? (
                      <img src="/images/lucky_chest_opened.png" className="custom-icon" style={{ width: '1.4em', height: '1.4em', objectFit: 'contain' }} />
                    ) : (
                      <img src="/images/lucky_chest_closed.png" className="custom-icon" style={{ width: '1.4em', height: '1.4em', objectFit: 'contain', filter: 'grayscale(0.2)' }} />
                    )
                  ) : isDone ? (
                    <svg width="12" height="9" viewBox="0 0 12 9" fill="none" style={{ color: 'var(--primary)' }}>
                      <path d="M1 4.5L4 7.5L11 1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
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
                  <span className="mission-completed-row" style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--primary)' }}>
                      <circle cx="6" cy="6" r="5.25" fill="rgba(0, 245, 160, 0.1)" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M4 6L5.5 7.5L8 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    달성
                  </span>
                ) : (
                  <span className="mission-reward" style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-mute)' }}>도전 중</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 이번 주 내 현황 */}
      {myRow && (
        <div className="glass-card week-summary-card" style={{ padding: '12px 14px' }}>
          <p className="week-summary-label" style={{ margin: 0, fontSize: 11, color: 'var(--text-mute)', fontWeight: 700 }}>이번 주 내 소비</p>
          <p className="week-summary-amount" style={{ margin: '4px 0 8px 0', fontSize: 18, fontWeight: 900, color: 'var(--text-main)' }}>{formatAmount(myRow.total)}</p>
          <div className="week-summary-meta" style={{ display: 'flex', gap: 6 }}>
            <Badge size="small" color="blue" variant="weak">{myRow.days}일 기록</Badge>
            {inSpendGroup && (
              <Badge size="small" color={mySpendIdx === 0 ? 'yellow' : 'elephant'} variant="weak">
                {mySpendIdx === 0 ? '👑 ' : ''}{mySpendIdx + 1}위 / {spendGroup.length}명
              </Badge>
            )}
            {inZeroGroup && (
              <Badge size="small" color="green" variant="weak">
                👑 무지출 {myZeroIdx + 1}번째
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* 순위 미리보기 — 유지출 그룹 상위 3명 */}
      {spendGroup.length > 0 && (
        <div className="glass-card rank-preview-card" style={{ padding: '12px 14px' }}>
          <p className="rank-preview-title" style={{ margin: '0 0 10px 0', fontSize: 13, fontWeight: 800 }}>이번 주 절약왕 🏆</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {spendGroup.slice(0, 3).map((row, i) => (
              <div key={row.user_id} className={`rank-preview-row ${row.user_id === userId ? 'rank-mine' : ''}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="rank-medal" style={{ fontSize: 14 }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                  <span className="rank-nickname" style={{ fontSize: 12, fontWeight: 700, color: row.user_id === userId ? 'var(--primary)' : 'var(--text-main)' }}>{row.nickname}</span>
                </div>
                <span className="rank-amount" style={{ fontSize: 12, fontWeight: 800, color: row.user_id === userId ? 'var(--primary)' : 'var(--text-sub)' }}>{formatAmount(row.total)}</span>
              </div>
            ))}
          </div>
          {zeroGroup.length > 0 && (
            <p style={{ margin: '8px 0 0 0', fontSize: 10, color: 'var(--text-mute)', fontWeight: 700 }}>
              👑 무지출 인증단 {zeroGroup.length}명 참여 중
            </p>
          )}
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

      {/* 🎓 신규 사용자를 위한 고품격 안내 튜토리얼 Overlay */}
      {tutorialStep !== null && (() => {
        const getTutorialContent = () => {
          switch (tutorialStep) {
            case 1:
              return {
                title: "1. 간편 지출 및 무지출 기록하기 🌿",
                desc: "오늘 아낀 돈이나 소비 내역을 최상단에서 기록해 보세요! 무지출 버튼을 누르면 달성 이유를 한 줄 입력 후 피드에 공유돼요.",
                icon: "✍️",
                targetId: "tutorial-step-1"
              };
            case 2:
              return {
                title: "2. 짠친 피드에서 밸런스 게임 즐기기 🎴",
                desc: "피드 탭으로 이동하면 짠친들의 지출을 보고 '과소비' vs '합리적 지출' 투표를 하거나, ❤️·🤔 리액션으로 소통하고 팔로우할 수 있습니다.",
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
                boxShadow: '0 12px 40px rgba(0, 245, 160, 0.15)',
                position: 'relative'
              }}
            >
              <button
                onClick={() => {
                  localStorage.setItem('savelog_tutorial_completed', 'true');
                  setTutorialStep(null);
                }}
                style={{
                  position: 'absolute',
                  top: 16,
                  right: 16,
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: 'var(--text-mute)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 100,
                  cursor: 'pointer'
                }}
              >
                건너뛰기
              </button>
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
