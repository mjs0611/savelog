import { useState, useEffect } from 'react';
import CustomIcon from './CustomIcon';
import { getJellyPockets, setJellyPockets, type JellyPocket } from '../lib/storage';
import { formatAmount } from '../lib/utils';

export default function JellyPockets() {
  const [pockets, setPockets] = useState<JellyPocket[]>([]);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  
  useEffect(() => {
    setPockets(getJellyPockets());
  }, []);

  const handleEditClick = () => {
    const vals: Record<string, number> = {};
    pockets.forEach(p => {
      vals[p.category] = p.budget;
    });
    setEditValues(vals);
    setEditing(true);
  };

  const handleValueChange = (category: string, amount: number) => {
    setEditValues(prev => ({
      ...prev,
      [category]: Math.max(0, amount)
    }));
  };

  const handleSave = () => {
    const updated = pockets.map(p => ({
      ...p,
      budget: editValues[p.category] ?? p.budget
    }));
    setJellyPockets(updated);
    setPockets(updated);
    setEditing(false);
    window.dispatchEvent(new Event('savelog_budget_updated'));
  };

  const totalEditSum = Object.values(editValues).reduce((sum, v) => sum + v, 0);

  return (
    <div className="jelly-pockets-container glass-card">
      <div className="jelly-pockets-header">
        <h4 className="jelly-pockets-title">
          <CustomIcon emoji="🌱" /> 나의 디지털 젤리 저금통
        </h4>
        {!editing ? (
          <button className="jelly-edit-toggle" onClick={handleEditClick}>분배 설정</button>
        ) : (
          <div className="jelly-edit-actions">
            <button className="jelly-save-btn" onClick={handleSave}>저장</button>
            <button className="jelly-cancel-btn" onClick={() => setEditing(false)}>취소</button>
          </div>
        )}
      </div>

      {editing && (
        <p className="jelly-total-hint">
          설정된 총 주간 예산: <span className="jelly-bold">{formatAmount(totalEditSum)}</span>
        </p>
      )}

      <div className="jelly-jars-grid">
        {pockets.map(p => {
          const limit = p.budget;
          const spent = p.spent;
          const remaining = limit - spent;
          const pct = limit > 0 ? Math.max(0, Math.min(100, Math.round((remaining / limit) * 100))) : 0;
          
          // 젤리볼 개수 매칭 (최대 8개)
          const ballCount = limit > 0 ? Math.max(0, Math.ceil((remaining / limit) * 8)) : 0;
          const balls = Array.from({ length: ballCount });

          // 상태 구별
          let statusBadge = null;
          let faceEmoji = '🐹';
          let jarClassName = 'jelly-jar';

          if (remaining < 0) {
            statusBadge = <span className="jelly-status jelly-status--exceeded">💥 초과</span>;
            faceEmoji = '🌋';
            jarClassName += ' jelly-jar--exceeded';
          } else if (pct <= 30) {
            statusBadge = <span className="jelly-status jelly-status--warn">⚠️ 아슬</span>;
            faceEmoji = '🥱';
            jarClassName += ' jelly-jar--warn';
          } else {
            statusBadge = <span className="jelly-status jelly-status--good">🔋 안전</span>;
            faceEmoji = '🐹';
          }

          // 저금통 테마 색상 지정
          let jellyColor = 'var(--primary)';
          if (p.category.includes('식비')) jellyColor = '#FF9500';
          if (p.category.includes('카페')) jellyColor = '#FFD93D';
          if (p.category.includes('쇼핑')) jellyColor = '#FF7676';
          if (p.category.includes('기타')) jellyColor = '#3182F6';

          return (
            <div key={p.category} className={jarClassName}>
              <div className="jelly-jar-header">
                <span className="jelly-jar-emoji-wrap"><CustomIcon emoji={p.emoji} /></span>
                <span className="jelly-jar-name">{p.category.split('/')[0]}</span>
                {statusBadge}
              </div>

              {/* 3D 젤리 볼을 담고 있는 유리 단지 */}
              <div className="jelly-jar-glass">
                <div className="jelly-jar-lid" />
                <div className="jelly-jar-body">
                  <div className="jelly-balls-container">
                    {balls.map((_, i) => (
                      <div 
                        key={i} 
                        className="jelly-ball" 
                        style={{ 
                          background: jellyColor,
                          animationDelay: `${i * 0.08}s`
                        }}
                      />
                    ))}
                    {ballCount === 0 && (
                      <div className="jelly-jar-empty-face">{faceEmoji}</div>
                    )}
                  </div>
                  <div className="jelly-jar-pct">{pct}%</div>
                </div>
              </div>

              {/* 금액 영역 */}
              {!editing ? (
                <div className="jelly-jar-amounts">
                  <div className="jelly-jar-spent">{formatAmount(spent)} 사용</div>
                  <div className="jelly-jar-limit">총 {formatAmount(limit)}</div>
                </div>
              ) : (
                <div className="jelly-jar-inputs">
                  <button 
                    className="jelly-inc-btn" 
                    onClick={() => handleValueChange(p.category, (editValues[p.category] ?? p.budget) - 5000)}
                  >
                    -5k
                  </button>
                  <span className="jelly-edit-amount">
                    {formatAmount(editValues[p.category] ?? p.budget)}
                  </span>
                  <button 
                    className="jelly-inc-btn" 
                    onClick={() => handleValueChange(p.category, (editValues[p.category] ?? p.budget) + 5000)}
                  >
                    +5k
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
