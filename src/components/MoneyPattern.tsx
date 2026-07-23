import type { Entry } from '../lib/supabase';
import { formatAmount } from '../lib/utils';
import CustomIcon from './CustomIcon';

// 돈 패턴 회고 — 아레나의 "모은 자료를 다시 보면 내 사고방식의 패턴이 보인다"를
// 돈에 옮긴 것. 게임(젤리·펫) 대신 "쌓인 자백이 네 돈 성격을 드러낸다"는 내재적 재방문 훅.
// 순위·비교가 아니라 자기이해라서 거지방 온기와 충돌하지 않는다.

const EMOTIONS = [
  { key: '충동', label: '충동' },
  { key: '홧김', label: '홧김' },
  { key: '필요', label: '필요' },
  { key: '후회없', label: '후회없음' },
];

interface Persona { title: string; emoji: string; line: string; }

function analyze(entries: Entry[]) {
  const spendItems: { category: string; amount: number; comment: string }[] = [];
  const emotionCount: Record<string, number> = {};
  let zeroCount = 0;
  let savedTotal = 0;
  let spendTotal = 0;
  const weekdaySpend = [0, 0, 0, 0, 0, 0, 0];

  for (const e of entries) {
    if ((e.total_amount ?? 0) === 0 && !e.items.some(it => (it.saved_amount ?? 0) > 0)) zeroCount++;
    const wd = new Date(e.date + 'T00:00:00').getDay();
    for (const it of e.items) {
      if (it.category === '한마디' || it.category === '마일스톤' || it.category === '꿀팁' || it.category === '소비 고민') continue;
      const saved = it.saved_amount ?? 0;
      if (saved > 0) { savedTotal += saved; continue; }
      if ((it.amount ?? 0) > 0) {
        spendItems.push({ category: it.category, amount: it.amount, comment: it.comment || '' });
        spendTotal += it.amount;
        if (wd >= 0 && wd <= 6) weekdaySpend[wd] += it.amount;
        const m = (it.comment || '').match(/^\[(.*?)\]/);
        if (m) for (const em of EMOTIONS) if (m[1].includes(em.key)) emotionCount[em.key] = (emotionCount[em.key] || 0) + 1;
      }
    }
  }

  // 최다 카테고리
  const catCount: Record<string, number> = {};
  for (const it of spendItems) catCount[it.category] = (catCount[it.category] || 0) + 1;
  const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];

  // 지배 감정
  const topEmotion = Object.entries(emotionCount).sort((a, b) => b[1] - a[1])[0];
  const emotionTotal = Object.values(emotionCount).reduce((s, n) => s + n, 0);
  const impulsive = (emotionCount['충동'] || 0) + (emotionCount['홧김'] || 0);
  const deliberate = (emotionCount['필요'] || 0) + (emotionCount['후회없'] || 0);

  const totalEntries = entries.length;
  const zeroRate = totalEntries > 0 ? zeroCount / totalEntries : 0;

  // 돈 성격 도출 — 가장 강한 신호 하나
  let persona: Persona;
  if (emotionTotal >= 3 && impulsive > deliberate) {
    persona = { title: '충동파', emoji: '🔥', line: '지금 이 순간에 약한 타입. 자백이 곧 브레이크예요.' };
  } else if (emotionTotal >= 3 && deliberate > impulsive) {
    persona = { title: '계획파', emoji: '📋', line: '필요한 것만 쓰는 타입. 후회가 적은 지갑이에요.' };
  } else if (zeroRate >= 0.5 && totalEntries >= 4) {
    persona = { title: '절제파', emoji: '🌿', line: '무지출을 즐기는 타입. 안 쓰는 날이 더 많아요.' };
  } else if (savedTotal > 0 && savedTotal >= spendTotal) {
    persona = { title: '적립파', emoji: '🏦', line: '쓰기보다 모으는 재미를 아는 타입.' };
  } else if (topCat) {
    persona = { title: `${topCat[0].split('/')[0]} 편애`, emoji: '💸', line: `요즘 지갑이 ${topCat[0].split('/')[0]}에 자주 열려요.` };
  } else {
    persona = { title: '기록가', emoji: '✍️', line: '꾸준히 남기는 타입. 쌓일수록 또렷해져요.' };
  }

  return { spendCount: spendItems.length, topCat, topEmotion, emotionTotal, zeroRate, savedTotal, persona, totalEntries };
}

export default function MoneyPattern({ entries }: { entries: Entry[] }) {
  const a = analyze(entries);
  const MIN = 3;

  // 표본 부족 — 진행 훅 (자이가르닉: 조금만 더 쌓으면 성격이 보인다)
  if (a.spendCount < MIN) {
    const left = MIN - a.spendCount;
    return (
      <div className="money-pattern money-pattern--teaser">
        <p className="money-pattern-eyebrow">내 돈 성격</p>
        <p className="money-pattern-teaser-line">
          {left}번만 더 자백하면<br />네 돈 성격이 보이기 시작해요
        </p>
        <p className="money-pattern-sub">쌓인 기록이 곧 너를 설명해줘요. 순위가 아니라 나를 아는 일이에요.</p>
      </div>
    );
  }

  return (
    <div className="money-pattern">
      <p className="money-pattern-eyebrow">내 돈 성격</p>
      <h3 className="money-pattern-title">
        <span className="money-pattern-emoji"><CustomIcon emoji={a.persona.emoji} /></span>
        {a.persona.title}
      </h3>
      <p className="money-pattern-line">{a.persona.line}</p>

      <div className="money-pattern-stats">
        {a.topCat && (
          <div className="money-pattern-stat">
            <span className="money-pattern-stat-label">가장 자주 연 지갑</span>
            <span className="money-pattern-stat-value">{a.topCat[0]}</span>
          </div>
        )}
        {a.emotionTotal > 0 && a.topEmotion && (
          <div className="money-pattern-stat">
            <span className="money-pattern-stat-label">자주 남긴 마음</span>
            <span className="money-pattern-stat-value">{EMOTIONS.find(e => e.key === a.topEmotion![0])?.label ?? a.topEmotion[0]}</span>
          </div>
        )}
        <div className="money-pattern-stat">
          <span className="money-pattern-stat-label">무지출 비율</span>
          <span className="money-pattern-stat-value">{Math.round(a.zeroRate * 100)}%</span>
        </div>
        {a.savedTotal > 0 && (
          <div className="money-pattern-stat">
            <span className="money-pattern-stat-label">그동안 모은 돈</span>
            <span className="money-pattern-stat-value">{formatAmount(a.savedTotal)}</span>
          </div>
        )}
      </div>

      <p className="money-pattern-foot">지금까지 {a.totalEntries}번의 자백이 쌓여 만든 나</p>
    </div>
  );
}
