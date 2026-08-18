import { useEffect, useState } from 'react';
import { fetchGivenJudgments, fetchReceivedReputation, type Entry } from '../lib/supabase';
import { formatAmount } from '../lib/utils';
import CustomIcon from './CustomIcon';

interface Props {
  userId: string;
  entries: Entry[];
}

/**
 * 혜택 장부 — 내 기록이 "누구에게" 이득이었는지 한 판에 보여준다.
 * 자백·판정만 있던 화면에 수혜자를 이름으로 붙이는 레이어.
 * 세 숫자 전부 실측(내 entries의 saved_amount / 내가 남긴 판정 / 내가 받은 판정)이고,
 * 0이면 숫자를 부풀리는 대신 다음 행동을 알려준다. (빈약속 금지)
 */
export default function BenefitLedger({ userId, entries }: Props) {
  const [given, setGiven] = useState<{ count: number; people: number } | null>(null);
  const [received, setReceived] = useState<number | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    fetchGivenJudgments(userId).then(r => { if (alive) setGiven(r); }).catch(() => {});
    fetchReceivedReputation(userId).then(r => { if (alive) setReceived(r.trust + r.doubt); }).catch(() => {});
    return () => { alive = false; };
  }, [userId]);

  const savedTotal = entries.reduce(
    (s, e) => s + e.items.reduce((a, it) => a + (it.saved_amount ?? 0), 0), 0);
  const zeroDays = new Set(entries.filter(e => e.total_amount === 0).map(e => e.date)).size;

  const helpedPeople = given?.people ?? 0;
  const judgeCount = given?.count ?? 0;
  const receivedCount = received ?? 0;

  return (
    <div className="benefit-ledger">
      <p className="benefit-ledger-eyebrow">혜택 장부</p>
      <h3 className="benefit-ledger-title">내 기록으로 누가 덕 봤나</h3>

      <div className="benefit-ledger-grid">
        <div className="benefit-ledger-cell">
          <span className="benefit-ledger-who"><CustomIcon emoji="🌱" /> 미래의 나</span>
          <span className="benefit-ledger-value benefit-ledger-value--saved">
            {savedTotal > 0 ? `+${formatAmount(savedTotal)}` : '0원'}
          </span>
          <span className="benefit-ledger-note">
            {savedTotal > 0
              ? `참아서 남긴 몫${zeroDays > 0 ? ` · 무지출 ${zeroDays}일` : ''}`
              : '참은 돈을 적으면 여기 쌓여요'}
          </span>
        </div>

        <div className="benefit-ledger-cell">
          <span className="benefit-ledger-who"><CustomIcon emoji="🤝" /> 내가 도운 짠친</span>
          <span className="benefit-ledger-value">{helpedPeople}명</span>
          <span className="benefit-ledger-note">
            {judgeCount > 0 ? `내가 남긴 판정 ${judgeCount}번` : '판정 한 번이면 시작돼요'}
          </span>
        </div>

        <div className="benefit-ledger-cell">
          <span className="benefit-ledger-who"><CustomIcon emoji="💌" /> 나를 도운 짠친</span>
          <span className="benefit-ledger-value benefit-ledger-value--received">{receivedCount}번</span>
          <span className="benefit-ledger-note">
            {receivedCount > 0 ? '내 기록에 남겨준 판정' : '기록하면 짠친이 판정해줘요'}
          </span>
        </div>
      </div>

      <p className="benefit-ledger-foot">
        {helpedPeople > 0 && receivedCount > 0
          ? '주고받은 판정이 서로의 결제를 한 번씩 멈췄어요'
          : '판정은 주고받을수록 서로에게 남아요'}
      </p>
    </div>
  );
}
