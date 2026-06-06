import { getWeekRange } from './utils';

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
    name: '가성비 AI',
    color: '#00F5A0',
    desc: '모든 지출의 효율을 극대화하여 1원당 만족도를 계산하는 냉철한 절약 로봇.',
    icon: '/images/mbti_robot.png',
  },
  hamster: {
    key: 'hamster',
    emoji: '🐹',
    name: '자린고비 햄스터',
    color: '#FF9500',
    desc: '곳간에 도토리를 모으듯 무소유에 가까운 삶을 추구하는 생계형 절약러.',
    icon: '/images/mbti_hamster.png',
  },
  flexer: {
    key: 'flexer',
    emoji: '🦄',
    name: '기분파 탕진러',
    color: '#FF4D4F',
    desc: '"오늘만 산다!" 스트레스를 받으면 시발비용과 Flex로 감정을 달래는 낭만 가득 소비가.',
    icon: '/images/mbti_unicorn.png',
  },
  keeper: {
    key: 'keeper',
    emoji: '🛒',
    name: '장바구니 키퍼',
    color: '#3182F6',
    desc: '사고 싶은 건 장바구니에 담아두고 3일 고민하다 결국 포기하는 합리적 소비 지키미.',
    icon: '/images/mbti_cart.png',
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
      senderPersonaColor: p?.color || '#00F5A0',
      text: text.trim(),
      timestamp: '방금 전',
      created_at: new Date().toISOString(),
      recipientNickname
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
