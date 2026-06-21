import React, { useState, useRef, useEffect } from 'react';
import { Badge, Button } from '@toss/tds-mobile';
import { TossAds } from '@apps-in-toss/web-framework';
import type { DailyState, StreakData } from '../lib/storage';
import { getDailyMission, getPersona, PERSONAS, getNickname, MAX_PENDING_POINTS, RAID_BOSSES, type GroupRaid } from '../lib/storage';
import { formatAmount, formatWeekRange, getWeekKey } from '../lib/utils';
import type { WeekRankRow } from '../lib/supabase';
import { BANNER_AD_ID, initBannerAds } from '../lib/ads';
import CustomIcon, { renderTextWithEmoji } from '../components/CustomIcon';

function BannerAdSlot({ adGroupId }: { adGroupId: string }) {
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
      attached = TossAds.attachBanner(adGroupId, containerRef.current, {
        theme: 'dark',
        tone: 'blackAndWhite',
        variant: 'expanded',
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

    // initBannerAds는 멱등 — App에서 이미 호출했지만 혹시 모를 경우 방어
    initBannerAds();
    attach();

    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      attached?.destroy();
    };
  }, [adGroupId]);

  return <div ref={containerRef} style={{ width: '100%', height: '96px' }} />;
}


function SimpleModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-overlay simple-modal-overlay" onClick={onClose}>
      <div className="modal-sheet simple-modal-sheet" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

interface PotMember {
  name: string;
  spent: number;
  persona: string;
}

interface PotGroup {
  id: string;
  name: string;
  budget: number;
  members: PotMember[];
  nudgeHistory: string[];
  raid?: GroupRaid;
}

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

