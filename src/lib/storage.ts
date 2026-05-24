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

export function getUserKey(): number | null {
  const raw = localStorage.getItem(USER_KEY_KEY);
  return raw ? Number(raw) : null;
}

export function setUserKey(key: number): void {
  localStorage.setItem(USER_KEY_KEY, String(key));
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

export function updateStreak(today: string): StreakData {
  const data = loadStreak();
  if (data.lastDate === today) return data;

  const yesterday = new Date(today + 'T00:00:00');
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split('T')[0];

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

export function hasRecordedDate(dateStr: string): boolean {
  return localStorage.getItem('savelog_recorded_date_' + dateStr) === 'true';
}

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
  recipientNickname?: string;
}

const MESSAGES_KEY = 'savelog_user_messages';

export function getCheeringMessages(): CheeringMessage[] {
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) {
      // Seed initial mock messages so the mailbox is not empty on start
      const seed: CheeringMessage[] = [
        {
          id: 'seed-1',
          senderNickname: '시발비용맨',
          senderPersonaEmoji: '🔥',
          senderPersonaColor: '#FF7A00',
          text: '회원님의 무지출 기록에 깊은 감명을 받아서 저도 오늘 스타벅스 패스했습니다! 화이팅! ☕🔥',
          timestamp: '1시간 전',
          recipientNickname: '나'
        },
        {
          id: 'seed-2',
          senderNickname: '자린고비 햄스터',
          senderPersonaEmoji: '🐹',
          senderPersonaColor: '#FF9500',
          text: '점심 학식으로 대충 퉁치다니 엄청난 내공이십니다 ㄷㄷ 이번 주 절약왕 1위 달리시죠!',
          timestamp: '어제',
          recipientNickname: '나'
        }
      ];
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(seed));
      return seed;
    }
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
      id: Math.random().toString(),
      senderNickname: senderNickname || '익명 절약가',
      senderPersonaEmoji: p?.emoji || '🐷',
      senderPersonaColor: p?.color || '#00F5A0',
      text: text.trim(),
      timestamp: '방금 전',
      recipientNickname
    };
    currentMessages.unshift(newMessage);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(currentMessages));
  } catch (e) {
    console.error(e);
  }
}

export function sendPokeNotification(recipientNickname: string, senderNickname: string, senderPersonaKey: string | null, isPraise: boolean): void {
  try {
    const currentMessages = getCheeringMessages();
    const p = senderPersonaKey ? PERSONAS[senderPersonaKey] : null;
    const text = isPraise 
      ? `오늘 무지출 기록에 칭찬 콕! 찌르기를 보냈습니다. 🎉 (+5원 적립)`
      : `오늘 지출에 깜짝 일침 콕! 찌르기를 날렸습니다. "우리 절약합시다!" ⚡ (+5원 적립)`;
      
    const newMessage: CheeringMessage = {
      id: Math.random().toString(),
      senderNickname: senderNickname || '익명 절약가',
      senderPersonaEmoji: p?.emoji || '🐷',
      senderPersonaColor: p?.color || '#00F5A0',
      text,
      timestamp: '방금 전',
      recipientNickname
    };
    currentMessages.unshift(newMessage);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(currentMessages));
  } catch (e) {
    console.error('[sendPokeNotification]', e);
  }
}
