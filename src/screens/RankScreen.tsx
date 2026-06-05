import { useState } from 'react';
import { Badge } from '@toss/tds-mobile';
import type { WeekRankRow } from '../lib/supabase';
import { formatAmount, formatWeekRange, getWeekKey } from '../lib/utils';
import { sendPokeNotification, getNickname, getPersona } from '../lib/storage';

interface Props {
  userId: string;
  weekRank: WeekRankRow[];
  loading: boolean;
  loadFailed?: boolean;
  onClaimRankReward?: (amount: number) => void;
  claimedThisWeek?: boolean;
  rankClaiming?: boolean;
  dailyRecorded?: boolean;
  onRetry?: () => void;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function RankScreen({ userId, weekRank, loading, loadFailed, onClaimRankReward, claimedThisWeek, rankClaiming = false, dailyRecorded = false, onRetry }: Props) {
  const weekKey = getWeekKey();
  const [duelSent, setDuelSent] = useState<boolean>(() => {
    try { return localStorage.getItem(`savelog_duel_${getWeekKey()}`) === 'true'; } catch { return false; }
  });

  // 무지출/유지출 리그 분리
  const spendGroup = weekRank.filter(r => r.total > 0);
  const zeroGroup = weekRank.filter(r => r.total === 0);

  const mySpendIdx = spendGroup.findIndex(r => r.user_id === userId);
  const myZeroIdx = zeroGroup.findIndex(r => r.user_id === userId);
  const inSpendGroup = mySpendIdx >= 0;
  const inZeroGroup = myZeroIdx >= 0;

  // 의심 반응 3개 이상이면 리워드 수령 불가
  const myRow = inSpendGroup ? spendGroup[mySpendIdx] : (inZeroGroup ? zeroGroup[myZeroIdx] : null);
  const isSuspicious = myRow ? (myRow.total === 0 && myRow.doubtCount >= 3) : false;

  // 수령 가능한 순위 리워드 계산 (의심됨 상태면 0, 최소 3일 기록 필요)
  const myDays = myRow?.days ?? 0;
  const rankRewardAmount = isSuspicious ? 0
    : inSpendGroup && mySpendIdx === 0 && myDays >= 3 ? 50
    : inSpendGroup && myDays >= 3 && spendGroup.length > 0 && (mySpendIdx + 1) / spendGroup.length <= 0.1 ? 30
    : inZeroGroup && myZeroIdx === 0 && myDays >= 3 ? 50
    : 0;

  return (
    <div className="screen screen-rank">
      <div className="rank-header">
        <h2 className="rank-title">
          주간 절약 순위
          <img src="/images/icon_rank.png" className="custom-icon" style={{ marginLeft: 5 }} />
        </h2>
        <p className="rank-period">{formatWeekRange(weekKey)}</p>
        <p style={{ margin: '4px 0 0 0', fontSize: 10, color: 'var(--text-mute)', fontWeight: 700 }}>
          🔄 매주 월요일 오전 9시 초기화
        </p>
      </div>

      {/* 내 순위 요약 */}
      {(inSpendGroup || inZeroGroup) && myRow && (
        <div className="glass-card my-rank-card" style={isSuspicious ? { border: '1px solid rgba(255,77,79,0.3)', background: 'rgba(255,77,79,0.04)' } : inZeroGroup ? { border: '1px solid rgba(0,245,160,0.2)', background: 'rgba(0,245,160,0.03)' } : {}}>
          <div className="my-rank-left">
            {inSpendGroup ? (
              <>
                <span className="my-rank-pos">{mySpendIdx + 1}위</span>
                <span className="my-rank-label">/ {spendGroup.length}명</span>
              </>
            ) : (
              <>
                <span className="my-rank-pos" style={{ fontSize: 13 }}>무지출</span>
                <span className="my-rank-label">{myZeroIdx + 1}번째</span>
              </>
            )}
          </div>
          <div className="my-rank-right">
            <p className="my-rank-amount">{inZeroGroup ? '0원 🎉' : formatAmount(myRow.total)}</p>
            <Badge size="small" color={inZeroGroup ? 'green' : 'blue'} variant="weak">{myRow.days}일 기록</Badge>
            {myRow.days > 0 && myRow.total > 0 && (
              <p style={{ margin: '4px 0 0 0', fontSize: 10, color: 'var(--text-mute)' }}>
                일평균 {formatAmount(Math.round(myRow.total / myRow.days))}
              </p>
            )}
            {inZeroGroup && (
              <p style={{ margin: '4px 0 0 0', fontSize: 10, color: 'var(--primary)', fontWeight: 700 }}>
                👑 무지출 인증단
              </p>
            )}
            {isSuspicious && (
              <p style={{ margin: '4px 0 0 0', fontSize: 10, color: '#FF4D4F', fontWeight: 700 }}>
                ⚠ 의심 반응이 많아 리워드가 제한됩니다
              </p>
            )}
          </div>
        </div>
      )}

      {/* 도발 카드: 바로 위 순위 (유지출 그룹만) */}
      {inSpendGroup && mySpendIdx > 0 && (
        <div className="glass-card" style={{ padding: '12px 16px', border: '1px solid rgba(255, 77, 79, 0.2)', background: 'rgba(255, 77, 79, 0.04)' }}>
          <p style={{ margin: 0, fontSize: 11, color: '#FF4D4F', fontWeight: 800, marginBottom: 6 }}>🔥 지금 역전 가능해요</p>
          {(() => {
            const above = spendGroup[mySpendIdx - 1];
            const me = spendGroup[mySpendIdx];
            const amountDiff = me.total - above.total;
            const daysDiff = above.days - me.days;
            const isTotalTied = amountDiff === 0;
            const isDaysTied = daysDiff === 0;

            let diffLabel: string;
            if (!isTotalTied) {
              diffLabel = `차이 ${formatAmount(amountDiff)}`;
            } else if (daysDiff > 0) {
              diffLabel = `기록 ${daysDiff}일 차이`;
            } else {
              diffLabel = '기록 시작일 차이';
            }

            let hint: string;
            if (!isTotalTied) {
              hint = dailyRecorded ? '오늘 기록 완료! 내일도 절약하면 역전할 수 있어요' : '오늘 기록하면 이 사람을 추월할 수 있어요';
            } else if (!isDaysTied) {
              hint = dailyRecorded ? '지출 금액이 같아요! 꾸준히 기록해서 기록 일수로 역전하세요' : '지출 금액이 같아요! 오늘 기록하면 기록 일수로 역전할 수 있어요';
            } else {
              hint = '지출·기록 일수가 동일해요! 이번 주를 더 일찍 시작한 사람이 앞서 있어요';
            }

            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>{above.nickname}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-mute)', marginLeft: 6 }}>({mySpendIdx}위)</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#FF4D4F' }}>{diffLabel}</span>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: 11, color: 'var(--text-mute)' }}>{hint}</p>
                <button
                  disabled={duelSent}
                  onClick={() => {
                    const above = spendGroup[mySpendIdx - 1];
                    const myName = getNickname() || '나';
                    const myPersona = getPersona();
                    sendPokeNotification(above.nickname, myName, myPersona, false);
                    try { localStorage.setItem(`savelog_duel_${weekKey}`, 'true'); } catch {}
                    setDuelSent(true);
                  }}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: '10px 0',
                    borderRadius: 12,
                    border: duelSent ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255, 77, 79, 0.3)',
                    background: duelSent ? 'rgba(255,255,255,0.03)' : 'rgba(255, 77, 79, 0.08)',
                    color: duelSent ? 'var(--text-mute)' : '#FF4D4F',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: duelSent ? 'default' : 'pointer',
                  }}
                >
                  {duelSent ? '대결 신청 완료 ✓' : '⚡ 1:1 절약 대결 신청하기'}
                </button>
              </>
            );
          })()}
        </div>
      )}

      {/* 리워드 안내 */}
      <div className="glass-card reward-info-card">
        <p className="reward-info-title">주간 리워드</p>
        <div className="reward-rows">
          <div className="reward-row" style={{ fontSize: 10, color: 'var(--text-mute)', fontWeight: 900, marginBottom: 2 }}>💸 절약 순위 리워드 (유료 지출 그룹)</div>
          <div className="reward-row" style={{ paddingLeft: 8 }}>🥇 1위 (3일↑) <span>+50원</span></div>
          <div className="reward-row" style={{ paddingLeft: 8 }}>📊 상위 10% (3일↑) <span>+30원</span></div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
          <div className="reward-row" style={{ fontSize: 10, color: 'var(--text-mute)', fontWeight: 900, marginBottom: 2 }}>🌿 무지출 인증단 순위 리워드</div>
          <div className="reward-row" style={{ paddingLeft: 8 }}>🥇 1위 (3일↑) <span>+50원</span></div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
          <div className="reward-row">🔥 7일 완주 <span>+20원</span></div>
          <div className="reward-row">📝 매일 기록 <span>+3원</span></div>
          <div className="reward-row">👃 게시글 반응 <span>+1원</span></div>
        </div>
        <p style={{ margin: '8px 0 0 0', fontSize: 10, color: 'var(--text-mute)', lineHeight: 1.5 }}>
          👃 게시글 반응만 즉시 지급 · 나머지 모두 광고 시청 후 수령
        </p>
        {(inSpendGroup || inZeroGroup) && rankRewardAmount === 0 && !isSuspicious && myDays > 0 && myDays < 3 && (
          <p style={{ margin: '10px 0 0 0', fontSize: 11, color: 'var(--text-mute)', textAlign: 'center' }}>
            📅 순위 리워드는 3일 이상 기록 후 수령 가능해요 ({myDays}/3일)
          </p>
        )}
        {rankRewardAmount > 0 && onClaimRankReward && (
          <button
            disabled={claimedThisWeek || rankClaiming}
            onClick={() => onClaimRankReward(rankRewardAmount)}
            style={{
              marginTop: 14,
              width: '100%',
              padding: '13px 0',
              borderRadius: 12,
              border: 'none',
              background: claimedThisWeek || rankClaiming
                ? 'rgba(255,255,255,0.05)'
                : 'linear-gradient(135deg, #FFD700 0%, #FF9500 100%)',
              color: claimedThisWeek || rankClaiming ? 'var(--text-mute)' : '#090A10',
              fontSize: 13,
              fontWeight: 900,
              cursor: claimedThisWeek || rankClaiming ? 'default' : 'pointer',
              boxShadow: claimedThisWeek || rankClaiming ? 'none' : '0 4px 15px rgba(255, 215, 0, 0.25)',
              transition: 'all 0.2s',
            }}
          >
            {claimedThisWeek ? `✅ 이번 주 리워드 수령 완료` : rankClaiming ? '광고 시청 중...' : `📺 광고 보고 +${rankRewardAmount}원 받기`}
          </button>
        )}
        <p className="reward-note" style={{ marginTop: rankRewardAmount > 0 ? 8 : 0 }}>* 순위 리워드는 최소 3일 기록 후 광고 시청 시 지급됩니다</p>
      </div>

      {/* 순위 리스트 */}
      {loading ? (
        <div className="rank-skeleton">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="skeleton-rank-row" />)}
        </div>
      ) : loadFailed && weekRank.length === 0 ? (
        <div className="empty-state">
          <p>순위를 불러오지 못했어요</p>
          <p className="empty-sub">네트워크 상태를 확인해 주세요</p>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                marginTop: 12,
                padding: '8px 20px',
                borderRadius: 100,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text-sub)',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              다시 시도
            </button>
          )}
        </div>
      ) : weekRank.length === 0 ? (
        <div className="empty-state">
          <p>이번 주 기록이 아직 없어요</p>
          <p className="empty-sub">먼저 소비를 기록하면 순위에 오를 수 있어요!</p>
        </div>
      ) : (
        <div className="rank-list">
          {loadFailed && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', marginBottom: 8, background: 'rgba(255,200,0,0.06)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 10 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,200,0,0.9)', fontWeight: 700 }}>⚠ 순위 갱신 실패 · 마지막 데이터 표시 중</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,200,0,0.9)', background: 'rgba(255,200,0,0.12)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 100, padding: '3px 10px', cursor: 'pointer' }}
                >
                  재시도
                </button>
              )}
            </div>
          )}
          {/* 💸 유지출 절약 순위 */}
          {spendGroup.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
                <span style={{ fontSize: 9, color: 'var(--text-mute)', fontWeight: 700, whiteSpace: 'nowrap' }}>💸 절약 순위</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
              </div>
              {spendGroup.map((row, i) => (
                <div key={row.user_id} className={`rank-row glass-card ${row.user_id === userId ? 'rank-row--mine' : ''}`}>
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
                    <span className="rank-row-amount">{formatAmount(row.total)}</span>
                    {i === 0 && <span className="rank-crown">👑</span>}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* 👑 무지출 인증단 */}
          {zeroGroup.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: `${spendGroup.length > 0 ? '12px' : '4px'} 0 8px 0` }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,245,160,0.15)' }} />
                <span style={{ fontSize: 9, color: 'var(--primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>👑 무지출 인증단</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,245,160,0.15)' }} />
              </div>
              {zeroGroup.map((row, i) => (
                <div key={row.user_id} className={`rank-row glass-card ${row.user_id === userId ? 'rank-row--mine' : ''}`} style={{ border: '1px solid rgba(0, 245, 160, 0.15)', background: 'rgba(0,245,160,0.03)' }}>
                  <span className="rank-pos">
                    {i < 3 ? MEDAL[i] : <span className="rank-num">{i + 1}</span>}
                  </span>
                  <div className="rank-row-info">
                    <span className="rank-row-nickname">
                      {row.nickname}
                      {row.user_id === userId && (
                        <Badge size="xsmall" color="blue" variant="weak" style={{ marginLeft: 6 }}>나</Badge>
                      )}
                      {row.doubtCount >= 3 && (
                        <Badge size="xsmall" color="red" variant="weak" style={{ marginLeft: 4 }}>⚠ 의심됨</Badge>
                      )}
                    </span>
                    <span className="rank-row-days">{row.days}일 기록</span>
                  </div>
                  <div className="rank-row-right">
                    <span className="rank-row-amount rank-row-amount--zero">0원</span>
                    {i === 0 && <span className="rank-crown">👑</span>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
}