const PERSONA_QUOTES: Record<string, string[]> = {
  cost_ai: [
    "오늘 가장 만족한 한 가지를 한 줄로 남겨봐요 🤖",
    "데이터로 보면, 한 줄 기록은 일주일 후의 내가 가장 좋아하는 선물이에요",
    "커피 한 잔의 행복도 계산해두면 다음에 더 만족스러워요"
  ],
  hamster: [
    "도토리 한 알씩 모으듯, 작은 기록도 쌓이면 든든해요 🐹",
    "오늘은 어떤 작은 만족을 골랐나요? 한 줄로 남겨봐요",
    "지갑이 쉬는 날도 멋진 하루예요"
  ],
  flexer: [
    "오늘 나에게 작은 선물 하나, 어떤 게 좋았나요? 🦄",
    "쓴 만큼의 이야기도 남겨두면 다음에 도움이 돼요",
    "마음이 끌리는 순간을 가볍게 기록해봐요"
  ],
  keeper: [
    "장바구니에 며칠 두었다가 다시 꺼내봐요, 답이 보여요 🛒",
    "오늘의 작은 결정, 한 줄로 남겨두면 미래의 내가 고마워해요",
    "친구들과 같이 기록하면 더 즐거워져요"
  ]
};

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

  const [speech, setSpeech] = useState<string | null>(null);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isWobbling, setIsWobbling] = useState(false);

  // 👥 짠물 계모임 관련 상태 및 로직
  const [group, setGroup] = useState<PotGroup | null>(() => {
    try {
      const saved = localStorage.getItem('savelog_pot_group');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && !parsed.raid) {
        const randomBoss = RAID_BOSSES[Math.floor(Math.random() * RAID_BOSSES.length)];
        parsed.raid = {
          bossName: randomBoss.name,
          bossMaxHp: randomBoss.maxHp,
          bossHp: randomBoss.maxHp,
          bossWeaknessCategory: randomBoss.weaknessCategory,
          bossWeaknessEmoji: randomBoss.weaknessEmoji,
          raidCompleted: false
        };
        localStorage.setItem('savelog_pot_group', JSON.stringify(parsed));
      }
      return parsed;
    } catch {
      return null;
    }
  });
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showInviteInput, setShowInviteInput] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [potToast, setPotToast] = useState<string | null>(null);
  const potToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPotToast = (msg: string) => {
    if (potToastTimerRef.current) clearTimeout(potToastTimerRef.current);
    setPotToast(msg);
    potToastTimerRef.current = setTimeout(() => {
      setPotToast(null);
      potToastTimerRef.current = null;
    }, 2500);
  };

  const handleCreateGroup = () => {
    const names = ['🍳 삼시세끼 집밥단', '☕ 스타벅스 탈출기', '🛒 쇼핑앱 삭제 위원회', '🏪 편의점 1+1 정복단'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomBoss = RAID_BOSSES[Math.floor(Math.random() * RAID_BOSSES.length)];
    const newGroup: PotGroup = {
      id: Math.random().toString(36).substring(2, 9).toUpperCase(),
      name: randomName,
      budget: 300000,
      members: [
        { name: '김토스', spent: 38000, persona: 'hamster' },
        { name: '이패드', spent: 115000, persona: 'flexer' },
        { name: '박절약', spent: 12000, persona: 'keeper' }
      ],
      nudgeHistory: ['이패드님이 가입했습니다.', '김토스님이 박절약님을 콕 찔렀습니다.'],
      raid: {
        bossName: randomBoss.name,
        bossMaxHp: randomBoss.maxHp,
        bossHp: randomBoss.maxHp,
        bossWeaknessCategory: randomBoss.weaknessCategory,
        bossWeaknessEmoji: randomBoss.weaknessEmoji,
        raidCompleted: false
      }
    };
    setGroup(newGroup);
    localStorage.setItem('savelog_pot_group', JSON.stringify(newGroup));
    showPotToast(`👥 ${randomName} 방을 개설했습니다!`);
  };

  const handleJoinGroup = () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) return;
    const names = ['🍳 삼시세끼 집밥단', '☕ 스타벅스 탈출기', '🛒 쇼핑앱 삭제 위원회', '🏪 편의점 1+1 정복단'];
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomBoss = RAID_BOSSES[Math.floor(Math.random() * RAID_BOSSES.length)];
    const newGroup: PotGroup = {
      id: code,
      name: randomName,
      budget: 300000,
      members: [
        { name: '김토스', spent: 42000, persona: 'hamster' },
        { name: '이패드', spent: 98000, persona: 'flexer' },
        { name: '박절약', spent: 18000, persona: 'keeper' }
      ],
      nudgeHistory: [`초대 코드 ${code}로 입장했습니다.`, '김토스님이 박절약님을 콕 찔렀습니다.'],
      raid: {
        bossName: randomBoss.name,
        bossMaxHp: randomBoss.maxHp,
        bossHp: randomBoss.maxHp,
        bossWeaknessCategory: randomBoss.weaknessCategory,
        bossWeaknessEmoji: randomBoss.weaknessEmoji,
        raidCompleted: false
      }
    };
    setGroup(newGroup);
    localStorage.setItem('savelog_pot_group', JSON.stringify(newGroup));
    setInviteCode('');
    setShowInviteInput(false);
    showPotToast(`👥 ${randomName} 방에 참여했습니다!`);
  };

  const handleLeaveGroup = () => {
    localStorage.removeItem('savelog_pot_group');
    setGroup(null);
    setShowGroupModal(false);
    showPotToast('계모임에서 탈퇴했습니다.');
  };

  const handleNudgeMember = (memberName: string) => {
    if (!group) return;
    const myName = getNickname() || '나';
    const message = `${myName}님이 ${memberName}님을 콕 찔렀습니다.`;
    const updatedHistory = [message, ...group.nudgeHistory.slice(0, 15)];
    const updatedGroup = {
      ...group,
      nudgeHistory: updatedHistory
    };
    setGroup(updatedGroup);
    showPotToast(`💬 ${memberName}님에게 "오늘도 같이 가요 🌿" 한마디 보냈어요.`);
  };

  // 실시간 짠물 계모임 타인 활동 시뮬레이션 효과
  useEffect(() => {
    if (!group) return;
    
    const interval = setInterval(() => {
      const chance = Math.random();
      if (chance < 0.15) { 
        const mockMembers = ['김토스', '이패드', '박절약'];
        const chosenOne = mockMembers[Math.floor(Math.random() * mockMembers.length)];
        const actionType = Math.random() > 0.5 ? 'spend' : 'nudge';
        
        // 모든 랜덤 값과 사이드이펙트를 updater 바깥에서 계산 (strict mode double-invoke 방지)
        let historyEntry: string;
        let memberUpdate: ((m: PotMember) => PotMember) | null = null;
        let toastMsg: string | null = null;

        if (actionType === 'spend') {
          const addedSpend = Math.floor(Math.random() * 3000) + 1000;
          historyEntry = `${chosenOne}님이 ${formatAmount(addedSpend)} 소비를 기록했습니다.`;
          memberUpdate = (m) => m.name === chosenOne ? { ...m, spent: m.spent + addedSpend } : m;
        } else {
          const target = mockMembers.filter(n => n !== chosenOne)[Math.floor(Math.random() * 2)];
          const comment = Math.random() > 0.5 ? '지갑 지키세요! 🛡️' : '커피 참읍시다 ☕';
          historyEntry = `${chosenOne}님이 ${target}님을 콕 찔렀습니다: "${comment}"`;
          if (Math.random() > 0.5) {
            toastMsg = `💬 ${chosenOne}님이 나를 콕 찔렀어요: "${comment}"`;
          }
        }

        setGroup(prevGroup => {
          if (!prevGroup) return null;
          const updatedMembers = memberUpdate ? prevGroup.members.map(memberUpdate) : prevGroup.members;
          const updatedHistory = [historyEntry, ...prevGroup.nudgeHistory].slice(0, 15);
          return { ...prevGroup, members: updatedMembers, nudgeHistory: updatedHistory };
        });

        if (toastMsg) showPotToast(toastMsg);
      }
    }, 12000);
    
    return () => clearInterval(interval);
  }, [group !== null]);

  const handlePetClick = () => {
    setIsWobbling(true);
    setTimeout(() => setIsWobbling(false), 500);

    const personaKey = getPersona() || 'hamster';
    const quotes = PERSONA_QUOTES[personaKey] || PERSONA_QUOTES['hamster'];
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];

    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
    }

    setSpeech(randomQuote);
    speechTimeoutRef.current = setTimeout(() => {
      setSpeech(null);
    }, 3500);
  };

  useEffect(() => {
    return () => {
      if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
      if (potToastTimerRef.current) clearTimeout(potToastTimerRef.current);
    };
  }, []);

  // group → localStorage 동기화 (state updater 바깥에서 처리)
  useEffect(() => {
    if (group !== null) {
      localStorage.setItem('savelog_pot_group', JSON.stringify(group));
    }
  }, [group]);

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
      <div className="home-header-row">
        <div>
          <h1 className="home-logo-title">세이브로그</h1>
          <p className="home-week-range">{weekRangeStr}</p>
        </div>
      </div>

      {/* ✍️ 핵심 소비/무지출 기록 콘솔 (최상단 전면 배치) */}
      <div className="glass-card primary-record-card" id="tutorial-step-1">
        {daily.recorded ? (
          <div className="record-done-row">
            <div className="record-done-main">
              <span className="record-done-emoji"><CustomIcon emoji="🌿" /></span>
              <div>
                <p className="record-done-heading">오늘 하루 잘 남기셨네요 🎉</p>
                <p className="record-done-detail">
                  {(daily.spentAmount ?? 0) === 0 ? '무지출 달성!' : `오늘 ${formatAmount(daily.spentAmount ?? 0)} 기록됨`}
                </p>
              </div>
            </div>
            <button className="record-add-btn" onClick={onRecord} disabled={submitting}>
              + 추가 기록
            </button>
          </div>
        ) : (
          <div>
            <div className="record-cta-row">
              <img src="/images/savelog_main_character.svg" className="custom-icon--lg" />
              <div>
                <h4 className="record-cta-heading">오늘 하루를 한 줄로 남겨봐요 <CustomIcon emoji="✍️" /></h4>
                <p className="record-cta-detail">매일 기록하면 짠물 온도 상승 & 토스포인트 적립!</p>
              </div>
            </div>

            <div className="record-btn-row">
              <button className="record-btn-primary" onClick={onQuickZeroSpend} disabled={submitting}>
                {submitting ? '저장 중...' : <span><CustomIcon emoji="🌿" /> 오늘 무지출 완료</span>}
              </button>
              <button className="record-btn-secondary" onClick={onRecord} disabled={submitting}>
                소비 내역 쓰기 <CustomIcon emoji="💸" />
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
          <div className="glass-card savings-temp-card">
            <div className="savings-temp-header">
              <span className="savings-temp-title">
                오늘의 절약 온도
                <span><CustomIcon emoji="🔥" /></span>
              </span>
              <span className="savings-temp-value">
                {daily.recorded ? (spent === 0 ? '100% (무지출)' : `${temp}%`) : '측정 대기 중'}
              </span>
            </div>
            <div className="savings-temp-track">
              <div className="savings-temp-fill" style={{ width: `${daily.recorded ? temp : 0}%` }} />
            </div>
            <p className="savings-temp-desc">
              {daily.recorded ? (
                spent === 0 ? <>완벽한 하루! 무지출 달성으로 절약 온도가 뜨겁습니다 <CustomIcon emoji="👑" /></>
                : `오늘 ${formatAmount(spent)} 지출 완료. 현명하고 통제된 소비 온도입니다.`
              ) : '오늘 소비 기록을 남기면 실시간 절약 온도가 시각화됩니다.'}
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
          <div className="glass-card pet-card" id="tutorial-step-3" style={{ position: 'relative', cursor: 'pointer' }} onClick={handlePetClick}>
            {speech && (
              <div className="pet-speech-bubble">
                {speech}
              </div>
            )}
            <div className="pet-inner">
              <div className="pet-left">
                <div
                  className={`pet-avatar-circle ${isWobbling ? 'wobble-anim' : ''}`}
                  style={{
                    border: `1.8px solid ${p?.color || '#FF5E62'}`,
                    boxShadow: `0 0 15px ${(p?.color || '#FF5E62')}15`,
                  }}
                >
                  <img src={p?.icon} alt="" className="pet-avatar-img" />
                </div>
                <div className="pet-info">
                  <div className="pet-name-row">
                    <span className="pet-name">{p?.name} 요정</span>
                    <span className="pet-level">LV.{petLevel}</span>
                  </div>
                  <span className="pet-status">
                    {daily.recorded ? ((daily.spentAmount ?? 0) === 0 ? '🔋 기분 최고! (무지출 상태)' : '🥱 지출 발생으로 피곤함') : '💤 기록을 기다리는 중...'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 👥 짠물 계모임 (비참여 상태) */}
      {!group ? (
        <div className="glass-card pot-card-cta">
          <div className="pot-cta-header">
            <span className="pot-cta-emoji"><CustomIcon emoji="👥" /></span>
            <div>
              <p className="pot-cta-title">우리끼리 예산 수비, 짠물 계모임</p>
              <p className="pot-cta-desc">친구들과 함께 주간 예산을 정하고, 공동 목표를 함께 수비해 보세요!</p>
            </div>
          </div>
          {showInviteInput ? (
            <div className="pot-invite-row">
              <input
                className="nickname-input pot-invite-input"
                placeholder="초대 코드 입력 (예: AB12CD)"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && inviteCode.trim()) handleJoinGroup(); }}
                maxLength={10}
                autoFocus
              />
              <button className="pot-btn pot-btn-join" onClick={handleJoinGroup} disabled={!inviteCode.trim()}>
                참여
              </button>
              <button className="pot-btn pot-btn-cancel" onClick={() => { setShowInviteInput(false); setInviteCode(''); }}>
                취소
              </button>
            </div>
          ) : (
            <div className="pot-btn-row">
              <button className="pot-btn pot-btn-create" onClick={handleCreateGroup}>
                방 개설하기 <CustomIcon emoji="🍳" />
              </button>
              <button className="pot-btn pot-btn-invite-cta" onClick={() => setShowInviteInput(true)}>
                초대코드 입력
              </button>
            </div>
          )}
        </div>
      ) : (
        /* 👥 짠물 계모임 (참여 상태) */
        (() => {
          const myRow = weekRank.find((r) => r.user_id === userId);
          const mySpend = myRow ? myRow.total : 0;
          const combinedSpend = mySpend + group.members.reduce((sum, m) => sum + m.spent, 0);
          const ratio = Math.min(100, Math.round((combinedSpend / group.budget) * 100));
          
          let progressColorClass = 'pot-bar--safe';
          if (ratio >= 90) {
            progressColorClass = 'pot-bar--danger';
          } else if (ratio >= 70) {
            progressColorClass = 'pot-bar--warning';
          }

          return (
            <div className="glass-card pot-card-active" onClick={() => setShowGroupModal(true)}>
              <div className="pot-active-header">
                <div className="pot-active-title-wrap">
                  <span className="pot-active-emoji"><CustomIcon emoji="👥" /></span>
                  <div>
                    <p className="pot-active-title">{renderTextWithEmoji(group.name)}</p>
                    <p className="pot-active-subtitle">초대코드: <span className="pot-code-highlight">{group.id}</span></p>
                  </div>
                </div>
                <span className="pot-active-badge">레이드 진행 중</span>
              </div>

              {/* 👾 주간 보스 레이드 */}
              {group.raid && (() => {
                const r = group.raid;
                const hpPct = Math.round((r.bossHp / r.bossMaxHp) * 100);
                return (
                  <div className="pot-raid-board" onClick={(e) => { e.stopPropagation(); setShowGroupModal(true); }}>
                    <div className="pot-raid-boss-info">
                      <div className="pot-raid-boss-avatar-wrap">
                        <span>👾</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="pot-raid-boss-name">{r.bossName}</span>
                          <span className="pot-raid-boss-hp-text">{r.bossHp} / {r.bossMaxHp} HP</span>
                        </div>
                        <p className="pot-raid-boss-weakness">
                          <span className="pot-weakness-badge">약점</span> <CustomIcon emoji={r.bossWeaknessEmoji} /> {r.bossWeaknessCategory.split('/')[0]} 지출 시 치유됨!
                        </p>
                      </div>
                    </div>
                    <div className="pot-raid-hp-bar-track">
                      <div 
                        className={`pot-raid-hp-bar-fill ${r.raidCompleted ? 'pot-raid-hp--defeated' : ''}`}
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                    {r.raidCompleted && (
                      <p className="pot-raid-victory-banner">🎉 보스 퇴치 완료! 이번 주 럭키 박스를 획득했습니다.</p>
                    )}
                  </div>
                );
              })()}

              <div className="pot-progress-section">
                <div className="pot-progress-labels">
                  <span className="pot-progress-amount">
                    공동 소비: {formatAmount(combinedSpend)} <span className="pot-progress-max">/ {formatAmount(group.budget)}</span>
                  </span>
                  <span className="pot-progress-percent">{ratio}%</span>
                </div>
                <div className="pot-progress-track">
                  <div className={`pot-progress-fill ${progressColorClass}`} style={{ width: `${ratio}%` }} />
                </div>
              </div>

              <div className="pot-active-footer">
                <span className="pot-footer-desc">
                  현재 {group.members.length + 1}명 참여 중 · 탭해서 공격/치유 상세 기록 확인
                </span>
                <span className="pot-footer-arrow">›</span>
              </div>
            </div>
          );
        })()
      )}

      {/* 짠물 계모임 상세 모달 */}
      <SimpleModal open={showGroupModal} onClose={() => setShowGroupModal(false)}>
        {group && (() => {
          const myName = getNickname() || '나';
          const myPersona = getPersona() || 'hamster';
          const myRow = weekRank.find((r) => r.user_id === userId);
          const mySpend = myRow ? myRow.total : 0;
          
          return (
            <div className="pot-modal-content" style={{ width: '100%' }}>
              <div className="pot-modal-header-row">
                <div>
                  <h3 className="simple-modal-title"><CustomIcon emoji="👥" /> {renderTextWithEmoji(group.name)}</h3>
                  <p className="simple-modal-desc">주간 예산: {formatAmount(group.budget)} (코드: {group.id})</p>
                </div>
                <button className="pot-leave-btn" onClick={handleLeaveGroup}>모임 탈퇴</button>
              </div>

              {/* 👾 몬스터 레이드 현황판 (모달 내부) */}
              {group.raid && (() => {
                const r = group.raid;
                const hpPct = Math.round((r.bossHp / r.bossMaxHp) * 100);
                return (
                  <div className="pot-modal-raid-status glass-card" style={{ padding: '16px', background: 'var(--bg)', borderRadius: '16px', border: '1px solid var(--border)', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary)' }}>👾 주간 보스 레이드</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: r.raidCompleted ? 'var(--success)' : 'var(--text-main)' }}>
                        {r.raidCompleted ? '퇴치 완료! ✓' : '전투 진행 중'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
                      <span style={{ fontSize: '24px' }}>👾</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>
                          <span>{r.bossName}</span>
                          <span>{r.bossHp} / {r.bossMaxHp} HP ({hpPct}%)</span>
                        </div>
                        <div style={{ height: '8px', background: 'rgba(0,0,0,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${hpPct}%`, background: r.raidCompleted ? 'var(--success)' : 'linear-gradient(90deg, #ff4d4f, #ff7875)', transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-sub)', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      ⚡ <span style={{ fontWeight: 800, color: 'var(--warning)' }}>약점:</span> <CustomIcon emoji={r.bossWeaknessEmoji} /> {r.bossWeaknessCategory.split('/')[0]} 지출 시 보스가 회복합니다! (무지출 인증 시 ⚔️ 300 데미지)
                    </p>
                  </div>
                );
              })()}

              {/* 멤버 현황 리스트 */}
              <div className="pot-members-list">
                <p className="pot-section-label">멤버별 지출 현황</p>
                
                {/* 1. 로그인 유저 */}
                {(() => {
                  const p = PERSONAS[myPersona];
                  return (
                    <div className="pot-member-row pot-member-row--me">
                      <div className="pot-member-info">
                        <div className="pot-member-avatar" style={{ border: `1.5px solid ${p?.color || '#FF5E62'}` }}>
                          <img src={p?.icon} alt="" />
                        </div>
                        <div>
                          <p className="pot-member-name">
                            {myName} <span className="pot-me-tag">나</span>
                          </p>
                          <p className="pot-member-persona" style={{ color: p?.color }}>{p?.name}</p>
                        </div>
                      </div>
                      <span className="pot-member-amount">{formatAmount(mySpend)}</span>
                    </div>
                  );
                })()}

                {/* 2. Mock 멤버들 */}
                {group.members.map((member, i) => {
                  const p = PERSONAS[member.persona];
                  return (
                    <div key={i} className="pot-member-row">
                      <div className="pot-member-info">
                        <div className="pot-member-avatar" style={{ border: `1.5px solid ${p?.color || '#FF5E62'}` }}>
                          <img src={p?.icon} alt="" />
                        </div>
                        <div>
                          <p className="pot-member-name">{member.name}</p>
                          <p className="pot-member-persona" style={{ color: p?.color }}>{p?.name}</p>
                        </div>
                      </div>
                      <div className="pot-member-right">
                        <span className="pot-member-amount">{formatAmount(member.spent)}</span>
                        <button className="pot-nudge-btn" onClick={() => handleNudgeMember(member.name)}>
                          한마디 보내기 🤝
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 실시간 활동 로그 */}
              <div className="pot-history-section">
                <p className="pot-section-label">실시간 계모임 신호 📡</p>
                <div className="pot-history-list">
                  {group.nudgeHistory.length === 0 ? (
                    <p className="pot-history-empty">아직 활동 신호가 없습니다.</p>
                  ) : (
                    group.nudgeHistory.map((log, idx) => (
                      <div key={idx} className="pot-history-row">
                        <span className="pot-history-bullet">·</span>
                        <span className="pot-history-text">{log}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ marginTop: '16px' }}>
                <Button display="full" size="large" color="primary" variant="fill" onClick={() => setShowGroupModal(false)}>
                  닫기
                </Button>
              </div>
            </div>
          );
        })()}
      </SimpleModal>

      {/* 짠물 계모임 내부용 간이 토스트 알림 */}
      {potToast && (
        <div className="point-toast pot-toast-overlay">{renderTextWithEmoji(potToast)}</div>
      )}

      {/* 펜딩 포인트 (광고 보고 받기) */}
      {pendingPoints > 0 && (
        <div className="glass-card pending-points-card">
          <div className="pending-points-row">
            <div className="pending-points-left">
              <img
                src={pendingClaiming ? "/images/lucky_chest_opened.png" : "/images/lucky_chest_closed.png"}
                alt="Lucky Chest"
                className="lucky-chest-img lucky-chest-bob"
              />
              <div>
                <p className="pending-points-title">적립된 토스포인트</p>
                <p className="pending-points-sub">리워드 광고를 시청하면 지급됩니다 · 최대 50원</p>
              </div>
            </div>
            <span className="pending-points-amount">{pendingPoints}원</span>
          </div>
          {pendingPoints >= MAX_PENDING_POINTS && (
            <p className="pending-points-cap-warning">
              <CustomIcon emoji="⚠️" /> 적립 한도에 도달했어요. 미리 받으세요 · 최대 50원까지만 받을 수 있어요
            </p>
          )}
          <button className="pending-claim-btn" onClick={onClaimPending} disabled={pendingClaiming}>
            {pendingClaiming ? '광고 시청 중...' : '광고 보고 받기'}
          </button>
        </div>
      )}

      {/* 스트릭 로드맵 */}
      <div className="glass-card streak-card">
        <div className="streak-header-row">
          <span className="streak-title">연속 기록</span>
          <div className="streak-badges-row">
            {streakShields > 0 && (
              <Badge size="small" color="blue" variant="weak"><CustomIcon emoji="🛡️" /> 보호권 {streakShields}개</Badge>
            )}
            {streak.streak > 0 && (
              <Badge size="small" color="red" variant="weak">
                <img src="/images/icon_flame.png" className="custom-icon--sm" />
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
                      <img src="/images/lucky_chest_opened.png" className="custom-icon streak-node-icon streak-node-icon--lg" />
                    ) : (
                      <img src="/images/lucky_chest_closed.png" className="custom-icon streak-node-icon streak-node-icon--lg streak-node-icon--muted" />
                    )
                  ) : isDone ? (
                    <svg width="12" height="9" viewBox="0 0 12 9" fill="none" className="svg-primary">
                      <path d="M1 4.5L4 7.5L11 1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : isCurrent ? (
                    <img src="/images/icon_flame.png" className="custom-icon streak-node-icon streak-node-icon--md" />
                  ) : (
                    <img src="/images/icon_lock.png" className="custom-icon streak-node-icon streak-node-icon--sm" />
                  )}
                </div>
                <div className="streak-day-label">{i + 1}일</div>
              </div>
            );
          })}
        </div>
        {streak.streak > 0 && streak.streak % 7 === 0 && pendingPoints > 0 && (
          <p className="streak-reward-hint"><CustomIcon emoji="🔥" /> 7일 연속 완주 보너스 포함 · 위에서 광고 보고 받기</p>
        )}
      </div>



      {/* 오늘의 짠물 미션 */}
      {(() => {
        const mission = getDailyMission(daily.date);
        return (
          <div className="glass-card daily-mission-card">
            <div className="mission-header-row">
              <span className="mission-title">
                오늘의 짠물 미션
                <img src="/images/icon_target.png" className="custom-icon" />
              </span>
              {mission.completed ? (
                <span className="mission-completed-badge">🎉 미션 완료</span>
              ) : (
                <span className="mission-badge">진행 중</span>
              )}
            </div>
            <div className="mission-content">
              <div>
                <p className="mission-text">{mission.action}</p>
              </div>
              <div>
                {mission.completed ? (
                  <span className="mission-completed-row">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="svg-primary">
                      <circle cx="6" cy="6" r="5.25" fill="rgba(0, 245, 160, 0.1)" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M4 6L5.5 7.5L8 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    달성
                  </span>
                ) : (
                  <span className="mission-reward">도전 중</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 이번 주 내 현황 */}
      {myRow && (
        <div className="glass-card week-summary-card">
          <p className="week-summary-label">이번 주 내 소비</p>
          <p className="week-summary-amount">{formatAmount(myRow.total)}</p>
          <div className="week-summary-meta">
            <Badge size="small" color="blue" variant="weak">{myRow.days}일 기록</Badge>
            {inSpendGroup && (
              <Badge size="small" color={mySpendIdx === 0 ? 'yellow' : 'elephant'} variant="weak">
                {mySpendIdx === 0 ? '👑 ' : ''}{mySpendIdx + 1}위 / {spendGroup.length}명
              </Badge>
            )}
            {inZeroGroup && (
              <Badge size="small" color="green" variant="weak">
                {renderTextWithEmoji(`👑 무지출 ${myZeroIdx + 1}번째`)}
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* 순위 미리보기 — 유지출 그룹 상위 3명 */}
      {spendGroup.length > 0 && (
        <div className="glass-card rank-preview-card">
          <p className="rank-preview-title">이번 주 절약왕 <CustomIcon emoji="🏆" /></p>
          <div className="rank-preview-list">
            {spendGroup.slice(0, 3).map((row, i) => (
              <div key={row.user_id} className={`rank-preview-row ${row.user_id === userId ? 'rank-mine' : ''}`}>
                <div className="rank-preview-row-info">
                  <span className="rank-medal"><CustomIcon emoji={i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'} /></span>
                  <span className="rank-nickname">{row.nickname}</span>
                </div>
                <span className="rank-amount">{formatAmount(row.total)}</span>
              </div>
            ))}
          </div>
          {zeroGroup.length > 0 && (
            <p className="rank-preview-zero-note">{renderTextWithEmoji(`👑 무지출 인증단 ${zeroGroup.length}명 참여 중`)}</p>
          )}
        </div>
      )}

      {/* 하단 배너 광고 */}
      <BannerAdSlot adGroupId={BANNER_AD_ID} />

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
          <div className="tutorial-overlay">
            {/* 스포트라이트 안내 카드 */}
            <div className="tutorial-card glass-card">
              <button
                onClick={() => {
                  localStorage.setItem('savelog_tutorial_completed', 'true');
                  setTutorialStep(null);
                }}
                className="tutorial-skip-btn"
              >
                건너뛰기
              </button>
              <span className="tutorial-icon"><CustomIcon emoji={current.icon} /></span>
              <h3 className="tutorial-title">{renderTextWithEmoji(current.title)}</h3>
              <p className="tutorial-desc">{current.desc}</p>
              <button
                onClick={() => {
                  if (tutorialStep < 3) {
                    setTutorialStep(tutorialStep + 1);
                  } else {
                    localStorage.setItem('savelog_tutorial_completed', 'true');
                    setTutorialStep(null);
                  }
                }}
                className="tutorial-next-btn"
              >
                {tutorialStep === 3 ? "가이드 마치고 시작하기! 🎉" : "다음으로 〉"}
              </button>
            </div>

            {/* 스포트라이트 인디케이터 도트 */}
            <div className="tutorial-dots">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`tutorial-dot${step === tutorialStep ? ' tutorial-dot--active' : ''}`}
                />
              ))}
            </div>
          </div>
        );
      })()}

      <div className="rank-bottom-spacer" />
    </div>
  );
}
