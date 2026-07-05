import { useEffect, useRef, useState } from 'react';
import { Button } from '@toss/tds-mobile';
import { addJelly, consumeRouletteSpin, getRouletteSpins } from '../lib/storage';
import CustomIcon, { renderTextWithEmoji } from './CustomIcon';

// 가중 랜덤 상금 — EV ≈ 17.7 젤리 (기록당 1회, 무지출 2회 기준 하루 기대치 ~18-35)
const PRIZES: { jelly: number; emoji: string; label: string; weight: number; jackpot?: boolean }[] = [
  { jelly: 5, emoji: '🍬', label: '위로의 젤리 5', weight: 34 },
  { jelly: 10, emoji: '🍭', label: '젤리 10', weight: 30 },
  { jelly: 20, emoji: '🧃', label: '젤리 20', weight: 20 },
  { jelly: 40, emoji: '✨', label: '반짝 젤리 40', weight: 10 },
  { jelly: 70, emoji: '💎', label: '레어 젤리 70', weight: 5 },
  { jelly: 150, emoji: '👑', label: '잭팟! 젤리 150', weight: 1, jackpot: true },
];

function rollPrize() {
  const total = PRIZES.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of PRIZES) {
    r -= p.weight;
    if (r < 0) return p;
  }
  return PRIZES[0];
}

interface Props {
  open: boolean;
  onClose: () => void;
  // 스핀 확정 시(젤리 지급 후) 호출 — 잭팟이면 호출측에서 자동 자랑글 게시
  onPrize?: (jelly: number, isJackpot: boolean) => void;
}

export default function RouletteModal({ open, onClose, onPrize }: Props) {
  const [spins, setSpins] = useState(() => getRouletteSpins());
  const [rolling, setRolling] = useState(false);
  const [display, setDisplay] = useState<typeof PRIZES[number] | null>(null);
  const [result, setResult] = useState<typeof PRIZES[number] | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const sync = () => setSpins(getRouletteSpins());
    window.addEventListener('savelog_roulette_updated', sync);
    return () => {
      window.removeEventListener('savelog_roulette_updated', sync);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!open) return null;

  const handleSpin = () => {
    if (rolling || getRouletteSpins() <= 0) return;
    setRolling(true);
    setResult(null);
    consumeRouletteSpin();
    const prize = rollPrize();
    let tick = 0;
    const totalTicks = 22; // ~1.8초 롤링 후 정지
    timerRef.current = setInterval(() => {
      tick += 1;
      if (tick >= totalTicks) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setDisplay(prize);
        setResult(prize);
        setRolling(false);
        addJelly(prize.jelly);
        onPrize?.(prize.jelly, !!prize.jackpot);
      } else {
        setDisplay(PRIZES[Math.floor(Math.random() * PRIZES.length)]);
      }
    }, tick < 14 ? 70 : 130);
  };

  return (
    <div className="modal-overlay" onClick={() => { if (!rolling) onClose(); }}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div style={{ padding: '22px 16px', textAlign: 'center', color: 'var(--text-main)' }}>
          <h3 style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800 }}>{renderTextWithEmoji('🎰 지갑 수비 룰렛')}</h3>
          <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--text-sub)' }}>
            오늘의 기록이 복권이 됩니다 — 남은 룰렛권 <strong style={{ color: 'var(--primary)' }}>{spins}회</strong>
          </p>

          {/* 릴 표시창 */}
          <div style={{
            margin: '0 auto 16px',
            width: '210px',
            padding: '22px 12px',
            borderRadius: '18px',
            border: result?.jackpot ? '2.5px solid #f59e0b' : '2px solid var(--primary-glow)',
            background: result?.jackpot ? 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(255,222,104,0.2))' : 'var(--primary-light)',
            transition: 'all 0.25s',
          }}>
            <div style={{ fontSize: '38px', lineHeight: 1.2, filter: rolling ? 'blur(1.5px)' : 'none', transform: rolling ? 'scale(0.96)' : 'scale(1)', transition: 'transform 0.1s' }}>
              <CustomIcon emoji={display?.emoji ?? '🎰'} />
            </div>
            <p style={{ margin: '8px 0 0', fontSize: '14.5px', fontWeight: 800, color: result?.jackpot ? '#b45309' : 'var(--text-main)' }}>
              {display ? display.label : '돌려서 확인!'}
            </p>
          </div>

          {result && !rolling && (
            <p style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 800, color: 'var(--primary)' }}>
              {result.jackpot ? renderTextWithEmoji('👑 잭팟!! 젤리 150개 획득 — 피드에 자동 자랑됩니다 🎉') : renderTextWithEmoji(`🐹 젤리 ${result.jelly}개 획득!`)}
            </p>
          )}

          <Button
            size="large"
            display="full"
            color="primary"
            variant="fill"
            disabled={rolling || spins <= 0}
            onClick={handleSpin}
          >
            {rolling ? '돌아가는 중...' : spins > 0 ? (result ? `한 번 더! (${spins}회 남음)` : `룰렛 돌리기 (${spins}회)`) : '내일 기록하고 또 받아요'}
          </Button>
          <button onClick={() => { if (!rolling) onClose(); }} style={{ marginTop: '10px', background: 'none', border: 'none', color: 'var(--text-mute)', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}>닫기</button>
        </div>
      </div>
    </div>
  );
}
