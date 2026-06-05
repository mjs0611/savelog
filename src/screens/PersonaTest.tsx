import { useState } from 'react';
import { Button } from '@toss/tds-mobile';
import { PERSONAS, setPersona } from '../lib/storage';

interface Question {
  id: number;
  text: string;
  options: {
    text: string;
    type: string;
  }[];
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    text: '소비할 때 가장 먼저 보는 것은 무엇인가요?',
    options: [
      { text: '가성비와 가격 대비 실용성', type: 'cost_ai' },
      { text: '일단 안 사고 버틸 방법이 있는지', type: 'hamster' },
      { text: '지금 나의 감정 상태와 갖고 싶은 기분', type: 'flexer' },
      { text: '리뷰 평점, 최저가, 그리고 할인율', type: 'keeper' },
    ],
  },
  {
    id: 2,
    text: '스트레스를 많이 받았을 때 나의 대처법은?',
    options: [
      { text: '집에서 조용히 잠을 자거나 동네 산책을 한다', type: 'hamster' },
      { text: '맛있는 야식을 시키거나 기분전환 쇼핑을 지른다', type: 'flexer' },
      { text: '가장 돈이 덜 들면서 생산적인 취미를 찾는다', type: 'cost_ai' },
      { text: '평소 눈여겨보던 걸 위시리스트에 꽉꽉 채워 넣는다', type: 'keeper' },
    ],
  },
  {
    id: 3,
    text: '이번 달 통장 잔고가 부족하다는 걸 깨달았을 때?',
    options: [
      { text: '즉시 무지출 챌린지 모드로 돌입한다', type: 'hamster' },
      { text: '어떻게든 되겠지 생각하며 다음 달의 나를 믿는다', type: 'flexer' },
      { text: '포인트 리워드 앱테크를 켜서 짤짤이를 모은다', type: 'cost_ai' },
      { text: '장바구니 리스트를 최저가 기준으로 순차 정렬한다', type: 'keeper' },
    ],
  },
  {
    id: 4,
    text: '평소 내 지출 통제 스타일은 어떤가요?',
    options: [
      { text: '계획에 정해진 선을 넘지 않는 철저한 통제', type: 'cost_ai' },
      { text: '아예 지갑을 열지 않는 극단적 절약', type: 'hamster' },
      { text: '필을 받았을 때 시원하게 지르는 플렉스', type: 'flexer' },
      { text: '할인 쿠폰과 적립금을 꼼꼼히 챙겨서 구매', type: 'keeper' },
    ],
  },
];

interface Props {
  onClose: (newPersona?: string) => void;
}

export default function PersonaTest({ onClose }: Props) {
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);

  const progressPercent = Math.round((answers.length / QUESTIONS.length) * 100);

  function handleSelect(type: string) {
    const nextAnswers = [...answers, type];
    setAnswers(nextAnswers);

    if (qIdx < QUESTIONS.length - 1) {
      setQIdx(qIdx + 1);
    } else {
      // Calculate result based on frequency
      const counts: Record<string, number> = {};
      let maxType = 'cost_ai';
      let maxCount = 0;

      for (const t of nextAnswers) {
        counts[t] = (counts[t] || 0) + 1;
        if (counts[t] >= maxCount) {
          maxCount = counts[t];
          maxType = t;
        }
      }
      setResult(maxType);
      setPersona(maxType);
    }
  }

  if (result) {
    const p = PERSONAS[result];
    return (
      <div className="modal-overlay">
        <div className="modal-sheet persona-result-sheet">
          <div className="modal-header">
            <button className="modal-close-btn" onClick={() => onClose()}>✕</button>
            <h2 className="modal-title">소비 MBTI 결과</h2>
            <div style={{ width: 32 }} />
          </div>
          <div className="modal-body result-body">
            <div className="result-header">
              <span className="result-subtitle">당신의 소비 MBTI 분석 결과</span>
              <h2 className="result-title" style={{ color: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <img src={p.icon} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                <span>{p.name}</span>
              </h2>
            </div>

            <div className="persona-illustration-card" style={{ borderColor: p.color + '40' }}>
              <div className="persona-big-emoji-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '15px 0' }}>
                <img src={p.icon} alt="" className="persona-big-3d-icon" style={{ width: 100, height: 100, objectFit: 'contain', filter: `drop-shadow(0 0 20px ${p.color}60)` }} />
              </div>
              <p className="persona-desc">{p.desc}</p>
            </div>

            <div className="persona-tag-badges">
              <span className="tag-badge">#절약_MBTI</span>
              <span className="tag-badge" style={{ color: p.color }}>#{p.name}</span>
            </div>

            <div className="result-actions">
              <Button
                size="xlarge"
                display="full"
                color="primary"
                variant="fill"
                onClick={() => onClose(result)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%' }}>
                  <span>배지 달고 피드로 가기</span>
                  <img src={p.icon} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                </div>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQ = QUESTIONS[qIdx];

  return (
    <div className="modal-overlay">
      <div className="modal-sheet persona-sheet">
        <div className="modal-header">
          <button className="modal-close-btn" onClick={() => onClose()}>✕</button>
          <h2 className="modal-title">나의 소비 MBTI 분석</h2>
          <div style={{ width: 32 }} />
        </div>

        <div className="modal-body">
          {/* Progress bar */}
          <div className="persona-progress-wrap">
            <div className="persona-progress-bar" style={{ width: `${progressPercent}%` }} />
          </div>

          <div className="question-section">
            <span className="question-num">Q. {currentQ.id} / {QUESTIONS.length}</span>
            <h3 className="question-text">{currentQ.text}</h3>
          </div>

          <div className="options-list">
            {currentQ.options.map((opt, i) => {
              const pOpt = PERSONAS[opt.type];
              return (
                <button
                  key={i}
                  className="option-btn"
                  onClick={() => handleSelect(opt.type)}
                  style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', width: '100%' }}
                >
                  <img src={pOpt.icon} alt="" className="option-3d-icon" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                  <span style={{ flex: 1 }}>{opt.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
