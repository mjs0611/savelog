import React, { useState, useEffect } from 'react';
import { Badge, Button } from '@toss/tds-mobile';

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

import type { Entry, WeekRankRow } from '../lib/supabase';
import { fetchMyWeekEntries, fetchMyAllEntries, fetchMyImageEntries, submitEntry, toggleFollowSupabase, fetchFollows, fetchFollowedPersonas, fetchMyNotifications, markNotificationsRead } from '../lib/supabase';
import type { StreakData, CheeringMessage, DailyState } from '../lib/storage';
import { setNickname, getPersona, PERSONAS, getCheeringMessages, sendCheeringMessage, getWeeklyBudget, setWeeklyBudget, getFollowedUsers, saveFollowedUsers, getJellyPockets, setJellyPockets } from '../lib/storage';
import { formatAmount, getWeekKey, timeAgo, getTodayStr } from '../lib/utils';
import { getPrevWeekKey } from '../lib/benchmark';
import { shareExternal, buildTempBragMessage, buildWrappedBragMessage, openContactsInvite } from '../lib/share';
import CustomIcon from '../components/CustomIcon';
import JellyPockets from '../components/JellyPockets';
import MyCockpit from '../components/MyCockpit';
import MoneyMemory from '../components/MoneyMemory';
import SpendDiagnosisCard from '../components/SpendDiagnosisCard';
import GuideModal from '../components/GuideModal';

interface Props {
  userId: string;
  nickname: string;
  streak: StreakData;
  onNicknameChange: (name: string) => void;
  onStartTest: () => void;
  refreshToken?: number;
  onShieldEarned?: (count: number) => void;
  weekRank?: WeekRankRow[];
  daily?: DailyState;
  pendingPoints?: number;
  pendingClaiming?: boolean;
  onClaimPending?: () => void;
  onShareToChat?: (entry: any) => void;
  onOpenRanking?: () => void;
}

