import { getWeekRange } from './utils';
import { hapticForAmount } from './haptics';

const USER_ID_KEY = 'savelog_user_id';
const USER_KEY_KEY = 'savelog_user_key';
const NICKNAME_KEY = 'savelog_nickname';
const STREAK_KEY = 'savelog_streak';
const DAILY_KEY = 'savelog_daily';
export function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function getUserKey(): string | null {
  return localStorage.getItem(USER_KEY_KEY);
}

export function setUserKey(key: string): void {
  localStorage.setItem(USER_KEY_KEY, key);
}

export function getNickname(): string | null {
  return localStorage.getItem(NICKNAME_KEY);
}

// 온보딩 관문 제거용 — 임의 짠네임 생성 (마이로그 설정에서 언제든 변경 가능)
const NICK_ADJECTIVES = ['알뜰한', '야무진', '단단한', '차곡찬', '짠짠한', '든든한', '슬기로운', '무던한', '지혜로운', '옹골찬'];
const NICK_ANIMALS = ['수달', '다람쥐', '햄스터', '고슴도치', '펭귄', '두더지', '청설모', '알파카', '너구리', '물범'];
export function generateNickname(): string {
  const adj = NICK_ADJECTIVES[Math.floor(Math.random() * NICK_ADJECTIVES.length)];
  const animal = NICK_ANIMALS[Math.floor(Math.random() * NICK_ANIMALS.length)];
  return `${adj} ${animal}`;
}

export function setNickname(name: string): void {
  localStorage.setItem(NICKNAME_KEY, name.trim());
}

export interface StreakData {
  streak: number;
  lastDate: string;
  totalDays: number;
}

export function loadStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { streak: 0, lastDate: '', totalDays: 0 };
    return JSON.parse(raw) as StreakData;
  } catch {
    return { streak: 0, lastDate: '', totalDays: 0 };
  }
}

// ── Streak Shields (공유 리워드로 받는 스트릭 보호권) ──────────────────────────
const SHIELD_KEY = 'savelog_streak_shields';

export function getStreakShields(): number {
  try {
    const n = Number(localStorage.getItem(SHIELD_KEY) ?? '0');
    return isNaN(n) ? 0 : Math.max(0, n);
  } catch { return 0; }
}

export function addStreakShield(count = 1): number {
  const next = getStreakShields() + count;
  try { localStorage.setItem(SHIELD_KEY, String(next)); } catch {}
  return next;
}

function consumeStreakShield(): boolean {
  const shields = getStreakShields();
  if (shields <= 0) return false;
  try { localStorage.setItem(SHIELD_KEY, String(shields - 1)); } catch {}
  return true;
}

// 오늘 또는 어제 기록이 없으면 streak을 0으로 반환 (stale 표시 방지)
// 정확히 하루만 빠진 경우 + 보호권이 있으면 자동 소비하여 streak 유지
export function getEffectiveStreak(): StreakData {
  const data = loadStreak();
  if (!data.lastDate || data.streak === 0) return data;

  const today = new Date();
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayStr = fmt(today);
  if (data.lastDate === todayStr) return data;

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayStr = fmt(yesterday);
  if (data.lastDate === yesterdayStr) return data;

  // 정확히 어제 하루만 빠진 경우(2일 전이 마지막) + 보호권 있으면 자동 사용
  const twoDaysAgo = new Date(today);
  twoDaysAgo.setDate(today.getDate() - 2);
  if (data.lastDate === fmt(twoDaysAgo) && consumeStreakShield()) {
    const shielded = { ...data, lastDate: yesterdayStr };
    localStorage.setItem(STREAK_KEY, JSON.stringify(shielded));
    return shielded;
  }

  // 마지막 기록이 이틀 이상 전 → streak 끊김
  return { ...data, streak: 0 };
}

export function updateStreak(today: string): StreakData {
  const data = loadStreak();
  if (data.lastDate === today) return data;

  const yesterday = new Date(today + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  const newStreak = data.lastDate === yStr ? data.streak + 1 : 1;
  const next: StreakData = {
    streak: newStreak,
    lastDate: today,
    totalDays: data.totalDays + 1,
  };
  localStorage.setItem(STREAK_KEY, JSON.stringify(next));
  return next;
}

export interface DailyState {
  date: string;
  recorded: boolean;
  pointGranted: boolean;
  entryId: string | null;
  spentAmount?: number;
}

export function loadDailyState(today: string): DailyState {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return { date: today, recorded: false, pointGranted: false, entryId: null };
    const data = JSON.parse(raw) as DailyState;
    if (data.date !== today) return { date: today, recorded: false, pointGranted: false, entryId: null };
    return data;
  } catch {
    return { date: today, recorded: false, pointGranted: false, entryId: null };
  }
}

export function saveDailyState(state: DailyState): void {
  localStorage.setItem(DAILY_KEY, JSON.stringify(state));
}


// ── Persona MBTI MBTI ─────────────────────────────────────────────────────────

