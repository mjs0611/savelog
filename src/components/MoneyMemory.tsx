import { useEffect, useState } from 'react';
import { fetchMyAllEntries, type Entry } from '../lib/supabase';
import { formatAmount, getTodayStr } from '../lib/utils';

// 💎 머니 회고 — "N일 전 오늘"의 내 소비를 다시 띄운다.
// 쌓일수록 대체 불가능해지는 '재정 기억'을 만들어 switching cost를 복리로 키운다 (can't-live-without 축).
function daysAgoStr(n: number): string {
  const d = new Date(getTodayStr() + 'T00:00:00');
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function MoneyMemory({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchMyAllEntries(userId).then(d => { if (!cancelled && d) setEntries(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  // 가장 먼 과거(1년>1달>1주) 우선 — 오래될수록 회고 임팩트가 크다
  const candidates: { label: string; days: number }[] = [
    { label: '1년 전 오늘', days: 365 },
    { label: '한 달 전 오늘', days: 30 },
    { label: '일주일 전 오늘', days: 7 },
  ];
  let hit: { label: string; entry: Entry } | null = null;
  for (const c of candidates) {
    const target = daysAgoStr(c.days);
    const e = entries.find(x => x.date === target && x.week_key && !x.week_key.startsWith('milestone-'));
    if (e) { hit = { label: c.label, entry: e }; break; }
  }
  if (!hit) return null;

  const spent = hit.entry.total_amount;
  const today = getTodayStr();
  const todaySpent = entries.find(x => x.date === today)?.total_amount;

  return (
    <div className="glass-card" style={{ padding: '14px 16px', marginBottom: '16px', background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(31, 30, 28,0.06))', border: '1.5px solid rgba(168,85,247,0.2)', textAlign: 'left' }}>
      <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 800, color: '#a855f7' }}>💎 {hit.label}</p>
      <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--text-main)' }}>
        그날의 나는 {spent === 0
          ? <strong>지갑을 지켰어요 🌿</strong>
          : <><strong>{formatAmount(spent)}</strong>을 썼어요</>}.
        {todaySpent !== undefined && spent > 0 && (
          todaySpent < spent
            ? <span style={{ color: 'var(--primary)', fontWeight: 700 }}> 오늘은 더 아꼈네요 👏</span>
            : todaySpent > spent
              ? <span style={{ color: 'var(--text-sub)' }}> 오늘도 한 줄 남겨 기록을 이어가요.</span>
              : null
        )}
        {todaySpent === undefined && <span style={{ color: 'var(--text-sub)' }}> 오늘의 나도 한 줄 남겨봐요.</span>}
      </p>
    </div>
  );
}
