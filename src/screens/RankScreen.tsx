import { Badge } from '@toss/tds-mobile';
import type { WeekRankRow } from '../lib/supabase';
import { formatAmount, formatWeekRange, getWeekKey } from '../lib/utils';

interface Props {
  userId: string;
  weekRank: WeekRankRow[];
  loading: boolean;
  onClaimRankReward?: (amount: number) => void;
  claimedThisWeek?: boolean;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function RankScreen({ userId, weekRank, loading, onClaimRankReward, claimedThisWeek }: Props) {
  const weekKey = getWeekKey();
  const myIdx = weekRank.findIndex((r) => r.user_id === userId);
  const totalParticipants = weekRank.length;

  // 수령 가능한 순위 리워드 계산
  const rankRewardAmount = myIdx === 0 ? 100
    : myIdx >= 0 && totalParticipants > 0 && (myIdx + 1) / totalParticipants <= 0.1 ? 30
    : 0;

  return (
    <div className="screen screen-rank">
      <div className="rank-header">
        <h2 className="rank-title">
          주간 절약 순위
          <img src="/images/icon_rank.png" className="custom-icon" style={{ marginLeft: 5 }} />
        </h2>
        <p className="rank-period">{formatWeekRange(weekKey)}</p>
      </div>

      {/* 내 순위 요약 */}
      {myIdx >= 0 && (
        <div className="glass-card my-rank-card">
          <div className="my-rank-left">
            <span className="my-rank-pos">{myIdx + 1}위</span>
            <span className="my-rank-label">/ {totalParticipants}명</span>
          </div>
          <div className="my-rank-right">
            <p className="my-rank-amount">{formatAmount(weekRank[myIdx].total)}</p>
            <Badge size="small" color="blue" variant="weak">{weekRank[myIdx].days}일 기록</Badge>
          </div>
        </div>
      )}

      {/* 도발 카드: 바로 위 순위 */}
      {myIdx > 0 && (
        <div className="glass-card" style={{ padding: '12px 16px', border: '1px solid rgba(255, 77, 79, 0.2)', background: 'rgba(255, 77, 79, 0.04)' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#FF4D4F', fontWeight: 800, marginBottom: 6 }}>🔥 지금 역전 가능해요</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>{weekRank[myIdx - 1].nickname}</span>
              <span style={{ fontSize: 11, color: 'var(--text-mute)', marginLeft: 6 }}>({myIdx}위)</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#FF4D4F' }}>
              차이 {formatAmount(weekRank[myIdx].total - weekRank[myIdx - 1].total)}
            </span>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: 11, color: 'var(--text-mute)' }}>오늘 기록하면 이 사람을 추월할 수 있어요</p>
        </div>
      )}

      {/* 리워드 안내 */}
      <div className="glass-card reward-info-card">
        <p className="reward-info-title">주간 리워드</p>
        <div className="reward-rows">
          <div className="reward-row">🥇 1위 <span>+100원</span></div>
          <div className="reward-row">상위 10% <span>+30원</span></div>
          <div className="reward-row">7일 완주 <span>+20원</span></div>
          <div className="reward-row">매일 기록 <span>+3원/일</span></div>
        </div>
        {rankRewardAmount > 0 && onClaimRankReward && (
          <button
            disabled={claimedThisWeek}
            onClick={() => onClaimRankReward(rankRewardAmount)}
            style={{
              marginTop: 12,
              width: '100%',
              padding: '10px 0',
              borderRadius: 10,
              border: 'none',
              background: claimedThisWeek
                ? 'rgba(255,255,255,0.05)'
                : 'linear-gradient(135deg, #FFD700 0%, #FF9500 100%)',
              color: claimedThisWeek ? 'var(--text-mute)' : '#090A10',
              fontSize: 13,
              fontWeight: 900,
              cursor: claimedThisWeek ? 'default' : 'pointer',
              boxShadow: claimedThisWeek ? 'none' : '0 4px 12px rgba(255, 200, 0, 0.25)',
              transition: 'all 0.2s',
            }}
          >
            {claimedThisWeek ? `✅ 이번 주 리워드 수령 완료` : `🏆 리워드 수령하기 +${rankRewardAmount}원`}
          </button>
        )}
        <p className="reward-note" style={{ marginTop: rankRewardAmount > 0 ? 8 : 0 }}>* 순위 리워드는 즉시 지급됩니다</p>
      </div>

      {/* 순위 리스트 */}
      {loading ? (
        <div className="rank-skeleton">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton-rank-row" />)}
        </div>
      ) : weekRank.length === 0 ? (
        <div className="empty-state">
          <p>이번 주 기록이 아직 없어요</p>
          <p className="empty-sub">먼저 소비를 기록하면 순위에 오를 수 있어요!</p>
        </div>
      ) : (
        <div className="rank-list">
          {weekRank.map((row, i) => (
            <div
              key={row.user_id}
              className={`rank-row glass-card ${row.user_id === userId ? 'rank-row--mine' : ''}`}
            >
              <span className="rank-pos">
                {i < 3 ? MEDAL[i] : <span className="rank-num">{i + 1}</span>}
              </span>
              <div className="rank-row-info">
                <span className="rank-row-nickname">
                  {row.nickname}
                  {row.user_id === userId && (
                    <Badge size="xsmall" color="blue" variant="weak" style={{ marginLeft: 6 }}>나</Badge>
                  )}
                </span>
                <span className="rank-row-days">{row.days}일 기록</span>
              </div>
              <div className="rank-row-right">
                <span className={`rank-row-amount ${row.total === 0 ? 'rank-row-amount--zero' : ''}`}>
                  {formatAmount(row.total)}
                </span>
                {i === 0 && <span className="rank-crown">👑</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}