export interface Persona {
  key: string;
  emoji: string;
  name: string;
  color: string;
  desc: string;
  icon: string;
}

export const PERSONAS: Record<string, Persona> = {
  cost_ai: {
    key: 'cost_ai',
    emoji: '🤖',
    name: '가성비 분석가',
    color: '#6E4CF5', // 리터럴 hex 유지 — `${p.color}15` 알파 결합에 쓰인다
    desc: '1원당 만족도를 따져서 나에게 더 잘 맞는 선택을 찾아내는 타입.',
    icon: '/images/mbti_robot.svg',
  },
  hamster: {
    key: 'hamster',
    emoji: '🐹',
    name: '차곡차곡 햄스터',
    color: '#B4801C',
    desc: '도토리를 모으듯 작은 습관을 차곡차곡 쌓아가며 든든해지는 타입.',
    icon: '/images/mbti_hamster.svg',
  },
  flexer: {
    key: 'flexer',
    emoji: '🦄',
    name: '낭만 수집가',
    color: '#C4106B',
    desc: '오늘의 작은 만족을 소중히 여기며 마음에 끌리는 순간을 모으는 타입.',
    icon: '/images/mbti_unicorn.svg',
  },
  keeper: {
    key: 'keeper',
    emoji: '🛒',
    name: '신중한 큐레이터',
    color: '#00778C',
    desc: '사고 싶은 걸 잠깐 두고 곱씹어보며 진짜 좋은 것만 들이는 타입.',
    icon: '/images/mbti_cart.svg',
  },
};

const PERSONA_KEY = 'savelog_persona';

export function getPersona(): string | null {
  return localStorage.getItem(PERSONA_KEY);
}

export function setPersona(key: string): void {
  localStorage.setItem(PERSONA_KEY, key);
}

// ── Daily Mission ────────────────────────────────────────────────────────────

export interface DailyMission {
  category: string;
  action: string;
  reward: number;
  completed: boolean;
}

export function getDailyMission(dateStr: string): DailyMission {
  const missions = [
    { category: '카페', action: '오늘 카페 지출 0원 도전', reward: 5 },
    { category: '쇼핑', action: '오늘 쇼핑 지출 0원 도전', reward: 5 },
    { category: '취미', action: '오늘 취미 지출 0원 도전', reward: 5 },
    { category: '식비', action: '오늘 식비 지출 5,000원 이하 도전', reward: 5 },
    { category: '교통', action: '오늘 교통 지출 2,000원 이하 도전', reward: 5 },
    { category: '기타', action: '오늘 무지출(0원 지출) 하루 도전', reward: 5 },
  ];
  
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = dateStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % missions.length;
  const base = missions[idx];

  const completedKey = `savelog_mission_completed_${dateStr}`;
  const completed = localStorage.getItem(completedKey) === 'true';

  return {
    category: base.category,
    action: base.action,
    reward: base.reward,
    completed,
  };
}

export function completeDailyMission(dateStr: string): void {
  const completedKey = `savelog_mission_completed_${dateStr}`;
  localStorage.setItem(completedKey, 'true');
}

// ── Retention helpers ───────────────────────────────────────────────────────

export function setRecordedDate(dateStr: string): void {
  localStorage.setItem('savelog_recorded_date_' + dateStr, 'true');
}

// ── Cheering Messages (Mailbox) ─────────────────────────────────────────────

export interface CheeringMessage {
  id: string;
  senderNickname: string;
  senderPersonaEmoji?: string;
  senderPersonaColor?: string;
  text: string;
  timestamp: string;
  created_at?: string; // ISO string; if present, use for timeAgo display instead of timestamp
  recipientNickname?: string;
  sentByMe?: boolean; // 닉네임 변경 후에도 내가 보낸 쪽지 구분 유지
}

const MESSAGES_KEY = 'savelog_user_messages';

export function getCheeringMessages(): CheeringMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CheeringMessage[];
  } catch {
    return [];
  }
}

export function sendCheeringMessage(recipientNickname: string, text: string, senderNickname: string, senderPersonaKey: string | null): void {
  try {
    // If the message is sent to '나' (current user), add to local messages
    // Or if we send to someone else, we also mock save it to local storage to demonstrate mailbox updates!
    const currentMessages = getCheeringMessages();
    const p = senderPersonaKey ? PERSONAS[senderPersonaKey] : null;
    const newMessage: CheeringMessage = {
      id: crypto.randomUUID(),
      senderNickname: senderNickname || '익명 절약가',
      senderPersonaEmoji: p?.emoji || '🐷',
      senderPersonaColor: p?.color || '#6E4CF5',
      text: text.trim(),
      timestamp: '방금 전',
      created_at: new Date().toISOString(),
      recipientNickname,
      sentByMe: true,
    };
    currentMessages.unshift(newMessage);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(currentMessages.slice(0, 100)));
  } catch (e) {
    console.error(e);
  }
}

// ── Pending Points (max 50원, 광고 보고 수령) ────────────────────────────────

