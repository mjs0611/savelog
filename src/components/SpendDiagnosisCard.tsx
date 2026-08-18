import { useState, useEffect } from 'react';
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 렌더 후 다음 마이크로태스크에서 애니메이션 트리거
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

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
          <span className={`diagnosis-delta-pill diagnosis-delta-pill--${d.totalDeltaPct > 0 ? 'up' : d.totalDeltaPct < 0 ? 'down' : 'same'}`}>
            {d.totalDeltaPct > 0 ? '지난주보다 ' : d.totalDeltaPct < 0 ? '지난주보다 ' : ''}
            {d.totalDeltaPct > 0 ? `▲ ${Math.abs(d.totalDeltaPct)}%` : d.totalDeltaPct < 0 ? `▼ ${Math.abs(d.totalDeltaPct)}%` : '동일'}
          </span>
        )}
      </div>

      {/* 절감 후보 강조 */}
      {top && (
        <div className="diagnosis-flag">
          <div className="diagnosis-flag-header">
            <CustomIcon emoji="🎯" /> <span className="diagnosis-flag-title">이번 주 지출 통제 권장</span>
          </div>
          <p className="diagnosis-flag-desc">
            줄일 여지가 가장 큰 곳은 <b>{top.category.split('/')[0]}</b>예요.<br />
            지난주보다 <b>{formatAmount(top.current - top.previous)}</b> 더 썼어요.
          </p>
        </div>
      )}

      {/* 카테고리별 증감 비교 막대 */}
      <div className="diagnosis-rows">
        {d.rows.filter(r => r.current > 0 || r.previous > 0).map((r) => {
          // 최대값을 기준으로 비율 계산 (최소 5,000원 기준선)
          const maxVal = Math.max(...d.rows.map(row => Math.max(row.current, row.previous)), 5000);
          const prevPct = (r.previous / maxVal) * 100;
          const currPct = (r.current / maxVal) * 100;

          let deltaText = '유지';
          if (r.status === 'new') deltaText = '신규';
          else if (r.status === 'up') deltaText = `▲ ${r.deltaPct}%`;
          else if (r.status === 'down') deltaText = `▼ ${Math.abs(r.deltaPct ?? 0)}%`;

          return (
            <div key={r.category} className="diagnosis-row-item">
              <div className="diagnosis-row-header">
                <span className="diagnosis-row-name">
                  <CustomIcon emoji={r.emoji} /> {r.category.split('/')[0]}
                </span>
                <div className="diagnosis-row-values">
                  <span className="diagnosis-row-amt">{formatAmount(r.current)}</span>
                  <span className={`diagnosis-row-badge diagnosis-row-badge--${r.status}`}>
                    {deltaText}
                  </span>
                </div>
              </div>

              {/* 비교용 이중 게이지 바 */}
              <div className="diagnosis-compare-bar-group">
                <div className="diagnosis-compare-bar-row">
                  <span className="diagnosis-compare-label">지난주</span>
                  <div className="diagnosis-compare-bar-track">
                    <div 
                      className="diagnosis-compare-fill diagnosis-compare-fill--prev" 
                      style={{ width: mounted ? `${Math.max(2, prevPct)}%` : '0%' }}
                    />
                  </div>
                  <span className="diagnosis-compare-val">{formatAmount(r.previous)}</span>
                </div>
                <div className="diagnosis-compare-bar-row">
                  <span className="diagnosis-compare-label font-bold">이번주</span>
                  <div className="diagnosis-compare-bar-track">
                    <div 
                      className={`diagnosis-compare-fill diagnosis-compare-fill--${r.status}`} 
                      style={{ width: mounted ? `${Math.max(2, currPct)}%` : '0%' }}
                    />
                  </div>
                  <span className={`diagnosis-compare-val ${r.status === 'up' ? 'font-bold font-up' : r.status === 'down' ? 'font-bold font-down' : ''}`}>
                    {formatAmount(r.current)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
