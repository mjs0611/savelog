import type { Entry } from '../lib/supabase';
import { diagnoseWoW } from '../lib/benchmark';
import { formatAmount } from '../lib/utils';
import CustomIcon from './CustomIcon';

interface Props {
  thisWeek: Entry[];
  lastWeek: Entry[];
}

// Phase 1: self-benchmark 진단 카드 — "지난주의 나 vs 이번주의 나"
// 평균이 아니라 '과거의 나'를 기준점으로 두어 부메랑 효과를 피하고 절감 후보를 드러낸다.
export default function SpendDiagnosisCard({ thisWeek, lastWeek }: Props) {
  const d = diagnoseWoW(thisWeek, lastWeek);

  // Layer 0 정직한 콜드스타트: 비교할 지난주 데이터가 없을 때
  if (!d.hasPrevData) {
    return (
      <div className="glass-card diagnosis-card">
        <h4 className="stats-card-title"><CustomIcon emoji="🩺" /> 소비 진단</h4>
        <p className="diagnosis-empty">
          이번 주 기록이 <b>다음 주 진단의 기준</b>이 돼요.<br />
          꾸준히 적으면 ‘지난주의 나’와 비교해 어디서 새는지 짚어드릴게요.
        </p>
      </div>
    );
  }

  const top = d.topOverspend;

  return (
    <div className="glass-card diagnosis-card">
      <h4 className="stats-card-title"><CustomIcon emoji="🩺" /> 소비 진단 · 지난주의 나 vs 이번주</h4>

      {/* 한 줄 요약 */}
      <div className="diagnosis-summary">
        <span className="diagnosis-summary-label">이번 주 총지출</span>
        <span className="diagnosis-summary-amount">{formatAmount(d.totalCurrent)}</span>
        {d.totalDeltaPct !== null && (
          <span className={`diagnosis-delta diagnosis-delta--${d.totalDeltaPct > 0 ? 'up' : d.totalDeltaPct < 0 ? 'down' : 'same'}`}>
            {d.totalDeltaPct > 0 ? '▲' : d.totalDeltaPct < 0 ? '▼' : '–'} {Math.abs(d.totalDeltaPct)}%
          </span>
        )}
      </div>

      {/* 절감 후보 강조 */}
      {top && (
        <div className="diagnosis-flag">
          <CustomIcon emoji="🎯" /> 줄일 여지가 가장 큰 곳은 <b>{top.category}</b>예요 —
          지난주보다 <b>{formatAmount(top.current - top.previous)}</b> 더 썼어요.
        </div>
      )}

      {/* 카테고리별 증감 */}
      <div className="diagnosis-rows">
        {d.rows.filter(r => r.current > 0 || r.previous > 0).map((r) => (
          <div key={r.category} className="diagnosis-row">
            <span className="diagnosis-row-name"><CustomIcon emoji={r.emoji} /> {r.category}</span>
            <span className="diagnosis-row-amt">{formatAmount(r.current)}</span>
            <span className={`diagnosis-row-delta diagnosis-row-delta--${r.status}`}>
              {r.status === 'new' && '신규'}
              {r.status === 'same' && '–'}
              {r.status === 'up' && `▲ ${r.deltaPct}%`}
              {r.status === 'down' && `▼ ${Math.abs(r.deltaPct ?? 0)}%`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
