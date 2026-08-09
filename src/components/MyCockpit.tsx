import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@toss/tds-mobile';
import { formatAmount, getTodayStr } from '../lib/utils';
import type { WeekRankRow } from '../lib/supabase';
import { fetchFollowerIds, fetchReceivedReputation, sendCheerNotification, fetchMyDuo, createDuo, setDuoGoal, leaveDuo, fetchMyInteractions, type Duo } from '../lib/supabase';
import { getTopRelations, getEffectiveStreak as getRelStreak } from '../lib/relations';
import { shareExternal, buildDuoInviteMessage } from '../lib/share';
import GuideModal from './GuideModal';
import {
  PERSONAS,
  getPersona,
  getPetName,
  setPetName,
  getJellyBalance,
  getOwnedItems,
  getEquippedItems,
  buyItem,
  equipItem,
  SHOP_ITEMS,
  getIntentTrigger,
  getSavingGoal,
  setSavingGoal,
  getLastEmotion,
  getBudgetEntropy,
  getSystemTemperature,
  getFollowedUsers,
  getNickname,
  getWishlist,
  addWishlistItem,
  resolveWishlistItem,
  isWishlistItemReady,
  addToGoal,
  addJelly,
  type DailyState,
  type StreakData,
} from '../lib/storage';
import CustomIcon, { renderTextWithEmoji } from './CustomIcon';

const PERSONA_QUOTES: Record<string, string[]> = {
  cost_ai: [
    '오늘 가장 만족한 한 가지를 한 줄로 남겨봐요 🤖',
    '데이터로 보면, 한 줄 기록은 일주일 후의 내가 가장 좋아하는 선물이에요',
    '커피 한 잔의 행복도 계산해두면 다음에 더 만족스러워요',
  ],
  hamster: [
    '도토리 한 알씩 모으듯, 작은 기록도 쌓이면 든든해요 🐹',
    '오늘은 어떤 작은 만족을 골랐나요? 한 줄로 남겨봐요',
    '지갑이 쉬는 날도 멋진 하루예요',
  ],
  flexer: [
    '오늘 나에게 작은 선물 하나, 어떤 게 좋았나요? 🦄',
    '쓴 만큼의 이야기도 남겨두면 다음에 도움이 돼요',
    '마음이 끌리는 순간을 가볍게 기록해봐요',
  ],
  keeper: [
    '장바구니에 며칠 두었다가 다시 꺼내봐요, 답이 보여요 🛒',
    '오늘의 작은 결정, 한 줄로 남겨두면 미래의 내가 고마워해요',
    '친구들과 같이 기록하면 더 즐거워져요',
  ],
};

function SimpleModal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}

interface Props {
  userId: string;
  daily: DailyState;
  streak: StreakData;
  weekRank: WeekRankRow[];
  pendingPoints: number;
  pendingClaiming?: boolean;
  onClaimPending: () => void;
}