export default function ProfileScreen({ userId, nickname, streak, onNicknameChange, onStartTest, refreshToken = 0, onShieldEarned, weekRank = [], daily, pendingPoints = 0, pendingClaiming = false, onClaimPending, onShareToChat, onOpenRanking }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(nickname);
  
  React.useEffect(() => {
    if (!editing) setDraft(nickname);
  }, [nickname, editing]);

  const [myEntries, setMyEntries] = useState<Entry[]>([]);       // 이번 주 (통계용)
  const [allEntries, setAllEntries] = useState<Entry[]>([]);     // 전체 기록 (RecordsTab용)
  const [galleryEntries, setGalleryEntries] = useState<Entry[]>([]); // 이미지 있는 전체 entries (GalleryTab용, social/milestone 포함)
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [entriesError, setEntriesError] = useState(false);
  const [entriesRetry, setEntriesRetry] = useState(0);
  const [messages, setMessages] = useState<CheeringMessage[]>(() => getCheeringMessages());
  const [clearConfirm, setClearConfirm] = useState(false);
  const clearConfirmTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const [marketingModalOpen, setMarketingModalOpen] = useState(false);
  const [replyModalOpen, setReplyModalOpen] = useState(false);
  const [replyRecipient, setReplyRecipient] = useState('');
  const [replyText, setReplyText] = useState('');

  const [showFollows, setShowFollows] = useState(false);
  const [followedList, setFollowedList] = useState<Record<string, string>>({});
  const [followedPersonas, setFollowedPersonas] = useState<Record<string, string>>({});

  useEffect(() => {
    if (showFollows) {
      const localFollows = getFollowedUsers();
      setFollowedList(localFollows);
      
      const followedIds = Object.keys(localFollows);
      if (followedIds.length > 0) {
        fetchFollowedPersonas(followedIds).then((personasMap) => {
          setFollowedPersonas(personasMap);
        });
      }

      fetchFollows(userId).then((dbFollows) => {
        if (dbFollows) {
          saveFollowedUsers(dbFollows);
          setFollowedList(dbFollows);
          const dbIds = Object.keys(dbFollows);
          if (dbIds.length > 0) {
            fetchFollowedPersonas(dbIds).then((personasMap) => {
              setFollowedPersonas(personasMap);
            });
          }
        }
      });
    }
  }, [showFollows, userId]);

  const [subTab, setSubTab] = useState<'records' | 'gallery' | 'stats' | 'mailbox'>('records');

  const [budget, setBudget] = useState(getWeeklyBudget());
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(budget.toString());

  useEffect(() => {
    const handleUpdate = () => {
      setBudget(getWeeklyBudget());
    };
    window.addEventListener('savelog_budget_updated', handleUpdate);
    return () => window.removeEventListener('savelog_budget_updated', handleUpdate);
  }, []);

  function handleSaveBudget() {
    const val = parseInt(budgetDraft.replace(/,/g, ''), 10);
    if (!isNaN(val) && val > 0) {
      setWeeklyBudget(val);
      setBudget(val);
      const current = getJellyPockets();
      const totalCurrent = current.reduce((s, p) => s + p.budget, 0);
      if (totalCurrent > 0) {
        const updated = current.map(p => ({
          ...p,
          budget: Math.round(val * (p.budget / totalCurrent))
        }));
        setJellyPockets(updated);
      }
      window.dispatchEvent(new Event('savelog_budget_updated'));
    }
    setShowBudgetEdit(false);
  }

  function handleShare() {
    // 실제 발송 완료 수만큼 모달 close 시점에 보상 (오픈 직후 재생 이벤트는 무시)
    openContactsInvite(onShieldEarned);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setEntriesLoading(true);
      setEntriesError(false);
      try {
        const [weekData, allData, imageData] = await Promise.all([
          fetchMyWeekEntries(userId, getWeekKey()),
          fetchMyAllEntries(userId),
          fetchMyImageEntries(userId),
        ]);
        if (!cancelled) {
          if (weekData === null) {
            setEntriesError(true);
          } else {
            setMyEntries(weekData);
          }
          if (allData !== null) setAllEntries(allData);
          if (imageData !== null) setGalleryEntries(imageData);
        }
      } catch {
        if (!cancelled) setEntriesError(true);
      } finally {
        if (!cancelled) setEntriesLoading(false);
      }
    })();
    setMessages(getCheeringMessages());

    // 원격 알림 (팔로우/응원) → mailbox 표시용 CheeringMessage로 머지
    fetchMyNotifications(userId).then((notifs) => {
      if (cancelled || notifs.length === 0) return;
      const remoteMsgs: CheeringMessage[] = notifs.map((n) => ({
        id: `notif-${n.id}`,
        senderNickname: n.sender_nickname,
        senderPersonaEmoji: n.type === 'follow' ? '👥' : '💌',
        senderPersonaColor: n.type === 'follow' ? '#3182F6' : '#FF7E8D',
        text: n.type === 'follow' ? `${n.sender_nickname}님이 회원님을 팔로우했어요!` : (n.message || ''),
        timestamp: timeAgo(n.created_at),
        created_at: n.created_at,
        sentByMe: false,
      }));
      setMessages((prev) => {
        const existingIds = new Set(prev.map(m => m.id));
        const newOnes = remoteMsgs.filter(m => !existingIds.has(m.id));
        if (newOnes.length === 0) return prev;
        return [...newOnes, ...prev];
      });
      markNotificationsRead(userId).catch(() => {});
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [userId, refreshToken, entriesRetry]);

  useEffect(() => {
    return () => {
      if (clearConfirmTimerRef.current) clearTimeout(clearConfirmTimerRef.current);
    };
  }, []);

  function handleReplyClick(recipient: string) {
    setReplyRecipient(recipient);
    setReplyText('');
    setReplyModalOpen(true);
  }

  function handleSendReply() {
    if (!replyText.trim()) return;
    sendCheeringMessage(replyRecipient, replyText.trim(), nickname, getPersona());
    setMessages(getCheeringMessages());
    setReplyModalOpen(false);
    setReplyRecipient('');
    setReplyText('');
  }

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
  const zeroDays = myEntries.filter(e => e.total_amount === 0).length;
  const recordedDays = new Set(myEntries.map(e => e.date)).size;

  const personaKey = getPersona();
  const p = personaKey ? PERSONAS[personaKey] : null;

  const getLevel = (totalDays: number) => {
    if (totalDays < 7) return 1;
    if (totalDays < 14) return 2;
    if (totalDays < 30) return 3;
    if (totalDays < 60) return 4;
    return 5;
  };
  const level = getLevel(streak.totalDays);

  return (
    <div className="screen screen-mylog">
      {/* 1. Profile Header */}
      <div className="glass-card mylog-profile-header">
        <div className="mylog-header-top">
          <div className="mylog-profile-info">
            <div className="mylog-avatar-wrapper">
              <span className="mylog-avatar">
                {p ? <img src={p.icon} alt="" className="custom-icon--xl" /> : <CustomIcon emoji="🐷" />}
              </span>
              <span className="mylog-level-badge">LV.{level}</span>
            </div>
            <div className="mylog-user-meta">
              <div className="mylog-nickname-row">
                <span className="mylog-nickname">{nickname}</span>
                <div className="mylog-header-actions">
                  <button className="mylog-edit-btn" onClick={() => setShowFollows(true)}><CustomIcon emoji="👥" /></button>
                  {onOpenRanking && (
                    <button className="mylog-edit-btn" onClick={onOpenRanking} title="주간 랭킹"><CustomIcon emoji="🏆" /></button>
                  )}
                  <button className="mylog-edit-btn" onClick={() => setShowSettings(true)}><CustomIcon emoji="⚙️" /></button>
                </div>
              </div>
              {p ? (
                <span className="mylog-persona-badge" style={{ color: p.color, background: `${p.color}15` }}>
                  {p.name}
                </span>
              ) : (
                <span className="mylog-persona-badge mylog-persona-badge--empty" onClick={onStartTest}>
                  소비 성향 테스트하기 ›
                </span>
              )}
              <span className="mylog-streak"><CustomIcon emoji="🔥" /> {streak.streak}일 연속 기록중</span>
            </div>
          </div>
        </div>

        <div className="mylog-summary-row">
          <div className="mylog-summary-item">
            <span className="mylog-summary-label">이번 주 총지출</span>
            <span className="mylog-summary-value">{formatAmount(weekTotal)}</span>
          </div>
          <div className="mylog-summary-item">
            <span className="mylog-summary-label">기록일수</span>
            <span className="mylog-summary-value">{recordedDays}일</span>
          </div>
          <div className="mylog-summary-item">
            <span className="mylog-summary-label">지갑 힐링</span>
            <span className="mylog-summary-value">{zeroDays}일</span>
          </div>
        </div>

        {/* Budget Progress */}
        <div className="mylog-budget-container">
          <div className="mylog-budget-header">
            <span className="mylog-budget-title">이번 주 예산</span>
            <button className="mylog-budget-edit" onClick={() => { setBudgetDraft(budget.toString()); setShowBudgetEdit(true); }}>
              {formatAmount(budget)} ✎
            </button>
          </div>
          <div className="mylog-budget-bar">
            <div
              className="mylog-budget-fill"
              style={{
                width: `${Math.min(100, (weekTotal / budget) * 100)}%`,
                background: weekTotal > budget 
                  ? 'linear-gradient(90deg, #FF4D4F, #FF7875)' 
                  : 'linear-gradient(90deg, var(--primary), var(--accent-pink))',
                boxShadow: weekTotal > budget
                  ? '0 0 8px rgba(255, 77, 79, 0.6)'
                  : '0 0 8px rgba(139, 92, 246, 0.6)'
              }}
            />
          </div>
          <div className="mylog-budget-footer">
            <span style={{ color: weekTotal > budget ? 'var(--error)' : 'var(--text-sub)' }}>
              {weekTotal > budget ? `예산 초과 (${formatAmount(weekTotal - budget)})` : `${formatAmount(budget - weekTotal)} 남음`}
            </span>
          </div>
        </div>

        {/* 디지털 젤리 저금통 (Envelope Budgeting) */}
        <JellyPockets />
      </div>

      {/* 🐹 내 절약 코쿼핏 (리워드·펫·목표·듀오) — 피드에서 마이로그로 이동 */}
      {daily && onClaimPending && (
        <MyCockpit userId={userId} daily={daily} streak={streak} weekRank={weekRank} pendingPoints={pendingPoints} pendingClaiming={pendingClaiming} onClaimPending={onClaimPending} />
      )}

      {/* 💎 머니 회고 (재정 기억 복리) */}
      <MoneyMemory userId={userId} />

      {/* 2. Sub-tab Navigation */}
      <div className="mylog-subtab-bar">
        {(['records', 'gallery', 'stats', 'mailbox'] as const).map(t => (
          <button
            key={t}
            className={`mylog-subtab-btn ${subTab === t ? 'mylog-subtab-btn--active' : ''}`}
            onClick={() => setSubTab(t)}
          >
            {t === 'records' ? <><CustomIcon emoji="📋" /> 기록</> : t === 'gallery' ? <><CustomIcon emoji="🖼️" /> 갤러리</> : t === 'stats' ? <><CustomIcon emoji="📊" /> 통계</> : <><CustomIcon emoji="✉️" /> 쪽지</>}
          </button>
        ))}
      </div>

      {/* 3,4,5. Tab Contents */}
      <div className="mylog-tab-content">
        {entriesLoading ? (
          <div className="mylog-loading">
            <div className="skeleton-card" style={{ height: '200px' }} />
          </div>
        ) : entriesError ? (
          <div className="mylog-error">
            <p>데이터를 불러오지 못했어요</p>
            <button onClick={() => setEntriesRetry(n => n + 1)}>다시 시도</button>
          </div>
        ) : (
          <>
            {subTab === 'records' && <RecordsTab entries={allEntries.length > 0 ? allEntries : myEntries} onShareToChat={onShareToChat} />}
            {subTab === 'gallery' && <GalleryTab entries={galleryEntries.length > 0 ? galleryEntries : (allEntries.length > 0 ? allEntries : myEntries)} />}
            {subTab === 'stats' && <StatsTab entries={myEntries} allEntries={allEntries} lastWeekEntries={allEntries.filter(e => e.week_key === getPrevWeekKey(getWeekKey()))} streak={streak} personaKey={personaKey} p={p} messages={messages} nickname={nickname} daily={daily} weekTotal={weekTotal} zeroDays={zeroDays} />}
            {subTab === 'mailbox' && <MailboxTab messages={messages} handleClearAllMessages={handleClearAllMessages} clearConfirm={clearConfirm} handleReplyClick={handleReplyClick} nickname={nickname} />}
          </>
        )}
      </div>

      <div className="rank-bottom-spacer" />

      {/* Budget Edit Modal */}
      <SimpleModal open={showBudgetEdit} onClose={() => setShowBudgetEdit(false)}>
        <div style={{ width: '100%' }}>
          <h3 className="simple-modal-title">주간 예산 설정</h3>
          <p className="simple-modal-desc">이번 주 목표 지출액을 설정해보세요.</p>
          <input
            className="nickname-input"
            style={{ width: '100%', marginTop: '16px', fontSize: '20px', textAlign: 'center' }}
            type="text"
            inputMode="numeric"
            value={budgetDraft.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
            onChange={e => setBudgetDraft(e.target.value.replace(/\D/g, ''))}
          />
          <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: '16px' }}>
            <Button display="full" size="large" color="dark" variant="weak" onClick={() => setShowBudgetEdit(false)}>취소</Button>
            <Button display="full" size="large" color="primary" variant="fill" onClick={handleSaveBudget} disabled={!budgetDraft || budgetDraft === '0'}>저장</Button>
          </div>
        </div>
      </SimpleModal>

      {/* 6. Settings Modal */}
      <SimpleModal open={showSettings} onClose={() => setShowSettings(false)}>
        <div className="settings-sheet">
          <h3 className="simple-modal-title" style={{ marginBottom: '16px' }}>설정</h3>
          
          <div className="settings-section">
            <h4 className="settings-section-title">프로필</h4>
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
              <div className="setting-menu-item" onClick={() => setEditing(true)}>
                <span>닉네임 수정</span>
                <span className="setting-value">{nickname} ›</span>
              </div>
            )}
            <div className="setting-menu-item" onClick={() => { setShowSettings(false); onStartTest(); }}>
              <span>소비 성향 재분석</span>
              <span className="setting-arrow">›</span>
            </div>
            <div className="setting-menu-item" onClick={() => { setShowSettings(false); setShowGuide(true); }}>
              <span>❓ savelog 사용법</span>
              <span className="setting-arrow">›</span>
            </div>
          </div>

          <div className="settings-section">
            <h4 className="settings-section-title">혜택 및 보호권</h4>
            <div className="setting-menu-item" onClick={() => { setShowSettings(false); handleShare(); }}>
              <span><CustomIcon emoji="🛡️" /> 친구 공유하고 스트릭 보호권 받기</span>
              <span className="setting-arrow">›</span>
            </div>
            <div className="glass-card how-to-card" style={{ marginTop: '12px' }}>
              <p className="how-to-title">포인트 획득 방법</p>
              <div className="how-to-rows">
                <div className="how-to-row"><span><CustomIcon emoji="📝" /> 매일 기록</span><span className="how-to-reward-muted">+3원 대기</span></div>
                <div className="how-to-row"><span><CustomIcon emoji="🏆" /> 주간 순위 보상</span><span className="how-to-reward-muted">순위별 지급</span></div>
                <div className="how-to-row how-to-row--note"><span>└ 광고 시청 후 토스포인트 지급</span><span /></div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h4 className="settings-section-title">서비스 정보</h4>
            <div
              className="setting-menu-item"
              onClick={() => {
                localStorage.removeItem('savelog_tutorial_completed');
                window.location.reload();
              }}
            >
              <span><CustomIcon emoji="🎓" /> 가이드 튜토리얼 다시 보기</span>
              <span className="setting-arrow">›</span>
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

          <Button display="full" size="large" color="dark" variant="weak" onClick={() => setShowSettings(false)} style={{ marginTop: '16px' }}>
            닫기
          </Button>
        </div>
      </SimpleModal>

      <GuideModal open={showGuide} onClose={() => setShowGuide(false)} />

      {/* 기존 모달들 유지 */}
      <SimpleModal open={termsModalOpen} onClose={() => setTermsModalOpen(false)}>
        <div>
          <h3 className="simple-modal-title">서비스 이용약관</h3>
          <p className="simple-modal-desc">세이브로그 서비스 이용 동의서</p>
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

      <SimpleModal open={marketingModalOpen} onClose={() => setMarketingModalOpen(false)}>
        <div>
          <h3 className="simple-modal-title">마케팅 정보 수신 동의</h3>
          <p className="simple-modal-desc">혜택 알림 및 이벤트 정보 안내</p>
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

      <SimpleModal open={replyModalOpen} onClose={() => setReplyModalOpen(false)}>
        <div>
          <h3 className="simple-modal-title"><CustomIcon emoji="✉️" /> {replyRecipient}님에게 답장하기</h3>
          <p className="simple-modal-desc">따뜻한 격려나 꿀팁을 전해보세요</p>
        </div>
        <div style={{ width: '100%' }}>
          <textarea
            className="nickname-input"
            style={{
              width: '100%',
              minHeight: '80px',
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#fff',
              fontSize: '13px',
              resize: 'none',
              lineHeight: '1.5',
              boxSizing: 'border-box'
            }}
            value={replyText}
            placeholder="응원의 메시지를 입력해 주세요."
            maxLength={100}
            onChange={(e) => setReplyText(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '10px', color: 'var(--text-mute)', marginTop: '4px', paddingRight: '4px' }}>
            {replyText.length}/100
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
          <Button display="full" size="large" color="dark" variant="weak" onClick={() => setReplyModalOpen(false)}>취소</Button>
          <Button display="full" size="large" color="primary" variant="fill" onClick={handleSendReply} disabled={!replyText.trim()}>보내기</Button>
        </div>
      </SimpleModal>

      <SimpleModal open={showFollows} onClose={() => setShowFollows(false)}>
        <div className="friends-list-modal" style={{ width: '100%' }}>
          <h3 className="simple-modal-title"><CustomIcon emoji="👥" /> 내 짠친구</h3>
          <p className="simple-modal-desc">함께 절약하는 든든한 친구들이에요.</p>
          
          <div className="friends-scroll-area" style={{ maxHeight: '280px', overflowY: 'auto', marginTop: '16px', marginBottom: '16px' }}>
            {Object.keys(followedList).length === 0 ? (
              <div className="friends-empty-state" style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-mute)', fontSize: '13px' }}>
                아직 팔로우한 친구가 없어요. <br /> 피드에서 마음 맞는 친구를 팔로우해 보세요!
              </div>
            ) : (
              Object.entries(followedList).map(([friendId, friendNickname]) => {
                const personaKey = followedPersonas[friendId];
                const fp = personaKey ? PERSONAS[personaKey] : null;
                return (
                  <div key={friendId} className="friend-row-card">
                    <div className="friend-row-profile">
                      <div className="friend-avatar-circle">
                        {fp ? <img src={fp.icon} alt="" className="custom-icon--md" /> : <CustomIcon emoji="🐷" />}
                      </div>
                      <div className="friend-row-meta">
                        <span className="friend-row-nickname">{friendNickname}</span>
                        {fp && (
                          <span className="friend-row-persona" style={{ color: fp.color, background: `${fp.color}15` }}>
                            {fp.name}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="friend-row-actions">
                      <button 
                        className="friend-action-btn friend-action-btn--note" 
                        onClick={() => {
                          setShowFollows(false);
                          handleReplyClick(friendNickname);
                        }}
                      >
                        <CustomIcon emoji="✉️" /> 쪽지
                      </button>
                      <button
                        className="friend-action-btn friend-action-btn--unfollow"
                        onClick={async () => {
                          // 낙관적 업데이트 — UI에서 즉시 제거
                          const prevLocal = getFollowedUsers();
                          const next = { ...prevLocal };
                          delete next[friendId];
                          saveFollowedUsers(next);
                          setFollowedList((prev) => {
                            const n = { ...prev };
                            delete n[friendId];
                            return n;
                          });
                          // 원격 동기화 — 실패 시 롤백
                          const { error } = await toggleFollowSupabase(userId, friendId, friendNickname);
                          if (error) {
                            saveFollowedUsers(prevLocal);
                            setFollowedList(prevLocal);
                            alert('언팔로우에 실패했어요. 잠시 후 다시 시도해 주세요.');
                          }
                        }}
                      >
                        ✕ 취소
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          <Button display="full" size="large" color="dark" variant="weak" onClick={() => setShowFollows(false)}>
            닫기
          </Button>
        </div>
      </SimpleModal>
    </div>
  );
}

// ── Sub-tab Components ────────────────────────────────────────────────────────

function RecordsTab({ entries, onShareToChat }: { entries: Entry[]; onShareToChat?: (entry: any) => void }) {
  if (entries.length === 0) {
    return <div className="mylog-empty">아직 기록이 없어요 <CustomIcon emoji="📝" /></div>;
  }

  // Group by date
  const grouped = entries.reduce((acc, curr) => {
    if (!acc[curr.date]) acc[curr.date] = { total: 0, items: [] };
    acc[curr.date].total += curr.total_amount;
    acc[curr.date].items.push(...curr.items);
    return acc;
  }, {} as Record<string, { total: number; items: any[] }>);

  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  return (
    <div className="timeline-container">
      {dates.map(dateStr => {
        const d = grouped[dateStr];
        const dateObj = new Date(dateStr);
        const dayStr = dayNames[dateObj.getDay()];
        const displayDate = `${dateStr.split('-')[1]}월 ${dateStr.split('-')[2]}일 (${dayStr})`;
        const entryForDate = entries.find(e => e.date === dateStr);

        return (
          <div key={dateStr} className="timeline-day">
            <div className="timeline-day-header">
              <span className="timeline-date">{displayDate}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="timeline-day-total">합계: {formatAmount(d.total)}</span>
                {onShareToChat && entryForDate && (
                  <button 
                    className="timeline-share-btn" 
                    title="짠톡방에 공유하기" 
                    onClick={() => onShareToChat(entryForDate)}
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '100px', padding: '2px 8px', color: 'var(--text-sub)', fontSize: '10px', cursor: 'pointer', fontWeight: 800 }}
                  >
                    <CustomIcon emoji="👥" /> 공유
                  </button>
                )}
              </div>
            </div>
            {d.total === 0 && (
              <div className="timeline-zero-badge"><CustomIcon emoji="✨" /> 지갑 힐링 데이! <CustomIcon emoji="🌿" /></div>
            )}
            <div className="timeline-items">
              {d.items.map((item, idx) => {
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
                  <div key={idx} className="timeline-item">
                    <span className="timeline-item-emoji"><CustomIcon emoji={item.emoji} /></span>
                    <div className="timeline-item-info">
                      <span className="timeline-item-cat">
                        {item.category === '절약 방어' ? (
                          <span><CustomIcon emoji="🌱" /> 플러스 저축</span>
                        ) : item.category === '무지출' ? (
                          <span><CustomIcon emoji="🌿" /> 지갑 힐링</span>
                        ) : (
                          item.category
                        )}
                        {emotionTag && (
                          <span className={`timeline-item-emotion-badge ${emotionClass}`}>
                            {emotionTag}
                          </span>
                        )}
                      </span>
                      {commentText && <span className="timeline-item-comment">{commentText}</span>}
                    </div>
                    <span className={`timeline-item-amount ${item.amount === 0 ? 'timeline-item-amount--zero' : ''}`}>
                      {item.amount > 0 ? formatAmount(item.amount) : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GalleryTab({ entries }: { entries: Entry[] }) {
  const images = entries.filter(e => e.image);
  if (images.length === 0) {
    return <div className="mylog-empty">아직 올린 이미지가 없어요 <CustomIcon emoji="📸" /></div>;
  }
  return (
    <div className="gallery-grid">
      {images.map(e => (
        <div key={e.id} className="gallery-cell">
          <img src={e.image} alt="영수증" className="gallery-img" />
          <span className="gallery-date-badge">{e.date.substring(5)}</span>
        </div>
      ))}
    </div>
  );
}


function StatsTab({ entries, allEntries = [], lastWeekEntries, streak, personaKey, p, messages, nickname, daily, weekTotal, zeroDays }: any) {
  // 1. Weekly Spending Bar Chart
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - 6 + i);
    return d.toISOString().split('T')[0];
  });
  
  const dailyTotals = days.map(d => {
    const total = entries.filter((e: any) => e.date === d).reduce((s: number, e: any) => s + e.total_amount, 0);
    return { date: d, total };
  });
  const maxSpend = Math.max(...dailyTotals.map(d => d.total), 1);
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

  // 2. Category Breakdown
  const catMap = new Map<string, { amount: number, emoji: string }>();
  entries.forEach((e: any) => {
    e.items.forEach((item: any) => {
      if (item.category === '한마디') return;
      const exist = catMap.get(item.category) || { amount: 0, emoji: item.emoji };
      catMap.set(item.category, { amount: exist.amount + item.amount, emoji: exist.emoji });
    });
  });
  const sortedCats = Array.from(catMap.entries()).map(([name, data]) => ({ name, ...data })).filter(c => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const totalCatAmount = sortedCats.reduce((s, c) => s + c.amount, 0);

  // 3. Savings Temp
  const todayStr = getTodayStr();
  const isRecordedToday = daily?.recorded && daily?.date === todayStr;
  const temperature = Math.max(0, Math.min(100, 100 - Math.floor((daily?.spentAmount || 0) / 500)));

  const [sharing, setSharing] = useState(false);

  async function handleShareToFeed(type: 'temp' | 'radar') {
    if (sharing) return;
    setSharing(true);
    try {
      const text = type === 'temp' 
        ? `🔥 제 오늘의 절약 온도는 ${temperature}도예요! 다들 화이팅!`
        : `📊 제 소비 오각형이에요! 저는 [${p?.name || '짠친'}] 스타일이네요!`;
      const emoji = type === 'temp' ? '🌡️' : '🌟';
      
      await submitEntry({
        user_id: entries[0]?.user_id || 'unknown',
        nickname,
        persona: personaKey || 'pig',
        items: [{ category: '자랑하기', emoji, amount: 0, comment: text }],
        total_amount: 0,
        is_balance_game: false,
        date: getTodayStr(),
        week_key: getWeekKey()
      });
      alert('피드에 자랑글이 올라갔어요!');
    } finally {
      setSharing(false);
    }
  }

  // 4. Radar Chart stats
  const selfControl = Math.max(30, Math.min(100, 100 - Math.floor(weekTotal / 5000)));
  const savings = Math.max(40, Math.min(100, 40 + streak.streak * 10));
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
  // ── 절약 Wrapped (주간 결산 카드) ──
  const weeklyBudget = getWeeklyBudget();
  const weekSaved = Math.max(0, weeklyBudget - weekTotal);
  const recordedThisWeek = new Set(entries.map((e: any) => e.date)).size;
  const topCat = sortedCats[0];
  const [wrappedSharing, setWrappedSharing] = useState(false);
  async function handleShareWrapped() {
    if (wrappedSharing) return;
    setWrappedSharing(true);
    try {
      const text = `📅 이번 주 절약 결산! 지킨 돈 ${formatAmount(weekSaved)} · ${recordedThisWeek}일 기록 · 무지출 ${zeroDays}일${topCat ? ` · 최다 ${topCat.name}` : ''}`;
      await submitEntry({
        user_id: entries[0]?.user_id || allEntries[0]?.user_id || 'unknown',
        nickname, persona: personaKey || 'pig',
        items: [{ category: '주간결산', emoji: '📅', amount: 0, comment: text }],
        total_amount: 0, is_balance_game: false, date: getTodayStr(), week_key: getWeekKey()
      });
      alert('이번 주 결산을 피드에 공유했어요!');
    } finally { setWrappedSharing(false); }
  }

  // ── 소비 파형 (요일·시간대 공명 패턴) ──
  const waveSource = (allEntries.length ? allEntries : entries);
  const dowTotals = Array(7).fill(0);
  const hourBuckets = [0, 0, 0, 0]; // 새벽0-6 / 오전6-12 / 오후12-18 / 저녁18-24
  waveSource.forEach((e: any) => {
    const d = new Date(e.created_at || e.date);
    if (!isNaN(d.getTime()) && e.total_amount > 0) {
      dowTotals[d.getDay()] += e.total_amount;
      hourBuckets[Math.min(3, Math.floor(d.getHours() / 6))] += e.total_amount;
    }
  });
  const dowMax = Math.max(...dowTotals, 1);
  const peakDow = dowTotals.indexOf(Math.max(...dowTotals));
  const hourLabels = ['🌙 새벽', '🌅 오전', '☀️ 오후', '🌆 저녁'];
  const peakHour = hourBuckets.indexOf(Math.max(...hourBuckets));
  const hasWaveData = dowTotals.some(v => v > 0);

  const myPoints = [0, 1, 2, 3, 4].map(i => getPoint(scores[i], i)).join(' ');
  const gridPoints = [0.2, 0.4, 0.6, 0.8, 1.0].map((ratio) => [0, 1, 2, 3, 4].map(i => getPoint(100 * ratio, i)).join(' '));
  const labels = [
    { name: '자제력', x: 100, y: 15, align: 'middle' },
    { name: '절약력', x: 176, y: 72, align: 'start' },
    { name: '생존력', x: 148, y: 168, align: 'start' },
    { name: '사교력', x: 52, y: 168, align: 'end' },
    { name: '짠내력', x: 24, y: 72, align: 'end' }
  ] as const;

  return (
    <div className="stats-container">
      {/* 📅 절약 Wrapped — 이번 주 결산 카드 */}
      <div className="glass-card" style={{ background: '#F6FBF8', border: '1px solid #F0F1F3' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 className="stats-card-title" style={{ margin: 0 }}>📅 이번 주 절약 Wrapped</h4>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="mylog-budget-edit" onClick={handleShareWrapped} disabled={wrappedSharing}>피드 공유</button>
            <button className="mylog-budget-edit" onClick={() => shareExternal(buildWrappedBragMessage(formatAmount(weekSaved), recordedThisWeek, zeroDays, streak.streak))}>친구 자랑</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-sub)' }}>이번 주 지킨 돈</p>
            <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>{formatAmount(weekSaved)}</p>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-sub)' }}>기록 · 무지출</p>
            <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 800 }}>{recordedThisWeek}일 · {zeroDays}일</p>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-sub)' }}>최다 지출</p>
            <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 800 }}>{topCat ? <><CustomIcon emoji={topCat.emoji} /> {topCat.name}</> : '없음 🎉'}</p>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: '14px', padding: '12px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-sub)' }}>나의 소비 페르소나</p>
            <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 800, color: p?.color }}>{p?.name || '짠친'}</p>
          </div>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: '12px', color: 'var(--text-sub)', textAlign: 'center' }}>
          {streak.streak > 0 ? `🔥 ${streak.streak}일 연속 기록 중! 한 주를 멋지게 마무리했어요` : '이번 주도 한 줄씩 쌓아가요 🌿'}
        </p>
      </div>

      {/* 소비 진단 (self-benchmark) */}
      <SpendDiagnosisCard thisWeek={entries} lastWeek={lastWeekEntries || []} />

      {/* 주간 지출 현황 바 차트 */}
      <div className="glass-card">
        <h4 className="stats-card-title"><CustomIcon emoji="📊" /> 주간 지출 현황</h4>
        <div className="stat-bar-chart">
          {dailyTotals.map((d, i) => {
            const hPct = (d.total / maxSpend) * 100;
            const dObj = new Date(d.date);
            return (
              <div key={i} className="stat-bar-wrapper">
                <div className="stat-bar-amount">{d.total > 0 ? formatAmount(d.total) : ''}</div>
                <div className="stat-bar-track">
                  <div className="stat-bar-fill" style={{ height: `${hPct}%`, background: d.total === 0 ? 'var(--primary)' : 'var(--text-sub)' }}></div>
                </div>
                <div className="stat-bar-label">{dayNames[dObj.getDay()]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 🌊 소비 파형 — 요일·시간대 공명 패턴 */}
      <div className="glass-card">
        <h4 className="stats-card-title">🌊 나의 소비 파형</h4>
        {!hasWaveData ? (
          <p className="mylog-empty" style={{ padding: '16px 0' }}>지출 기록이 쌓이면 소비 리듬이 보여요.</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '90px', marginTop: '8px' }}>
              {dowTotals.map((v: number, i: number) => {
                const h = Math.max(4, Math.round(v / dowMax * 100));
                const isPeak = i === peakDow && v > 0;
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ width: '100%', height: `${h}%`, borderRadius: '6px 6px 0 0', background: isPeak ? 'linear-gradient(180deg,#ff4d4f,#fbbf24)' : 'rgba(255,255,255,0.15)' }} />
                    <span style={{ fontSize: '10px', fontWeight: isPeak ? 800 : 500, color: isPeak ? '#fbbf24' : 'var(--text-sub)' }}>{dayNames[i]}</span>
                  </div>
                );
              })}
            </div>
            <p style={{ margin: '14px 0 0', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-sub)', textAlign: 'center' }}>
              지름신은 <strong style={{ color: '#fbbf24' }}>{dayNames[peakDow]}요일 {hourLabels[peakHour]}</strong>에 공명해요.<br />그 시간대엔 지갑을 한 번 더 단속해보세요 🛡️
            </p>
          </>
        )}
      </div>

      {/* 카테고리별 지출 */}
      <div className="glass-card">
        <h4 className="stats-card-title"><CustomIcon emoji="💰" /> 카테고리별 지출</h4>
        {sortedCats.length === 0 ? (
          <p className="mylog-empty" style={{ padding: '16px 0' }}>지출 내역이 없습니다.</p>
        ) : (
          <div className="category-breakdown">
            {sortedCats.map((c, i) => {
              const pct = (c.amount / totalCatAmount) * 100;
              return (
                <div key={i} className="category-row">
                  <div className="category-row-meta">
                    <span className="category-row-name"><CustomIcon emoji={c.emoji} /> {c.name}</span>
                    <span className="category-row-val">{pct.toFixed(0)}% <span className="category-row-amt">{formatAmount(c.amount)}</span></span>
                  </div>
                  <div className="category-bar-track">
                    <div className="category-bar-fill" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 절약 온도 */}
      <div className="glass-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 className="stats-card-title" style={{ margin: 0 }}><CustomIcon emoji="🌡️" /> 절약 온도</h4>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button className="mylog-budget-edit" onClick={() => handleShareToFeed('temp')} disabled={sharing}>피드 자랑</button>
            {isRecordedToday && (
              <button className="mylog-budget-edit" onClick={() => shareExternal(buildTempBragMessage(temperature))}>친구 자랑</button>
            )}
          </div>
        </div>
        {!isRecordedToday ? (
          <div className="savings-temp-unrecorded">
            <span>오늘 기록을 완료해야 온도를 알 수 있어요!</span>
          </div>
        ) : (
          <div className="savings-temp">
            <div className="savings-temp-header">
              <span className="savings-temp-val" style={{ color: temperature >= 70 ? 'var(--success)' : temperature >= 40 ? 'var(--warning)' : 'var(--error)' }}>
                {temperature}°C
              </span>
              <span className="savings-temp-desc">
                {temperature >= 70 ? (
                  <span>완벽한 절약이네요! <CustomIcon emoji="🧊" /></span>
                ) : temperature >= 40 ? (
                  <span>조금 덥네요 조심! <CustomIcon emoji="🔥" /></span>
                ) : (
                  <span>지갑이 불타고 있어요! <CustomIcon emoji="🌋" /></span>
                )}
              </span>
            </div>
            <div className="savings-temp-bar">
              <div className="savings-temp-fill" style={{ width: `${temperature}%`, background: temperature >= 70 ? 'var(--success)' : temperature >= 40 ? 'var(--warning)' : 'var(--error)' }} />
            </div>
          </div>
        )}
      </div>

      {/* 오각형 차트 */}
      <div className="glass-card radar-chart-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="radar-chart-label">소비 오각형 스탯 <CustomIcon emoji="🕸️" /></span>
          <button className="mylog-budget-edit" onClick={() => handleShareToFeed('radar')} disabled={sharing}>피드 자랑</button>
        </div>
        <div className="radar-chart-svg-wrap">
          <svg width="200" height="184" className="radar-svg">
            {gridPoints.map((pts, idx) => <polygon key={idx} points={pts} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.8" />)}
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((ratio, idx) => {
              const pt = getPoint(100 * ratio, 0);
              const [x, y] = pt.split(',').map(Number);
              return <text key={idx} x={x + 4} y={y + 3} fill="rgba(255,255,255,0.18)" fontSize="7" fontWeight="900">{ratio * 100}</text>;
            })}
            {[0, 1, 2, 3, 4].map((i) => {
              const pt = getPoint(100, i);
              return <line key={i} x1="100" y1="92" x2={pt.split(',')[0]} y2={pt.split(',')[1]} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />;
            })}
            <polygon points={myPoints} fill="rgba(168, 85, 247, 0.28)" stroke="#A855F7" strokeWidth="2" className="radar-polygon" />
            {labels.map((lbl, i) => (
              <text key={i} x={lbl.x} y={lbl.y} fill="#fff" fontSize="10" fontWeight="900" textAnchor={lbl.align} style={{ fill: i === 4 && p ? p.color : i === 0 ? '#FF5E62' : 'var(--text-sub)' }}>
                {lbl.name}
              </text>
            ))}
          </svg>
        </div>
      </div>

      <div style={{ height: '32px' }} />
    </div>
  );
}

function MailboxTab({ messages, handleClearAllMessages, clearConfirm, handleReplyClick, nickname }: any) {
  return (
    <div className="glass-card mailbox-card" style={{ marginTop: '0' }}>
      <div className="mailbox-header">
        <p className="mailbox-title">
          내 쪽지함 <img src="/images/icon_mailbox.png" className="custom-icon" />
        </p>
        <div className="mailbox-actions">
          {messages.length > 0 && (
            <>
              <button onClick={handleClearAllMessages} className={`mailbox-clear-btn${clearConfirm ? ' mailbox-clear-btn--confirm' : ''}`}>
                {clearConfirm ? '한 번 더 탭하면 삭제' : '전체 삭제'}
              </button>
              <Badge size="small" color="blue" variant="weak">{messages.length}개</Badge>
            </>
          )}
        </div>
      </div>
      {messages.length === 0 ? (
        <p className="mailbox-empty">응원 쪽지 내역이 없어요.</p>
      ) : (
        <div className="mailbox-list">
          {messages.map((msg: any) => {
            const isSent = msg.sentByMe ?? (msg.senderNickname === nickname);
            return (
              <div key={msg.id} className={`mailbox-msg-row${isSent ? ' mailbox-msg-row--sent' : ''}`}>
                <div className="mailbox-msg-meta">
                  <div className="mailbox-msg-from">
                    {!isSent && (
                      <span className="mailbox-sender-badge" style={{ background: `${msg.senderPersonaColor || '#FF7E8D'}15`, color: msg.senderPersonaColor || '#FF7E8D' }}>
                        <CustomIcon emoji={msg.senderPersonaEmoji || '🐷'} className="custom-icon--sm" /> {msg.senderNickname}
                      </span>
                    )}
                    <span className="mailbox-msg-label">{isSent ? <span><CustomIcon emoji="✉️" /> {msg.recipientNickname || '상대방'}님에게 보낸 쪽지</span> : '받은 응원'}</span>
                  </div>
                  <span className="mailbox-msg-time">{msg.created_at ? timeAgo(msg.created_at) : msg.timestamp}</span>
                </div>
                <p className={isSent ? 'mailbox-msg-text-sent' : 'mailbox-msg-text-received'}>{msg.text}</p>
                {!isSent && (
                  <div className="mailbox-reply-btn-wrap">
                    <button className="mailbox-reply-btn" onClick={() => handleReplyClick(msg.senderNickname)}><CustomIcon emoji="✉️" /> 답장하기</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
