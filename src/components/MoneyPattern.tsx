import { useState } from 'react';
import type { Entry } from '../lib/supabase';
import { formatAmount } from '../lib/utils';
import CustomIcon from './CustomIcon';
import { shareExternal } from '../lib/share';

const EMOTIONS = [
  { key: '충동', label: '충동' },
  { key: '홧김', label: '홧김/스트레스' },
  { key: '필요', label: '필요' },
  { key: '후회없', label: '후회없음' },
];

interface Persona {
  title: string;
  badge: string;
  emoji: string;
  line: string;
  tagline: string;
}

function analyze(entries: Entry[]) {
  const spendItems: { category: string; amount: number; comment: string }[] = [];
  const emotionCount: Record<string, number> = {};
  let zeroCount = 0;
  let savedTotal = 0;
  let spendTotal = 0;
  let dilemmaCount = 0;
  const weekdaySpend = [0, 0, 0, 0, 0, 0, 0];

  for (const e of entries) {
    const isZero = (e.total_amount ?? 0) === 0 && !e.items.some(it => (it.saved_amount ?? 0) > 0);
    if (isZero) zeroCount++;
    const wd = new Date(e.date + 'T00:00:00').getDay();

    for (const it of e.items) {
      if (it.category === '소비 고민') {
        dilemmaCount++;
        continue;
      }
      if (it.category === '한마디' || it.category === '마일스톤' || it.category === '꿀팁') continue;
      const saved = it.saved_amount ?? 0;
      if (saved > 0) {
        savedTotal += saved;
        continue;
      }
      if ((it.amount ?? 0) > 0) {
        spendItems.push({ category: it.category, amount: it.amount, comment: it.comment || '' });
        spendTotal += it.amount;
        if (wd >= 0 && wd <= 6) weekdaySpend[wd] += it.amount;
        const m = (it.comment || '').match(/^\[(.*?)\]/);
        if (m) {
          for (const em of EMOTIONS) {
            if (m[1].includes(em.key)) emotionCount[em.key] = (emotionCount[em.key] || 0) + 1;
          }
        }
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

  // 2024-2026 트렌드 돈 성격 MBTI 도출
  let persona: Persona;
  if (savedTotal > 0 && savedTotal >= spendTotal) {
    persona = {
      title: '갓생 방어러',
      badge: '방어율 1위',
      emoji: '🛡️',
      line: '배달·택시·커피를 참아 지킨 돈이 쓴 돈보다 많아요!',
      tagline: '쓸 땐 쓰고, 참을 땐 확실하게 막는 수비의 달인',
    };
  } else if (dilemmaCount >= 2) {
    persona = {
      title: '요노 큐레이터',
      badge: 'YONO 신중파',
      emoji: '⚖️',
      line: '사기 전 장바구니 48시간 쿨다운! 불필요한 군더더기는 털어내요.',
      tagline: '꼭 필요한 하나만 남기는 스마트 미니멀리스트',
    };
  } else if (zeroRate >= 0.5 && totalEntries >= 3) {
    persona = {
      title: '지갑 휴식파',
      badge: '무지출 마스터',
      emoji: '🌿',
      line: '돈 안 쓰고도 즐겁게 사는 법을 아는 무지출 챌린저!',
      tagline: '통장의 평화를 지키는 자린고비계의 힐러',
    };
  } else if (emotionTotal >= 2 && impulsive > deliberate) {
    persona = {
      title: '솔직 불꽃파',
      badge: '자백 브레이커',
      emoji: '🔥',
      line: '스트레스성 소비가 있지만, 솔직하게 털어놓고 털어내요.',
      tagline: '자백이 곧 브레이크! 짠친들과 함께 조절하는 중',
    };
  } else if (emotionTotal >= 2 && deliberate >= impulsive) {
    persona = {
      title: '후회 제로파',
      badge: '가심비 계획파',
      emoji: '📋',
      line: '필요한 곳에만 깔끔하게 쓰고 후회가 없는 지갑이에요.',
      tagline: '심리적 만족도(ROI) 100%를 추구하는 계획형 소비자',
    };
  } else if (topCat) {
    persona = {
      title: `${topCat[0].split('/')[0]} 사랑러`,
      badge: '원픽 진심파',
      emoji: '💸',
      line: `지갑이 주로 ${topCat[0].split('/')[0]}에 열리는 확실한 취향파예요.`,
      tagline: '좋아하는 것에는 아낌없이, 나머지는 절약',
    };
  } else {
    persona = {
      title: '꾸준 기록가',
      badge: '기록 마스터',
      emoji: '✍️',
      line: '하루하루 지갑 일기를 성실히 남기는 멋진 습관의 소유자예요.',
      tagline: '기록이 쌓일수록 내 돈의 주도권이 생겨요',
    };
  }

  return { spendCount: spendItems.length, topCat, topEmotion, emotionTotal, zeroRate, savedTotal, persona, totalEntries };
}

export default function MoneyPattern({ entries }: { entries: Entry[] }) {
  const a = analyze(entries);
  const MIN = 2;
  const [copied, setCopied] = useState(false);

  // 표본 부족 시 안내
  if (a.totalEntries < MIN) {
    const left = MIN - a.totalEntries;
    return (
      <div className="money-pattern money-pattern--teaser">
        <p className="money-pattern-eyebrow">내 소비 성향 분석</p>
        <p className="money-pattern-teaser-line">
          {left}번만 더 기록하면<br />내 돈 성격 MBTI가 보여요 🔍
        </p>
        <p className="money-pattern-sub">지출 자백, 지킨 돈, 무지출이 쌓이면 나만의 소비 유형이 완성돼요.</p>
      </div>
    );
  }

  const handleSharePattern = async () => {
    const text = `📊 나의 소비 성향은 [${a.persona.title} ${a.persona.emoji}]\n"${a.persona.line}"\n\n🛡️ 지킨 돈: ${formatAmount(a.savedTotal)} | 🌿 무지출: ${Math.round(a.zeroRate * 100)}%\nsavelog에서 내 소비 성향 확인하기 ➔`;
    await shareExternal(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="money-pattern">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p className="money-pattern-eyebrow">내 소비 성향 MBTI</p>
          <h3 className="money-pattern-title">
            <span className="money-pattern-emoji"><CustomIcon emoji={a.persona.emoji} /></span>
            {a.persona.title}
          </h3>
        </div>
        <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 8px', borderRadius: '100px', background: 'rgba(33, 30, 24, 0.08)', color: 'var(--primary)' }}>
          {a.persona.badge}
        </span>
      </div>

      <p className="money-pattern-line">{a.persona.line}</p>
      <p style={{ margin: '-4px 0 14px', fontSize: '11.5px', color: 'var(--text-mute)', lineHeight: 1.4 }}>{a.persona.tagline}</p>

      <div className="money-pattern-stats">
        <div className="money-pattern-stat">
          <span className="money-pattern-stat-label">그동안 지킨 돈</span>
          <span className="money-pattern-stat-value" style={{ color: a.savedTotal > 0 ? '#2F5A83' : 'inherit' }}>
            {a.savedTotal > 0 ? `+${formatAmount(a.savedTotal)}` : '0원'}
          </span>
        </div>
        <div className="money-pattern-stat">
          <span className="money-pattern-stat-label">무지출 비율</span>
          <span className="money-pattern-stat-value">{Math.round(a.zeroRate * 100)}%</span>
        </div>
        {a.topCat && (
          <div className="money-pattern-stat">
            <span className="money-pattern-stat-label">최다 지출처</span>
            <span className="money-pattern-stat-value">{a.topCat[0]}</span>
          </div>
        )}
        {a.emotionTotal > 0 && a.topEmotion && (
          <div className="money-pattern-stat">
            <span className="money-pattern-stat-label">자주 든 마음</span>
            <span className="money-pattern-stat-value">{EMOTIONS.find(e => e.key === a.topEmotion![0])?.label ?? a.topEmotion[0]}</span>
          </div>
        )}
      </div>

      <button
        onClick={handleSharePattern}
        style={{
          marginTop: '12px',
          width: '100%',
          padding: '9px',
          borderRadius: '12px',
          background: 'rgba(33, 30, 24, 0.06)',
          border: '1px solid var(--divider)',
          color: 'var(--text-main)',
          fontSize: '12px',
          fontWeight: 800,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px'
        }}
      >
        <CustomIcon emoji="📣" /> {copied ? '공유 문구 복사됨!' : '내 소비 성향 카드 공유하기'}
      </button>

      <p className="money-pattern-foot">지금까지 {a.totalEntries}번의 기록이 쌓여 만들어진 나</p>
    </div>
  );
}