export default function MyCockpit({ userId, daily, streak, weekRank: _weekRank, pendingPoints, pendingClaiming = false, onClaimPending }: Props) {
  const [speech, setSpeech] = useState<string | null>(null);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isWobbling, setIsWobbling] = useState(false);

  const [petName, setPetNameState] = useState(() => getPetName() || '');
  const [jellyBalance, setJellyBalance] = useState(() => getJellyBalance());
  const [ownedItems, setOwnedItems] = useState<string[]>(() => getOwnedItems());
  const [equippedItems, setEquippedItems] = useState<Record<string, string | null>>(() => getEquippedItems());
  const [showShopModal, setShowShopModal] = useState(false);
  const [editingPetName, setEditingPetName] = useState(false);
  const [petNameInput, setPetNameInput] = useState(() => getPetName() || '');
  const intentTrigger = getIntentTrigger();

  const [savingGoal, setSavingGoalState] = useState(() => getSavingGoal());
  const [goalForm, setGoalForm] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalEmoji, setGoalEmoji] = useState('✈️');
  const [goalTarget, setGoalTarget] = useState('');
  const [showGoalModal, setShowGoalModal] = useState(false);

  const [entropy, setEntropy] = useState(() => getBudgetEntropy());
  // 🤝 관계 자본 (소셜 moat): 짝꿍 수 + 가장 친한 짠친
  const [buddyCount, setBuddyCount] = useState(0);
  const [topRel, setTopRel] = useState(() => getTopRelations(1)[0] ?? null);
  const [receivedTrust, setReceivedTrust] = useState(0); // 남이 내 글에 준 '짠내 인정' = 평판 정체성
  const [buddyList, setBuddyList] = useState<{ id: string; nickname: string }[]>([]); // 짝꿍 1:1 호출용
  // 💞 머니 듀오 (짝꿍과 공동 목표·스트릭)
  const [duo, setDuo] = useState<Duo | null>(null);
  const [duoGoalForm, setDuoGoalForm] = useState(false);
  const [duoGoalName, setDuoGoalName] = useState('');
  const [duoGoalEmoji, setDuoGoalEmoji] = useState('✈️');
  const [duoGoalTarget, setDuoGoalTarget] = useState('');
  // ❓ 사용법 가이드 — 첫 실행 자동 안내는 App.tsx에서 처리 (숨겨진 탭 패널 안에서 열리면 안 보이므로)
  const [showGuide, setShowGuide] = useState(false);
  // 🛒 충동 대기방 — 담기·대기 목록은 마이로그가 집 (피드는 48h 결정 순간만 노출)
  const [wishlist, setWishlist] = useState(() => getWishlist());
  const [wishName, setWishName] = useState('');
  const [wishPrice, setWishPrice] = useState('');
  const handleAddWish = () => {
    const price = parseInt(wishPrice.replace(/[^0-9]/g, ''), 10);
    if (!wishName.trim() || !price || price <= 0) return;
    setWishlist(addWishlistItem(wishName.trim(), price));
    setWishName(''); setWishPrice('');
    showToast('🛒 48시간 뒤 다시 물어볼게요. 그때도 원하면 그때 사요!');
  };
  const handleWishResolve = (id: string, bought: boolean) => {
    const item = wishlist.find(w => w.id === id);
    setWishlist(resolveWishlistItem(id, bought));
    if (!bought && item) {
      addToGoal(item.price);
      addJelly(15);
      showToast(`👏 충동을 이겨냈어요! 목표에 ${formatAmount(item.price)} 충전 · +15 젤리`);
    }
  };
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(msg);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  };

  useEffect(() => {
    const handleJellyUpdate = (e: any) => { if (e.detail !== undefined) setJellyBalance(e.detail); };
    const handleEquipUpdate = () => setEquippedItems(getEquippedItems());
    const handleGoalUpdate = () => setSavingGoalState(getSavingGoal());
    const handleEntropyUpdate = () => setEntropy(getBudgetEntropy());
    const handleRelUpdate = () => setTopRel(getTopRelations(1)[0] ?? null);
    window.addEventListener('savelog_jelly_updated', handleJellyUpdate as EventListener);
    window.addEventListener('savelog_pet_equipped_changed', handleEquipUpdate);
    window.addEventListener('savelog_goal_updated', handleGoalUpdate);
    window.addEventListener('savelog_entropy_updated', handleEntropyUpdate);
    window.addEventListener('savelog_relations_updated', handleRelUpdate);
    return () => {
      window.removeEventListener('savelog_jelly_updated', handleJellyUpdate as EventListener);
      window.removeEventListener('savelog_pet_equipped_changed', handleEquipUpdate);
      window.removeEventListener('savelog_goal_updated', handleGoalUpdate);
      window.removeEventListener('savelog_entropy_updated', handleEntropyUpdate);
      window.removeEventListener('savelog_relations_updated', handleRelUpdate);
    };
  }, []);

  // 듀오 초대 링크 수락(App.tsx) 등 외부에서 듀오 상태가 바뀌면 리로드
  useEffect(() => {
    const handleDuoUpdate = () => { fetchMyDuo(userId).then(d => setDuo(d)).catch(() => {}); };
    window.addEventListener('savelog_duo_updated', handleDuoUpdate);
    return () => window.removeEventListener('savelog_duo_updated', handleDuoUpdate);
  }, [userId]);

  // 절약 짝꿍(상호 팔로우) 수 + 받은 평판(짠내 인정) 계산
  useEffect(() => {
    fetchFollowerIds(userId).then(ids => {
      const followerSet = new Set(ids);
      const followed = getFollowedUsers();
      const buddies = Object.entries(followed).filter(([id]) => followerSet.has(id)).map(([id, nickname]) => ({ id, nickname }));
      setBuddyCount(buddies.length);
      setBuddyList(buddies);
    }).catch(() => {});
    fetchReceivedReputation(userId).then(r => setReceivedTrust(r.trust)).catch(() => {});
    fetchMyDuo(userId).then(d => setDuo(d)).catch(() => {});
    // 서버 관계 자본(양방향) 우선 — 상대도 같은 교류 스트릭을 보는 데이터
    fetchMyInteractions(userId).then(list => {
      if (list.length > 0) {
        const top = list[0];
        setTopRel({ userId: top.userId, nickname: top.nickname, count: top.count, streak: top.streak, lastDate: top.lastDate, firstDate: top.lastDate });
      }
    }).catch(() => {});
  }, [userId]);

  const handleMakeDuo = () => {
    if (buddyList.length === 0) return;
    const top = buddyList.find(b => b.id === topRel?.userId) || buddyList[0];
    const myName = getNickname() || '나';
    createDuo(userId, myName, top.id, top.nickname).then(d => {
      if (d) {
        setDuo(d);
        sendCheerNotification(userId, top.id, myName, `${myName}님과 머니 듀오가 되었어요! 함께 목표를 모아봐요 💞`).catch(() => {});
        showToast(`💞 ${top.nickname}님과 머니 듀오를 맺었어요!`);
      } else {
        showToast('듀오 맺기에 실패했어요. 잠시 후 다시 시도해 주세요.');
      }
    });
  };
  const handleSaveDuoGoal = () => {
    if (!duo) return;
    const t = parseInt(duoGoalTarget.replace(/[^0-9]/g, ''), 10);
    if (!duoGoalName.trim() || !t || t <= 0) return;
    setDuoGoal(duo.id, duoGoalName.trim(), duoGoalEmoji, t).then(() => {
      setDuo({ ...duo, goal_name: duoGoalName.trim(), goal_emoji: duoGoalEmoji, goal_target: t });
      setDuoGoalForm(false);
      setDuoGoalName(''); setDuoGoalTarget('');
    });
  };
  const handleLeaveDuo = () => {
    if (!duo) return;
    leaveDuo(duo.id).then(() => setDuo(null));
  };
  // 앱 밖 친구에게 듀오 초대 링크 공유 — 수락 링크로 들어오면 App.tsx가 자동으로 듀오를 맺는다
  const handleInviteDuo = () => {
    const myName = getNickname() || '짠친';
    const query = `duo=${encodeURIComponent(userId)}&dn=${encodeURIComponent(myName)}`;
    shareExternal(buildDuoInviteMessage(myName), query).then(ok => {
      showToast(ok ? '💌 초대 링크를 보냈어요! 친구가 수락하면 듀오가 맺어져요' : '공유에 실패했어요. 잠시 후 다시 시도해 주세요.');
    });
  };

  const handlePetClick = () => {
    setIsWobbling(true);
    setTimeout(() => setIsWobbling(false), 500);
    const personaKey = getPersona() || 'hamster';
    const quotes = PERSONA_QUOTES[personaKey] || PERSONA_QUOTES['hamster'];
    const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
    if (speechTimeoutRef.current) clearTimeout(speechTimeoutRef.current);
    setSpeech(randomQuote);
    speechTimeoutRef.current = setTimeout(() => setSpeech(null), 3500);
  };

  const handleSaveGoal = () => {
    const t = parseInt(goalTarget.replace(/[^0-9]/g, ''), 10);
    if (!goalName.trim() || !t || t <= 0) return;
    const g = { name: goalName.trim(), emoji: goalEmoji, target: t, saved: savingGoal?.saved ?? 0 };
    setSavingGoal(g);
    setSavingGoalState(g);
    setGoalForm(false);
    setGoalName(''); setGoalTarget('');
  };

  const personaKey = getPersona() || 'hamster';
  const p = PERSONAS[personaKey];
  const petLevel = Math.min(5, 1 + Math.floor(streak.totalDays / 3));

  const getPetSpeech = () => {
    if (speech) return speech;
    if (getBudgetEntropy() >= 70) return '🌪️ 방이 어수선해요 — 오늘 기록으로 정리해 주세요!';
    if (daily.recorded) {
      const spent = daily.spentAmount ?? 0;
      const todayEmotion = getLastEmotion(getTodayStr());
      if (spent > 0 && todayEmotion) {
        if (todayEmotion.includes('충동')) return '충동이었어도 괜찮아요. 솔직하게 적은 게 진짜 용기예요 🐹';
        if (todayEmotion.includes('홧김')) return '속상한 날이었군요. 마음을 기록한 것만으로 충분해요 🫶';
        if (todayEmotion.includes('필요')) return '꼭 필요한 소비였네요. 잘 판단했어요, 후회 없는 하루 🌿';
        if (todayEmotion.includes('후회없')) return '후회 없는 소비! 나에게 떳떳한 하루였네요 ✨';
      }
      if (spent === 0) {
        if (personaKey === 'cost_ai') return '무지출 완료! 가성비 무한대(∞) 달성에 성공했어요! 🤖';
        if (personaKey === 'flexer') return '지갑을 닫고 오늘 하루 낭만을 가득 채우셨군요! 🦄';
        if (personaKey === 'keeper') return '지름신을 멋지게 이겨내고 오늘의 예산을 지켜냈어요! 🛒';
        return '도토리를 하나도 안 쓰고 세이브했네요! 대단해요 🐹';
      }
      if (personaKey === 'cost_ai') return `오늘 ${formatAmount(spent)}을 썼군요. 가성비를 충족한 소비였길! 🤖`;
      if (personaKey === 'flexer') return `오늘의 ${formatAmount(spent)} 지출, 낭만적인 순간이었길 바라요! 🦄`;
      if (personaKey === 'keeper') return '신중히 고민하고 산 물건이기를 바랄게요. 후회는 없겠죠? 🛒';
      return `오늘 ${formatAmount(spent)} 지출이 발생했지만 괜찮아요. 내일 또 아껴봐요! 🐹`;
    }
    if (intentTrigger) return `약속하신 '${intentTrigger}' 상황이네요! 지갑 수비 일지를 작성해 볼까요? 💤`;
    return '오늘의 인증을 기다리고 있어요. 요정이 지켜봐요! 💤';
  };
  const activeSpeech = getPetSpeech();

  const goalPct = savingGoal ? Math.min(100, Math.round(savingGoal.saved / savingGoal.target * 100)) : null;

  // ── 물리 ↔ 펫·목표 통합 ──
  // 엔트로피 = 요정의 환경 컨디션(클수록 어수선). 컨디션 = 100 - 엔트로피
  const condition = Math.max(0, Math.min(100, 100 - entropy));
  const conditionColor = condition >= 70 ? 'var(--primary)' : condition >= 30 ? '#fbbf24' : '#ff4d4f';
  const conditionLabel = condition >= 70 ? '쾌적' : condition >= 30 ? '보통' : '어수선';
  // 담금질 온도 → 습관(=요정) 성숙 단계
  const temp = getSystemTemperature();
  const habitStage = temp >= 0.8
    ? { label: '새싹 습관', emoji: '🌱' }
    : temp >= 0.6
      ? { label: '자라는 습관', emoji: '🌿' }
      : temp >= 0.4
        ? { label: '단단한 습관', emoji: '🌳' }
        : { label: '마스터 습관', emoji: '🏆' };

  return (
    <div className="my-cockpit">
      {/* 사용법 가이드 진입 — 처음/헷갈릴 때 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button onClick={() => setShowGuide(true)} style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-sub)', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--divider)', borderRadius: '100px', padding: '5px 12px', cursor: 'pointer' }}>사용법</button>
      </div>

      {/* 💠 통합 리워드 스트립 — 토스포인트(현금) · 젤리(가상) · 목표(절약진행) 한눈에 */}
      <div className="glass-card" style={{ padding: '12px', marginBottom: '16px', display: 'flex', gap: '8px' }}>
        <div style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRight: '1px solid var(--divider)' }}>
          <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-mute)', fontWeight: 700 }}><CustomIcon emoji="💰" /> 토스포인트</p>
          <p style={{ margin: '3px 0 0', fontSize: '15px', fontWeight: 800, color: pendingPoints > 0 ? 'var(--primary)' : 'var(--text-main)' }}>{pendingPoints}원</p>
          {pendingPoints > 0 && (
            <button onClick={onClaimPending} disabled={pendingClaiming}
              style={{ marginTop: '4px', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>
              {pendingClaiming ? '받는 중' : '광고 보고 받기'}
            </button>
          )}
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '6px 4px', borderRight: '1px solid var(--divider)' }}>
          <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-mute)', fontWeight: 700 }}><CustomIcon emoji="🪙" /> 젤리</p>
          <p style={{ margin: '3px 0 0', fontSize: '15px', fontWeight: 800 }}>{jellyBalance}</p>
          <button onClick={() => setShowShopModal(true)} style={{ marginTop: '4px', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px', border: '1px solid var(--divider)', background: '#F5F3EF', color: 'var(--text-main)', cursor: 'pointer' }}>꾸미기</button>
        </div>
        <div style={{ flex: 1, textAlign: 'center', padding: '6px 4px', cursor: 'pointer' }} onClick={() => setShowGoalModal(true)}>
          <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-mute)', fontWeight: 700 }}><CustomIcon emoji="🎯" /> 목표</p>
          <p style={{ margin: '3px 0 0', fontSize: '15px', fontWeight: 800, color: goalPct !== null ? 'var(--primary)' : 'var(--text-mute)' }}>{goalPct !== null ? `${goalPct}%` : '미설정'}</p>
          {goalPct === null && (
            <button style={{ marginTop: '4px', fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px', border: '1px solid var(--divider)', background: '#F5F3EF', color: 'var(--text-main)', cursor: 'pointer' }}>설정</button>
          )}
        </div>
      </div>

      {/* 🐹 절약 요정 + 감정 위로 */}
      <div className="glass-card pet-card" style={{ cursor: 'pointer', marginBottom: '16px' }} onClick={handlePetClick}>
        <div className="pet-inner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div className="pet-left" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className={`pet-avatar-circle ${isWobbling ? 'wobble-anim' : ''}`} style={{ border: `1.8px solid ${p?.color || 'var(--ink-red)'}`, boxShadow: `0 0 15px ${(p?.color || 'var(--ink-red)')}15`, position: 'relative', overflow: 'visible' }}>
              <img src={p?.icon} alt="" className="pet-avatar-img" />
              {equippedItems.head && <span style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)', fontSize: '24px', pointerEvents: 'none', zIndex: 10 }}><CustomIcon emoji={SHOP_ITEMS.find(i => i.id === equippedItems.head)?.emoji || ''} /></span>}
              {equippedItems.face && <span style={{ position: 'absolute', top: '2px', left: '50%', transform: 'translateX(-50%)', fontSize: '18px', pointerEvents: 'none', zIndex: 10 }}><CustomIcon emoji={SHOP_ITEMS.find(i => i.id === equippedItems.face)?.emoji || ''} /></span>}
              {equippedItems.neck && <span style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', fontSize: '18px', pointerEvents: 'none', zIndex: 10 }}><CustomIcon emoji={SHOP_ITEMS.find(i => i.id === equippedItems.neck)?.emoji || ''} /></span>}
              {equippedItems.room && <span style={{ position: 'absolute', bottom: '-2px', right: '-8px', fontSize: '16px', pointerEvents: 'none', zIndex: 10 }}><CustomIcon emoji={SHOP_ITEMS.find(i => i.id === equippedItems.room)?.emoji || ''} /></span>}
            </div>
            <div className="pet-info">
              <div className="pet-name-row" style={{ flexWrap: 'wrap', gap: '6px' }}>
                <span className="pet-name">{petName || `${p?.name} 요정`}</span>
                <span className="pet-level">LV.{petLevel}</span>
                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 7px', borderRadius: '100px', background: 'rgba(31, 30, 28,0.12)', color: 'var(--primary)' }}><CustomIcon emoji={habitStage.emoji} /> {habitStage.label}</span>
              </div>
              <span className="pet-status">{renderTextWithEmoji(activeSpeech)}</span>
              {/* 컨디션 = 100 - 예산 엔트로피. 기록·무지출로 올리고 방치하면 떨어짐 */}
              <div style={{ marginTop: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: 'var(--text-mute)', fontWeight: 700, marginBottom: '3px' }}>
                  <span>컨디션 <span style={{ color: 'var(--text-mute)', fontWeight: 500 }}>(인증하면 ↑, 방치하면 ↓)</span></span>
                  <span style={{ color: conditionColor }}>{condition} · {conditionLabel}</span>
                </div>
                <div style={{ height: '6px', borderRadius: '100px', background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{ width: `${condition}%`, height: '100%', borderRadius: '100px', background: conditionColor, transition: 'width 0.4s' }} />
                </div>
              </div>
            </div>
          </div>
          <button className="pet-shop-btn" style={{ background: 'var(--primary)', border: 'none', borderRadius: '12px', color: '#ffffff', padding: '7px 14px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', zIndex: 20, boxShadow: '0 2px 8px var(--primary-glow)' }} onClick={(e) => { e.stopPropagation(); setShowShopModal(true); }}>
            꾸미기 <CustomIcon emoji="🎩" />
          </button>
        </div>
      </div>

      {/* 🛒 충동 대기방 — 사고 싶은 걸 담아두면 48시간 뒤 피드에서 다시 물어봐요 */}
      <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', textAlign: 'left' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 800 }}><CustomIcon emoji="🛒" /> 충동 대기방</span>
          <span style={{ fontSize: '10.5px', color: 'var(--text-mute)', fontWeight: 700 }}>48시간 참으면 목표 충전 +15젤리</span>
        </div>
        {wishlist.filter(isWishlistItemReady).map(it => (
          <div key={it.id} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', borderRadius: '10px', background: '#F7F4EF' }}>
            <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, minWidth: 0 }}><CustomIcon emoji="⏰" /> '{it.name}' — 아직도 원해요?</p>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button onClick={() => handleWishResolve(it.id, false)} style={{ padding: '5px 9px', borderRadius: '100px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '11px' }}>참았어요</button>
              <button onClick={() => handleWishResolve(it.id, true)} style={{ padding: '5px 9px', borderRadius: '100px', background: 'rgba(225, 75, 59,0.1)', color: 'var(--ink-red)', border: '1px solid rgba(225, 75, 59,0.3)', fontWeight: 800, cursor: 'pointer', fontSize: '11px' }}>샀어요</button>
            </div>
          </div>
        ))}
        {wishlist.filter(w => !isWishlistItemReady(w)).length > 0 && (
          <p style={{ margin: '0 0 8px', fontSize: '11.5px', color: 'var(--text-sub)' }}>
            <CustomIcon emoji="⏳" /> 대기 중 {wishlist.filter(w => !isWishlistItemReady(w)).length}건 — 시간이 되면 피드에서 물어볼게요
          </p>
        )}
        <div style={{ display: 'flex', gap: '6px' }}>
          <input value={wishName} onChange={e => setWishName(e.target.value)} maxLength={20} placeholder="사고 싶은 것" style={{ flex: 2, minWidth: 0, padding: '9px 10px', borderRadius: '10px', border: '1px solid var(--divider)', fontSize: '12px', background: 'rgba(255,255,255,0.7)' }} />
          <input value={wishPrice} onChange={e => setWishPrice(e.target.value)} inputMode="numeric" placeholder="가격" style={{ flex: 1, minWidth: 0, padding: '9px 10px', borderRadius: '10px', border: '1px solid var(--divider)', fontSize: '12px', background: 'rgba(255,255,255,0.7)' }} />
          <button onClick={handleAddWish} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '12px' }}>담기</button>
        </div>
      </div>

      {/* 🤝 절약 관계 (소셜 moat: 짝꿍 + 받은 평판 + 가장 친한 짠친) */}
      {(buddyCount > 0 || topRel || receivedTrust > 0) && (
        <div className="glass-card" style={{ padding: '12px 16px', marginBottom: '16px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', fontWeight: 800 }}><CustomIcon emoji="🤝" /> 절약 짝꿍 <span style={{ color: 'var(--primary)' }}>{buddyCount}명</span></span>
            {receivedTrust > 0 && (
              <span style={{ fontSize: '11.5px', fontWeight: 800, color: 'var(--text-main)' }}><CustomIcon emoji="🏅" /> 받은 짠내 인정 <span style={{ color: '#d97706' }}>{receivedTrust}</span></span>
            )}
          </div>
          {topRel && (
            <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: 'var(--text-sub)', fontWeight: 700 }}>
              가장 친한 짠친 <strong style={{ color: 'var(--text-main)' }}>{topRel.nickname}</strong>
              {getRelStreak(topRel) > 0 ? <span style={{ color: '#d97706' }}> · <CustomIcon emoji="🔥" /> {getRelStreak(topRel)}일째 교류</span> : ` · ${topRel.count}회 교류`}
            </p>
          )}
        </div>
      )}

      {/* 💞 머니 듀오 — 짝꿍과 공동 목표·스트릭 (관계 자본의 정점) */}
      {duo ? (() => {
        const isA = duo.member_a === userId;
        const otherNick = (isA ? duo.nickname_b : duo.nickname_a) || '짝꿍';
        const myNick = (isA ? duo.nickname_a : duo.nickname_b) || '나';
        const sharedSaved = (duo.saved_a || 0) + (duo.saved_b || 0);
        const pct = duo.goal_target > 0 ? Math.min(100, Math.round(sharedSaved / duo.goal_target * 100)) : 0;
        const today = getTodayStr();
        const yd = new Date(today + 'T00:00:00'); yd.setDate(yd.getDate() - 1);
        const ydStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
        const effStreak = (duo.last_both_date === today || duo.last_both_date === ydStr) ? duo.streak : 0;
        return (
          <div className="glass-card" style={{ padding: '16px', marginBottom: '16px', textAlign: 'left', background: '#FFF7F8', border: '1px solid var(--divider)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800 }}><CustomIcon emoji="💞" /> 머니 듀오 · {myNick} ＋ {otherNick}</h4>
              <span style={{ fontSize: '11px', color: '#d97706', fontWeight: 800 }}><CustomIcon emoji="🔥" /> 공동 {effStreak}일</span>
            </div>
            {duo.goal_target > 0 && !duoGoalForm ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 800 }}><CustomIcon emoji={duo.goal_emoji || '✈️'} /> {duo.goal_name}</span>
                  <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{formatAmount(sharedSaved)} ({pct}%)</span>
                </div>
                <div style={{ height: '12px', borderRadius: '100px', background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', borderRadius: '100px', background: 'linear-gradient(90deg, var(--ink-red), #FF9966)', transition: 'width 0.4s' }} />
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '11px', color: 'var(--text-sub)' }}>
                  {myNick} {formatAmount(isA ? duo.saved_a : duo.saved_b)} · {otherNick} {formatAmount(isA ? duo.saved_b : duo.saved_a)} 기여 — 둘의 절약이 한 목표를 채워요
                </p>
              </>
            ) : duoGoalForm ? (
              <>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  {['✈️','🏠','💍','🎁','🚗','💻'].map(e => (
                    <button key={e} onClick={() => setDuoGoalEmoji(e)} style={{ fontSize: '18px', padding: '5px', borderRadius: '8px', cursor: 'pointer', background: duoGoalEmoji === e ? 'var(--primary-light)' : 'var(--surface-dim)', border: duoGoalEmoji === e ? '1.5px solid var(--primary)' : '1px solid var(--divider)' }}>
                      <CustomIcon emoji={e} />
                    </button>
                  ))}
                </div>
                <input className="nickname-input" value={duoGoalName} onChange={e => setDuoGoalName(e.target.value)} maxLength={16} placeholder="공동 목표 (예: 둘이 제주 여행)" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '10px', background: 'var(--surface-dim)', border: '1px solid var(--divider)', color: 'var(--text-main)', fontSize: '13px', marginBottom: '8px' }} />
                <input className="nickname-input" value={duoGoalTarget} onChange={e => setDuoGoalTarget(e.target.value)} inputMode="numeric" placeholder="목표 금액 (원)" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '10px', background: 'var(--surface-dim)', border: '1px solid var(--divider)', color: 'var(--text-main)', fontSize: '13px', marginBottom: '10px' }} />
                <button onClick={handleSaveDuoGoal} style={{ width: '100%', padding: '9px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer' }}>공동 목표 저장</button>
              </>
            ) : (
              <button onClick={() => setDuoGoalForm(true)} style={{ width: '100%', padding: '10px', borderRadius: '10px', background: 'rgba(225, 75, 59,0.12)', color: 'var(--ink-red)', border: '1px solid rgba(225, 75, 59,0.3)', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}><CustomIcon emoji="🎯" /> 공동 목표 정하기</button>
            )}
            <button onClick={handleLeaveDuo} style={{ marginTop: '8px', background: 'none', border: 'none', color: 'var(--text-mute)', fontSize: '10.5px', textDecoration: 'underline', cursor: 'pointer' }}>듀오 해제</button>
          </div>
        );
      })() : buddyList.length > 0 ? (() => {
        const duoBuddy = buddyList.find(b => b.id === topRel?.userId) || buddyList[0];
        return (
          <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', textAlign: 'left', background: '#FFF7F8', border: '1px solid var(--divider)' }}>
            <div style={{ cursor: 'pointer' }} onClick={handleMakeDuo}>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: 800 }}><CustomIcon emoji="💞" /> {duoBuddy.nickname}님과 머니 듀오 맺기</p>
              <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: 'var(--text-sub)', lineHeight: 1.5 }}>
                둘이 함께 <strong>공동 목표·스트릭</strong>을 키워요. 매일 둘 다 기록하면 공동 불꽃이 오르고, 한 명이 빠지면 같이 깨져요.<br />
                <span style={{ color: 'var(--ink-red)', fontWeight: 800 }}>탭해서 맺기 →</span>
              </p>
            </div>
            <button onClick={handleInviteDuo} style={{ marginTop: '10px', width: '100%', padding: '9px', borderRadius: '10px', background: 'rgba(225, 75, 59,0.12)', color: 'var(--ink-red)', border: '1px solid rgba(225, 75, 59,0.3)', fontWeight: 800, cursor: 'pointer', fontSize: '12.5px' }}>
              <CustomIcon emoji="💌" /> 다른 친구를 초대해 듀오 맺기
            </button>
          </div>
        );
      })() : null}

      {/* 🎯 절약 목표 상세 및 설정 모달 */}
      <SimpleModal open={showGoalModal} onClose={() => { setShowGoalModal(false); setGoalForm(false); }}>
        <div style={{ padding: '20px 16px', color: 'var(--text-main)', textAlign: 'left' }}>
          {savingGoal && !goalForm ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  <CustomIcon emoji={savingGoal.emoji} /> {savingGoal.name}
                </h3>
                <button
                  style={{ background: 'none', border: 'none', color: 'var(--text-sub)', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer' }}
                  onClick={() => { setGoalName(savingGoal.name); setGoalEmoji(savingGoal.emoji); setGoalTarget(String(savingGoal.target)); setGoalForm(true); }}
                >
                  수정
                </button>
              </div>
              {(() => {
                const pct = Math.min(100, Math.round(savingGoal.saved / savingGoal.target * 100));
                const done = savingGoal.saved >= savingGoal.target;
                return (
                  <>
                    <div style={{ height: '14px', borderRadius: '100px', background: 'var(--divider)', overflow: 'hidden', marginBottom: '10px' }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: '100px', background: done ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg, var(--primary), #34d399)', transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', fontSize: '13px' }}>
                      <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{formatAmount(savingGoal.saved)} ({pct}%)</span>
                      <span style={{ color: 'var(--text-sub)' }}>목표 {formatAmount(savingGoal.target)}</span>
                    </div>
                    <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: done ? '#fbbf24' : 'var(--text-sub)', lineHeight: 1.5 }}>
                      {done ? '🎉 목표 달성! 잠재에너지가 가득 찼어요. 이제 방출할 시간!' : '오늘 안 쓴 돈이 잠재에너지로 차곡차곡 충전돼요 ⚡'}
                    </p>
                    {!done && (
                      <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--primary)', fontWeight: 700, lineHeight: 1.5 }}>
                        <CustomIcon emoji="🌱" /> 오늘 배달·커피·택시를 참아 지킨 돈이 생기면 바로 목표 저금통에 적립돼요!
                      </p>
                    )}
                  </>
                );
              })()}
              <Button size="medium" display="full" color="dark" variant="weak" onClick={() => setShowGoalModal(false)}>닫기</Button>
            </>
          ) : (
            <>
              <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 800 }}>
                <CustomIcon emoji="🎯" /> 절약 목표 정하기
              </h3>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
                {['✈️','💻','👟','🎮','💍','🏠','🎸','📷'].map(e => (
                  <button key={e} onClick={() => setGoalEmoji(e)} style={{ fontSize: '20px', padding: '6px', borderRadius: '10px', cursor: 'pointer', background: goalEmoji === e ? 'var(--primary-light)' : 'var(--surface-dim)', border: goalEmoji === e ? '1.5px solid var(--primary)' : '1px solid var(--divider)' }}>
                    <CustomIcon emoji={e} />
                  </button>
                ))}
              </div>
              <input className="nickname-input" value={goalName} onChange={e => setGoalName(e.target.value)} maxLength={16} placeholder="목표 이름 (예: 제주 여행)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', background: 'var(--surface-dim)', border: '1px solid var(--divider)', color: 'var(--text-main)', fontSize: '14px', marginBottom: '10px' }} />
              <input className="nickname-input" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} inputMode="numeric" placeholder="목표 금액 (원)"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '10px', background: 'var(--surface-dim)', border: '1px solid var(--divider)', color: 'var(--text-main)', fontSize: '14px', marginBottom: '16px' }} />
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button size="medium" display="full" color="primary" disabled={!goalName.trim() || !parseInt(goalTarget.replace(/[^0-9]/g,''),10)} onClick={handleSaveGoal}>저장</Button>
                <Button size="medium" display="full" color="dark" variant="weak" onClick={() => { if (savingGoal) { setGoalForm(false); } else { setShowGoalModal(false); } }}>취소</Button>
              </div>
            </>
          )}
        </div>
      </SimpleModal>

      {/* 🐹 펫 꾸미기 & 상점 모달 */}
      <SimpleModal open={showShopModal} onClose={() => { setShowShopModal(false); setEditingPetName(false); }}>
        <div style={{ padding: '20px 16px', color: 'var(--text-main)', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}><CustomIcon emoji="🐹" /> 요정 꾸미기 & 상점</h3>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}><CustomIcon emoji="🪙" /> 내 젤리: {jellyBalance}개</span>
          </div>

          <div className="glass-card" style={{ padding: '12px 16px', background: 'var(--surface-dim)', borderRadius: '16px', border: '1px solid var(--divider)', marginBottom: '20px' }}>
            <p style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: 700, color: 'var(--text-sub)' }}>요정의 이름</p>
            {editingPetName ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input className="nickname-input" style={{ flex: 1, padding: '8px 12px', borderRadius: '10px', background: 'var(--surface-dim)', border: '1px solid var(--divider)', color: 'var(--text-main)', fontSize: '14px' }} value={petNameInput} onChange={(e) => setPetNameInput(e.target.value)} maxLength={10} placeholder="새로운 이름 입력" />
                <button style={{ padding: '8px 16px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', fontSize: '13px' }}
                  onClick={() => { const c = petNameInput.trim(); if (c) { setPetName(c); setPetNameState(c); } setEditingPetName(false); }}>저장</button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 800 }}>{petName || '이름 없음 (기본 요정)'}</span>
                <button style={{ background: 'none', border: 'none', color: 'var(--text-sub)', fontSize: '12px', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setEditingPetName(true)}>수정</button>
              </div>
            )}
          </div>

          <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 800 }}>🎩 요정 악세사리 상점</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
            {SHOP_ITEMS.map((item) => {
              const isOwned = ownedItems.includes(item.id);
              const isEquipped = equippedItems[item.type] === item.id;
              return (
                <div key={item.id} style={{ background: 'var(--surface-dim)', border: isEquipped ? '1.5px solid var(--primary)' : '1px solid var(--divider)', borderRadius: '16px', padding: '12px', textAlign: 'center', position: 'relative' }}>
                  <span style={{ fontSize: '32px', display: 'block', margin: '4px 0' }}><CustomIcon emoji={item.emoji} /></span>
                  <span style={{ fontSize: '12px', fontWeight: 800, display: 'block', color: 'var(--text-main)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{item.name}</span>
                  {isOwned ? (
                    <button style={{ marginTop: '8px', width: '100%', padding: '6px 0', borderRadius: '10px', border: 'none', fontSize: '11px', fontWeight: 800, cursor: 'pointer', background: isEquipped ? 'rgba(31, 30, 28, 0.15)' : 'rgba(255,255,255,0.1)', color: isEquipped ? 'var(--primary)' : 'var(--text-main)' }}
                      onClick={() => { if (isEquipped) equipItem(null, item.type); else equipItem(item.id, item.type); setEquippedItems(getEquippedItems()); }}>
                      {isEquipped ? '장착 해제' : '착용하기'}
                    </button>
                  ) : (
                    <button style={{ marginTop: '8px', width: '100%', padding: '6px 0', borderRadius: '10px', border: 'none', fontSize: '11px', fontWeight: 800, cursor: 'pointer', background: jellyBalance >= item.price ? 'var(--primary)' : 'var(--divider)', color: jellyBalance >= item.price ? '#fff' : 'var(--text-mute)' }}
                      disabled={jellyBalance < item.price}
                      onClick={() => { if (buyItem(item.id, item.price)) { setOwnedItems(getOwnedItems()); setJellyBalance(getJellyBalance()); showToast(`🛒 ${item.name} 구매 완료!`); } }}>
                      <CustomIcon emoji="🪙" /> {item.price} 젤리
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '20px' }}>
            <Button size="large" display="full" color="primary" variant="fill" onClick={() => setShowShopModal(false)}>닫기</Button>
          </div>
        </div>
      </SimpleModal>

      <GuideModal open={showGuide} onClose={() => setShowGuide(false)} />

      {toast && <div className="point-toast point-toast--feed">{toast}</div>}
    </div>
  );
}