const PENDING_KEY = 'savelog_pending_points';
export const MAX_PENDING_POINTS = 50;

export function getPendingPoints(): number {
  try {
    const n = Number(localStorage.getItem(PENDING_KEY) ?? '0');
    return Math.min(isNaN(n) ? 0 : n, MAX_PENDING_POINTS);
  }
  catch { return 0; }
}

export function addPendingPoints(amount: number): number {
  const current = getPendingPoints();
  const next = Math.min(current + amount, MAX_PENDING_POINTS);
  try { localStorage.setItem(PENDING_KEY, String(next)); } catch {}
  return next;
}

export function clearPendingPoints(): void {
  try { localStorage.setItem(PENDING_KEY, '0'); } catch {}
}

// 청구된 금액만 차감 후 나머지를 반환 (광고 시청 중 추가 적립분 보존)
export function consumePendingPoints(amount: number): number {
  const remaining = Math.max(0, getPendingPoints() - amount);
  try { localStorage.setItem(PENDING_KEY, String(remaining)); } catch {}
  return remaining;
}

// ── Rank Reward Claimed ──────────────────────────────────────────────────────

export function getClaimedRankReward(weekKey: string): boolean {
  try { return localStorage.getItem(`savelog_rank_claimed_${weekKey}`) === 'true'; }
  catch { return false; }
}

export function setClaimedRankReward(weekKey: string): void {
  try { localStorage.setItem(`savelog_rank_claimed_${weekKey}`, 'true'); } catch {}
}

// ── Follow System ───────────────────────────────────────────────────────────

const FOLLOW_KEY = 'savelog_followed_users';

export function getFollowedUsers(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(FOLLOW_KEY) ?? '{}'); } catch { return {}; }
}

export function saveFollowedUsers(follows: Record<string, string>): void {
  try { localStorage.setItem(FOLLOW_KEY, JSON.stringify(follows)); } catch {}
}

export function toggleFollow(userId: string, nickname: string): boolean {
  const current = getFollowedUsers();
  if (current[userId]) {
    delete current[userId];
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(current));
    return false; // unfollowed
  } else {
    current[userId] = nickname;
    localStorage.setItem(FOLLOW_KEY, JSON.stringify(current));
    return true; // followed
  }
}

// ── Milestone Tracking ──────────────────────────────────────────────────────

export function getMilestonePosted(key: string): boolean {
  try { return localStorage.getItem(`savelog_milestone_${key}`) === 'true'; } catch { return false; }
}

export function setMilestonePosted(key: string): void {
  try { localStorage.setItem(`savelog_milestone_${key}`, 'true'); } catch {}
}

// ── Group Challenge ─────────────────────────────────────────────────────────

export function getActiveChallengeId(weekKey: string): string | null {
  return localStorage.getItem(`savelog_active_challenge_${weekKey}`);
}

export function setActiveChallengeId(id: string | null, weekKey: string): void {
  try {
    const key = `savelog_active_challenge_${weekKey}`;
    if (id === null) localStorage.removeItem(key);
    else localStorage.setItem(key, id);
  } catch {}
}

// ── Stale key cleanup (once per day) ────────────────────────────────────────

const CLEANUP_DATE_KEY = 'savelog_last_cleanup';

export function cleanupStaleKeys(): void {
  try {
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = fmt(new Date());
    if (localStorage.getItem(CLEANUP_DATE_KEY) === today) return; // 오늘 이미 실행

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const dateStr =
        key.startsWith('savelog_mission_completed_') ? key.slice('savelog_mission_completed_'.length)
        : key.startsWith('savelog_recorded_date_') ? key.slice('savelog_recorded_date_'.length)
        : null;
      if (dateStr && new Date(dateStr + 'T00:00:00') < cutoff) { toRemove.push(key); continue; }
      if (key.startsWith('savelog_rank_claimed_')) {
        const weekKey = key.slice('savelog_rank_claimed_'.length);
        try {
          const { start } = getWeekRange(weekKey);
          if (start < cutoff) toRemove.push(key);
        } catch {}
      }
      if (key.startsWith('savelog_duel_')) {
        const weekKey = key.slice('savelog_duel_'.length);
        try {
          const { start } = getWeekRange(weekKey);
          if (start < cutoff) toRemove.push(key);
        } catch {}
      }
      if (key.startsWith('savelog_milestone_')) {
        const milestoneKey = key.slice('savelog_milestone_'.length);
        const streakIdx = milestoneKey.indexOf('-streak');
        if (streakIdx > 0) {
          const weekKey = milestoneKey.slice(0, streakIdx);
          try {
            const { start } = getWeekRange(weekKey);
            if (start < cutoff) toRemove.push(key);
          } catch {}
        }
      }
      // 이전 버전 챌린지 키 (비-주차 스코프) 제거
      if (key === 'savelog_active_challenge') toRemove.push(key);
      // 주차 스코프 챌린지 키 만료 정리
      if (key.startsWith('savelog_active_challenge_')) {
        const weekKey = key.slice('savelog_active_challenge_'.length);
        try {
          const { start } = getWeekRange(weekKey);
          if (start < cutoff) toRemove.push(key);
        } catch {}
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    localStorage.setItem(CLEANUP_DATE_KEY, today);
  } catch {
    // localStorage 접근 실패 시 무시
  }
}

// ── Weekly Budget (주간 예산) ────────────────────────────────────────────────
const WEEKLY_BUDGET_KEY = 'savelog_weekly_budget';

export function getWeeklyBudget(): number {
  try {
    const v = localStorage.getItem(WEEKLY_BUDGET_KEY);
    return v ? parseInt(v, 10) : 100000; // 기본값 10만원
  } catch {
    return 100000;
  }
}

export function setWeeklyBudget(amount: number): void {
  try {
    localStorage.setItem(WEEKLY_BUDGET_KEY, amount.toString());
  } catch {}
}

// ── Jelly Pockets (디지털 젤리 저금통) ──────────────────────────────────────────
const JELLY_POCKETS_KEY = 'savelog_jelly_pockets';

export interface JellyPocket {
  category: string;
  emoji: string;
  budget: number;
  spent: number;
}

export const DEFAULT_JELLY_POCKETS: JellyPocket[] = [
  { category: '식비/식품', emoji: '🍚', budget: 40000, spent: 0 },
  { category: '카페/간식', emoji: '☕', budget: 20000, spent: 0 },
  { category: '쇼핑/패션', emoji: '🛍️', budget: 20000, spent: 0 },
  { category: '기타', emoji: '📦', budget: 20000, spent: 0 }
];

export function getJellyPockets(): JellyPocket[] {
  try {
    const v = localStorage.getItem(JELLY_POCKETS_KEY);
    if (!v) {
      const totalBudget = getWeeklyBudget();
      const pockets = DEFAULT_JELLY_POCKETS.map(p => {
        const pct = p.budget / 100000;
        return { ...p, budget: Math.round(totalBudget * pct) };
      });
      return pockets;
    }
    return JSON.parse(v);
  } catch {
    return DEFAULT_JELLY_POCKETS;
  }
}

export function setJellyPockets(pockets: JellyPocket[]): void {
  try {
    localStorage.setItem(JELLY_POCKETS_KEY, JSON.stringify(pockets));
    const total = pockets.reduce((sum, p) => sum + p.budget, 0);
    setWeeklyBudget(total);
  } catch {}
}

export function updateJellyPocketSpent(category: string, amount: number): void {
  try {
    const pockets = getJellyPockets();
    const cleanCat = category.split('/')[0];
    const updated = pockets.map(p => {
      const pClean = p.category.split('/')[0];
      if (pClean === cleanCat) {
        return { ...p, spent: Math.max(0, p.spent + amount) };
      }
      return p;
    });
    setJellyPockets(updated);
  } catch {}
}

// ── Group Savings Raids (그룹 몬스터 레이드) ──────────────────────────────────
export interface GroupRaid {
  bossName: string;
  bossMaxHp: number;
  bossHp: number;
  bossWeaknessCategory: string;
  bossWeaknessEmoji: string;
  raidCompleted: boolean;
}

export const RAID_BOSSES = [
  { name: '🍔 야식 배달 괴수', maxHp: 1500, weaknessCategory: '생활/배달', weaknessEmoji: '🏠' },
  { name: '☕ 카페인 수호골렘', maxHp: 1000, weaknessCategory: '카페/간식', weaknessEmoji: '☕' },
  { name: '🛍️ 지름신 핑크 미믹', maxHp: 2000, weaknessCategory: '쇼핑/패션', weaknessEmoji: '🛍️' },
  { name: '📦 소모성 낭비 유령', maxHp: 1200, weaknessCategory: '기타', weaknessEmoji: '📦' }
];

export function updateGroupRaidAction(
  actionType: 'zero' | 'save' | 'spend',
  category: string,
  amount: number,
  nickname: string
): { damage: number; heal: number; logMessage: string } | null {
  try {
    const saved = localStorage.getItem('savelog_pot_group');
    if (!saved) return null;
    const group = JSON.parse(saved);
    if (!group.raid) {
      const randomBoss = RAID_BOSSES[Math.floor(Math.random() * RAID_BOSSES.length)];
      group.raid = {
        bossName: randomBoss.name,
        bossMaxHp: randomBoss.maxHp,
        bossHp: randomBoss.maxHp,
        bossWeaknessCategory: randomBoss.weaknessCategory,
        bossWeaknessEmoji: randomBoss.weaknessEmoji,
        raidCompleted: false
      };
    }
    
    const raid: GroupRaid = group.raid;
    if (raid.raidCompleted && actionType !== 'zero' && actionType !== 'save') return null;
    
    // 만약 이미 완료된 상태에서 데미지가 더 들어오는건 패스
    if (raid.raidCompleted) return null;

    let damage = 0;
    let heal = 0;
    let logMessage = '';
    
    if (actionType === 'zero') {
      damage = 300;
      logMessage = `🛡️ ${nickname}님이 오늘 무지출 인증에 성공해 보스에게 300 데미지를 입혔어요!`;
    } else if (actionType === 'save') {
      damage = Math.max(50, Math.round(amount / 50));
      logMessage = `⚔️ ${nickname}님이 ${amount}원 절약을 인증해 보스에게 ${damage} 데미지를 입혔어요!`;
    } else if (actionType === 'spend') {
      const cleanCat = category.split('/')[0];
      const cleanWeakness = raid.bossWeaknessCategory.split('/')[0];
      if (cleanCat === cleanWeakness) {
        heal = Math.max(50, Math.round(amount / 50));
        logMessage = `⚠️ ${nickname}님이 약점 카테고리(${raid.bossWeaknessEmoji} ${category})에서 지출해 보스가 ${heal} HP를 회복했어요!`;
      } else {
        heal = Math.max(20, Math.round(amount / 100));
        logMessage = `💨 ${nickname}님이 지출해 보스가 ${heal} HP를 회복했어요.`;
      }
    }
    
    if (damage > 0) {
      raid.bossHp = Math.max(0, raid.bossHp - damage);
      
      if (group.members) {
        const member = group.members.find((m: any) => m.name === nickname);
        if (member) {
          member.damage = (member.damage || 0) + damage;
        } else {
          group.members.push({ name: nickname, spent: 0, persona: 'pig', damage });
        }
      }

      if (raid.bossHp === 0) {
        raid.raidCompleted = true;
        logMessage = `🎉 축하해요! ${nickname}님의 일격으로 보스 [${raid.bossName}] 퇴치에 성공했어요!`;
      }
    } else if (heal > 0) {
      raid.bossHp = Math.min(raid.bossMaxHp, raid.bossHp + heal);
    }
    
    if (logMessage) {
      group.nudgeHistory = [logMessage, ...(group.nudgeHistory || [])].slice(0, 15);
    }
    
    localStorage.setItem('savelog_pot_group', JSON.stringify(group));
    return { damage, heal, logMessage };
  } catch {
    return null;
  }
}

// ── Implementation Intentions ───────────────────────────────────────────────
const INTENT_TRIGGER_KEY = 'savelog_intent_trigger';
export function getIntentTrigger(): string | null {
  try { return localStorage.getItem(INTENT_TRIGGER_KEY); } catch { return null; }
}
export function setIntentTrigger(val: string): void {
  try { localStorage.setItem(INTENT_TRIGGER_KEY, val); } catch {}
}

// ── Pet Naming ───────────────────────────────────────────────────────────────
const PET_NAME_KEY = 'savelog_pet_name';
export function getPetName(): string | null {
  try { return localStorage.getItem(PET_NAME_KEY); } catch { return null; }
}
export function setPetName(name: string): void {
  try { localStorage.setItem(PET_NAME_KEY, name); } catch {}
}

// ── Jelly Balance ────────────────────────────────────────────────────────────
const JELLY_BALANCE_KEY = 'savelog_jelly_balance';
export function getJellyBalance(): number {
  try {
    const v = localStorage.getItem(JELLY_BALANCE_KEY);
    return v ? parseInt(v, 10) : 100; // 기본 100 젤리 지급
  } catch { return 100; }
}
export function addJelly(amount: number): number {
  const current = getJellyBalance();
  const next = current + amount;
  try {
    localStorage.setItem(JELLY_BALANCE_KEY, next.toString());
    window.dispatchEvent(new CustomEvent('savelog_jelly_updated', { detail: next }));
  } catch {}
  return next;
}

// ── 🎰 무지출 룰렛 — 기록 완료가 룰렛권이 되는 가변 보상 ─────────────────────
const ROULETTE_SPINS_KEY = 'savelog_roulette_spins';

export function getRouletteSpins(): number {
  try { return parseInt(localStorage.getItem(ROULETTE_SPINS_KEY) ?? '0', 10) || 0; } catch { return 0; }
}

export function addRouletteSpins(n: number): number {
  const next = Math.max(0, getRouletteSpins() + n);
  try {
    localStorage.setItem(ROULETTE_SPINS_KEY, String(next));
    window.dispatchEvent(new CustomEvent('savelog_roulette_updated', { detail: next }));
  } catch {}
  return next;
}

export function consumeRouletteSpin(): number {
  return addRouletteSpins(-1);
}
export function useJelly(amount: number): boolean {
  const current = getJellyBalance();
  if (current < amount) return false;
  const next = current - amount;
  try {
    localStorage.setItem(JELLY_BALANCE_KEY, next.toString());
    window.dispatchEvent(new CustomEvent('savelog_jelly_updated', { detail: next }));
    return true;
  } catch { return false; }
}

// ── Pet Customization & Shop ────────────────────────────────────────────────
const PET_OWNED_ITEMS_KEY = 'savelog_pet_owned_items';
const PET_EQUIPPED_ITEMS_KEY = 'savelog_pet_equipped_items';

export interface ShopItem {
  id: string;
  name: string;
  emoji: string;
  price: number;
  type: 'head' | 'face' | 'neck' | 'room';
}

export const SHOP_ITEMS: ShopItem[] = [
  { id: 'gentle_hat', name: '멋쟁이 신사 모자', emoji: '🎩', price: 50, type: 'head' },
  { id: 'hipster_glasses', name: '힙스터 선글라스', emoji: '🕶️', price: 70, type: 'face' },
  { id: 'golden_crown', name: '황금 왕관', emoji: '👑', price: 150, type: 'head' },
  { id: 'red_ribbon', name: '빨간 리본', emoji: '🎀', price: 40, type: 'neck' },
  { id: 'plant_pot', name: '반려 식물 화분', emoji: '🪴', price: 60, type: 'room' },
  { id: 'mini_sofa', name: '아늑한 미니 소파', emoji: '🛋️', price: 100, type: 'room' },
];

export function getOwnedItems(): string[] {
  try {
    const v = localStorage.getItem(PET_OWNED_ITEMS_KEY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

export function getEquippedItems(): Record<string, string | null> {
  try {
    const v = localStorage.getItem(PET_EQUIPPED_ITEMS_KEY);
    return v ? JSON.parse(v) : { head: null, face: null, neck: null, room: null };
  } catch { return { head: null, face: null, neck: null, room: null }; }
}

export function buyItem(id: string, price: number): boolean {
  const owned = getOwnedItems();
  if (owned.includes(id)) return false;
  if (useJelly(price)) {
    owned.push(id);
    try {
      localStorage.setItem(PET_OWNED_ITEMS_KEY, JSON.stringify(owned));
      return true;
    } catch {}
  }
  return false;
}

export function equipItem(id: string | null, type: string): void {
  const equipped = getEquippedItems();
  equipped[type] = id;
  try {
    localStorage.setItem(PET_EQUIPPED_ITEMS_KEY, JSON.stringify(equipped));
    window.dispatchEvent(new Event('savelog_pet_equipped_changed'));
  } catch {}
}

// ── Saving Goal (절약 위치에너지 → 목표 충전) ──────────────────────────────
// 안 쓴 돈(잠재에너지)을 사용자가 정한 실제 목표 게이지로 적립한다.
const SAVING_GOAL_KEY = 'savelog_saving_goal';
export interface SavingGoal { name: string; emoji: string; target: number; saved: number; }
export function getSavingGoal(): SavingGoal | null {
  try { const v = localStorage.getItem(SAVING_GOAL_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
export function setSavingGoal(goal: SavingGoal): void {
  try {
    localStorage.setItem(SAVING_GOAL_KEY, JSON.stringify(goal));
    window.dispatchEvent(new Event('savelog_goal_updated'));
  } catch {}
}
export function clearSavingGoal(): void {
  try { localStorage.removeItem(SAVING_GOAL_KEY); window.dispatchEvent(new Event('savelog_goal_updated')); } catch {}
}
// 안 쓴 돈을 목표에 충전. 충전된 금액(목표 초과분 제외)을 반환.
export function addToGoal(amount: number): number {
  const g = getSavingGoal();
  if (!g || amount <= 0 || g.saved >= g.target) return 0;
  const charged = Math.min(amount, g.target - g.saved);
  setSavingGoal({ ...g, saved: g.saved + charged });
  hapticForAmount(charged); // 돈의 무게 — 모든 충전 경로(기록·위시 참기·딜레마 승리)가 여기로 수렴
  return charged;
}

// ── Wishlist Cooldown (충동 48시간 대기 후 결정) ────────────────────────────
// 사고 싶은 것을 대기방에 넣고 48h 뒤 "아직도 원해?"로 충동을 시간으로 식힌다.
const WISHLIST_KEY = 'savelog_wishlist';
export const WISHLIST_COOLDOWN_MS = 48 * 60 * 60 * 1000;
export interface WishlistItem { id: string; name: string; price: number; addedAt: number; status: 'waiting' | 'resisted' | 'bought'; }
export function getWishlist(): WishlistItem[] {
  try { const v = localStorage.getItem(WISHLIST_KEY); return v ? JSON.parse(v) as WishlistItem[] : []; } catch { return []; }
}
function saveWishlist(items: WishlistItem[]): void {
  try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(items)); } catch {}
}
export function addWishlistItem(name: string, price: number): WishlistItem[] {
  const items = getWishlist();
  items.unshift({ id: `w-${Date.now()}`, name, price, addedAt: Date.now(), status: 'waiting' });
  saveWishlist(items);
  return items;
}
export function resolveWishlistItem(id: string, bought: boolean): WishlistItem[] {
  const items = getWishlist().map(it =>
    it.id === id ? { ...it, status: (bought ? 'bought' : 'resisted') as WishlistItem['status'] } : it
  );
  saveWishlist(items);
  return items;
}
export function removeWishlistItem(id: string): WishlistItem[] {
  const items = getWishlist().filter(it => it.id !== id);
  saveWishlist(items);
  return items;
}
// 쿨다운이 끝났는지 (48h 경과 + 아직 waiting)
export function isWishlistItemReady(it: WishlistItem): boolean {
  return it.status === 'waiting' && Date.now() - it.addedAt >= WISHLIST_COOLDOWN_MS;
}

// ── 돈 멘탈 케어: 소비 감정 태그 (오늘 마지막 감정) ──────────────────────────
// 지출에 감정을 붙여 기록 → 펫이 그 감정에 맞춰 위로/지지한다. (가계부 → 멘탈 다이어리)
const LAST_EMOTION_KEY = 'savelog_last_emotion';
export function setLastEmotion(date: string, emotion: string): void {
  try { localStorage.setItem(LAST_EMOTION_KEY, JSON.stringify({ date, emotion })); } catch {}
}
export function getLastEmotion(date: string): string | null {
  try {
    const v = localStorage.getItem(LAST_EMOTION_KEY);
    if (!v) return null;
    const o = JSON.parse(v);
    return o.date === date ? o.emotion : null;
  } catch { return null; }
}

// ── 소비 고민 결정 해소 (짠친 투표 후 작성자가 최종 결정) ─────────────────────
// "이거 살까?" 고민글을 올리고 짠친 투표를 받은 뒤, 작성자가 참았는지/질렀는지 결정한다.
const RESOLVED_DILEMMAS_KEY = 'savelog_resolved_dilemmas';
export type DilemmaOutcome = 'resisted' | 'bought';
export function getResolvedDilemmas(): Record<string, DilemmaOutcome> {
  try { const v = localStorage.getItem(RESOLVED_DILEMMAS_KEY); return v ? JSON.parse(v) : {}; } catch { return {}; }
}
export function getDilemmaOutcome(entryId: string): DilemmaOutcome | null {
  return getResolvedDilemmas()[entryId] ?? null;
}
export function resolveDilemma(entryId: string, outcome: DilemmaOutcome): void {
  try {
    const map = getResolvedDilemmas();
    map[entryId] = outcome;
    localStorage.setItem(RESOLVED_DILEMMAS_KEY, JSON.stringify(map));
  } catch {}
}

// ── Part 2. 행동 과학 및 물리학 기반 메커니즘 ──

// 1. 모의 담금질 (Simulated Annealing)
const SYSTEM_START_DATE_KEY = 'savelog_system_start_date';

export function getSystemStartDate(): string {
  let d = localStorage.getItem(SYSTEM_START_DATE_KEY);
  if (!d) {
    const today = new Date();
    d = today.toISOString().split('T')[0];
    localStorage.setItem(SYSTEM_START_DATE_KEY, d);
  }
  return d;
}

export function getSystemWeek(): number {
  const startStr = getSystemStartDate();
  const start = new Date(startStr);
  const today = new Date();
  const diffTime = Math.abs(today.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.ceil(diffDays / 7));
}

export function getSystemTemperature(): number {
  const week = getSystemWeek();
  // 온도: 1주차 0.8 -> 2주차 0.6 -> 3주차 0.4 -> 4주차+ 0.2 (floor)
  // 1주차부터 복원계수 k=1-T가 0.2로 시작해 완만한 복원력이 즉시 작동한다.
  return Math.max(0.2, parseFloat((0.8 - (week - 1) * 0.2).toFixed(2)));
}

export function getRestoringCoefficient(): number {
  return parseFloat((1.0 - getSystemTemperature()).toFixed(2));
}

// 2. 훅의 법칙 (Hooke's Law Restoring Budget)
const RESTORING_ADJUSTMENT_KEY = 'savelog_restoring_adjustment';

export function getRestoringAdjustment(): number {
  try {
    const v = localStorage.getItem(RESTORING_ADJUSTMENT_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

export function setRestoringAdjustment(amt: number): void {
  try {
    localStorage.setItem(RESTORING_ADJUSTMENT_KEY, amt.toString());
  } catch {}
}

export function applyDailyRestoringForce(spentYesterday: number): number {
  const baseDailyBudget = Math.round(getWeeklyBudget() / 7);
  const targetWithAdjustment = baseDailyBudget + getRestoringAdjustment();
  const deviation = spentYesterday - targetWithAdjustment; // x: 초과 지출 변위
  
  const k = getRestoringCoefficient();
  // F = -k * x (복원력)
  const restoringForce = Math.round(-k * deviation);
  
  // 다음 날 적용할 복원 보정치 업데이트 (누적되지 않고 매일 갱신)
  setRestoringAdjustment(restoringForce);
  return restoringForce;
}

// 3. 예산 엔트로피 (Budget Entropy)
const BUDGET_ENTROPY_KEY = 'savelog_budget_entropy';

export function getBudgetEntropy(): number {
  try {
    const v = localStorage.getItem(BUDGET_ENTROPY_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0;
  }
}

export function setBudgetEntropy(val: number): void {
  try {
    const clamped = Math.max(0, Math.min(100, val));
    localStorage.setItem(BUDGET_ENTROPY_KEY, clamped.toString());
    window.dispatchEvent(new Event('savelog_entropy_updated'));
  } catch {}
}

export function ageBudgetEntropy(expiredSkeletonsCount = 0): number {
  const current = getBudgetEntropy();
  const increase = 15 + (expiredSkeletonsCount * 10);
  const next = Math.min(100, current + increase);
  setBudgetEntropy(next);
  return next;
}

export function reduceBudgetEntropy(amount: number): number {
  const current = getBudgetEntropy();
  const next = Math.max(0, current - amount);
  setBudgetEntropy(next);
  return next;
}

// 4. 자이가르닉 스켈레톤 (Zeigarnik Skeletons)
const SKELETONS_KEY = 'savelog_zeigarnik_skeletons';

export interface ZeigarnikSkeleton {
  id: string;
  name: string;
  emoji: string;
  timeLabel: string;
  targetCategory: string;
  status: 'pending' | 'resolved' | 'expired';
}

export const DEFAULT_SKELETONS: ZeigarnikSkeleton[] = [
  { id: 'sk-lunch', name: '점심 식사', emoji: '🍚', timeLabel: '13:00', targetCategory: '식비/식품', status: 'pending' },
  { id: 'sk-cafe', name: '카페/간식 타임', emoji: '☕', timeLabel: '15:30', targetCategory: '카페/간식', status: 'pending' },
  { id: 'sk-commute', name: '퇴근/하교 길', emoji: '🚌', timeLabel: '18:30', targetCategory: '기타', status: 'pending' }
];

export function getZeigarnikSkeletons(): ZeigarnikSkeleton[] {
  try {
    const v = localStorage.getItem(SKELETONS_KEY);
    if (!v) {
      localStorage.setItem(SKELETONS_KEY, JSON.stringify(DEFAULT_SKELETONS));
      return DEFAULT_SKELETONS;
    }
    return JSON.parse(v);
  } catch {
    return DEFAULT_SKELETONS;
  }
}

export function saveZeigarnikSkeletons(skeletons: ZeigarnikSkeleton[]): void {
  try {
    localStorage.setItem(SKELETONS_KEY, JSON.stringify(skeletons));
    window.dispatchEvent(new Event('savelog_skeletons_updated'));
  } catch {}
}

export function resolveSkeleton(id: string): void {
  const skeletons = getZeigarnikSkeletons().map(sk => 
    sk.id === id ? { ...sk, status: 'resolved' as const } : sk
  );
  saveZeigarnikSkeletons(skeletons);
  reduceBudgetEntropy(20); // 완료 시 엔트로피 20% 감소
}

// 매일 자정이 넘어 복귀할 때 물리 엔진 리셋 및 연동
// ⚠️ 하루에 정확히 한 번만 진행되어야 한다. savelog_daily.date는 첫 기록 전까지
// 어제로 남아있어 판정 기준으로 쓰면 같은 날 여러 번(앱·피드 마운트·복귀) 재실행되어
// 엔트로피가 중복 누적된다. 전용 키로 "마지막 물리 실행 날짜"를 따로 관리한다.
const LAST_PHYSICS_DATE_KEY = 'savelog_last_physics_date';
export function checkAndResetDailyPhysics(today: string): void {
  let lastPhysicsDate: string | null = null;
  try { lastPhysicsDate = localStorage.getItem(LAST_PHYSICS_DATE_KEY); } catch {}

  if (lastPhysicsDate === today) return; // 오늘 이미 처리됨 → 재실행 금지

  // 최초 실행(기존 유저 포함): 누적 없이 스켈레톤만 초기화
  if (!lastPhysicsDate) {
    saveZeigarnikSkeletons(DEFAULT_SKELETONS);
    try { localStorage.setItem(LAST_PHYSICS_DATE_KEY, today); } catch {}
    return;
  }

  // 날짜가 바뀐 첫 호출 — 하루치 물리 진행을 1회만 적용
  // 1. 미결된 자이가르닉 과제 개수 → 엔트로피 만료 벌점
  const skeletons = getZeigarnikSkeletons();
  const expiredCount = skeletons.filter(s => s.status === 'pending').length;

  // 2. 일일 자연 엔트로피 증가(+15%) + 미루기 만료 벌점(+10% × N)
  ageBudgetEntropy(expiredCount);

  // 3. 훅의 법칙 복원 가속 (어제 초과분 피드백)
  let spentYesterday = 0;
  try {
    const lastStateRaw = localStorage.getItem('savelog_daily');
    if (lastStateRaw) spentYesterday = JSON.parse(lastStateRaw).spentAmount || 0;
  } catch {}
  applyDailyRestoringForce(spentYesterday);

  // 4. 새로운 하루를 위해 스켈레톤 초기화 + 실행 날짜 기록
  saveZeigarnikSkeletons(DEFAULT_SKELETONS);
  try { localStorage.setItem(LAST_PHYSICS_DATE_KEY, today); } catch {}
}



