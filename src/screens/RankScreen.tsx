import { useState, useEffect } from 'react';
import { Badge } from '@toss/tds-mobile';
import type { WeekRankRow } from '../lib/supabase';
import { formatAmount, formatWeekRange, getWeekKey, getTodayStr } from '../lib/utils';
import { sendCheeringMessage, getNickname, getPersona, getDailyMission } from '../lib/storage';
import CustomIcon from '../components/CustomIcon';

interface Props {
  userId: string;
  weekRank: WeekRankRow[];
  prevWeekRank?: WeekRankRow[];
  loading: boolean;
  loadFailed?: boolean;
  dailyRecorded?: boolean;
  onRetry?: () => void;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function RankScreen({ userId, weekRank, prevWeekRank = [], loading, loadFailed, dailyRecorded = false, onRetry }: Props) {
  const weekKey = getWeekKey();
  const [duelSent, setDuelSent] = useState<boolean>(() => {
    try { return localStorage.getItem(`savelog_duel_${getWeekKey()}`) === 'true'; } catch { return false; }
  });

  // 주가 바뀌면 duelSent 재동기화 (앱을 주 경계 넘어 열어둔 경우)
  useEffect(() => {
    try { setDuelSent(localStorage.getItem(`savelog_duel_${weekKey}`) === 'true'); } catch {}
  }, [weekKey]);

  // 무지출/유지출 리그 분리
  const spendGroup = weekRank.filter(r => r.total > 0);
  const zeroGroup = weekRank.filter(r => r.total === 0);

  const mySpendIdx = spendGroup.findIndex(r => r.user_id === userId);
  const myZeroIdx = zeroGroup.findIndex(r => r.user_id === userId);
  const inSpendGroup = mySpendIdx >= 0;
  const inZeroGroup = myZeroIdx >= 0;

  // 내 순위 요약 (이번 주 — 도발 카드용)
  const myRow = inSpendGroup ? spendGroup[mySpendIdx] : (inZeroGroup ? zeroGroup[myZeroIdx] : null);
  const isSuspicious = false;

  // ── 순위 리워드는 지난 주 최종 성적 기준으로만 계산 ──
  const prevSpendGroup = prevWeekRank.filter(r => r.total > 0);
  const prevZeroGroup = prevWeekRank.filter(r => r.total === 0);
  const myPrevSpendIdx = prevSpendGroup.findIndex(r => r.user_id === userId);
  const myPrevZeroIdx = prevZeroGroup.findIndex(r => r.user_id === userId);
  const prevMyRow = myPrevSpendIdx >= 0 ? prevSpendGroup[myPrevSpendIdx]
    : myPrevZeroIdx >= 0 ? prevZeroGroup[myPrevZeroIdx] : null;
  const isPrevSuspicious = prevMyRow ? (prevMyRow.total === 0 && prevMyRow.doubtCount >= 3) : false;
  // 지난 주 데이터는 다른 곳(도발 등)에서 참고용으로만 유지
  void isPrevSuspicious;


  return (
    <div className="screen screen-rank">
      <div className="rank-header">
        <h2 className="rank-title">
          주간 절약 순위
          <img src="/images/icon_rank.png" className="custom-icon" />
        </h2>
        <p className="rank-period">{formatWeekRange(weekKey)}</p>
        <p className="rank-reset-hint">🔄 매주 월요일 오전 9시 초기화</p>
      </div>

      {/* 🎯 오늘의 일일 미션 */}
      {(() => {
        const today = getTodayStr();
        const mission = getDailyMission(today);
        const missionEmoji = mission.category === '식비' ? '🍚' : mission.category === '카페' ? '☕' : mission.category === '교통' ? '🚇' : mission.category === '쇼핑' ? '🛍️' : '✨';
        return (
          <div className={`glass-card rank-mission-card ${mission.completed ? 'rank-mission-card--completed' : ''}`} style={{ marginBottom: '16px', padding: '16px', borderRadius: '20px', border: '1.5px solid var(--divider)', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.5px' }}>오늘의 미션</span>
              <span style={{ fontSize: '11px', fontWeight: 800, color: mission.completed ? 'var(--success)' : 'var(--text-mute)' }}>
                {mission.completed ? '완료 ✓' : '진행 중'}
              </span>
            </div>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 6px 0', wordBreak: 'keep-all', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CustomIcon emoji={missionEmoji} /> {mission.action}
            </h4>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-sub)', fontWeight: 600 }}>🪙 {mission.reward}원 리워드</span>
              {!mission.completed && (
                <span style={{ fontSize: '11px', color: 'var(--text-mute)' }}>지출 입력 시 자동 판정</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* 내 순위 요약 */}
      {(inSpendGroup || inZeroGroup) && myRow && (
        <div className={`glass-card my-rank-card${isSuspicious ? ' my-rank-card--suspicious' : inZeroGroup ? ' my-rank-card--zero' : ''}`}>
          <div className="my-rank-left">
            {inSpendGroup ? (
              <>
                <span className="my-rank-pos">{mySpendIdx + 1}위</span>
                <span className="my-rank-label">/ {spendGroup.length}명</span>
              </>
            ) : (
              <>
                <span className="my-rank-pos my-rank-pos--zero">지갑 쉬는 날</span>
                <span className="my-rank-label">{myZeroIdx + 1}번째</span>
              </>
            )}
          </div>
          <div className="my-rank-right">
            <p className="my-rank-amount">{inZeroGroup ? '0원 🎉' : formatAmount(myRow.total)}</p>
            <Badge size="small" color={inZeroGroup ? 'green' : 'blue'} variant="weak">{myRow.days}일 기록</Badge>
            {myRow.days > 0 && myRow.total > 0 && (
              <p className="my-rank-sub">일평균 {formatAmount(Math.round(myRow.total / myRow.days))}</p>
            )}
            {inZeroGroup && <p className="my-rank-zero"><CustomIcon emoji="🌿" /> 지갑 쉬는 날을 보냈어요</p>}
          </div>
        </div>
      )}

      {/* 도발 카드: 바로 위 순위 (유지출 그룹만) */}
      {inSpendGroup && mySpendIdx > 0 && (
        <div className="glass-card duel-card">
          <p className="duel-title"><CustomIcon emoji="🔥" /> 지금 역전 가능해요</p>
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
                <div className="duel-competitor-row">
                  <div>
                    <span className="duel-competitor-name">{above.nickname}</span>
                    <span className="duel-competitor-pos">({mySpendIdx}위)</span>
                  </div>
                  <span className="duel-diff">{diffLabel}</span>
                </div>
                <p className="duel-hint">{hint}</p>
                <button
                  className="duel-action-btn"
                  disabled={duelSent}
                  onClick={() => {
                    const above = spendGroup[mySpendIdx - 1];
                    const myName = getNickname() || '나';
                    const myPersona = getPersona();
                    sendCheeringMessage(above.nickname, '⚡ 절약 대결을 신청했어요! 이번 주 누가 더 절약하나 같이 도전해봐요 🔥', myName, myPersona);
                    try { localStorage.setItem(`savelog_duel_${weekKey}`, 'true'); } catch {}
                    setDuelSent(true);
                  }}
                >
                  {duelSent ? '대결 신청 완료 ✓' : <><CustomIcon emoji="⚡" /> 1:1 절약 대결 신청하기</>}
                </button>
              </>
            );
          })()}
        </div>
      )}


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
            <button className="rank-empty-retry-btn" onClick={onRetry}>다시 시도</button>
          )}
        </div>
      ) : weekRank.length === 0 ? (
        <div className="empty-state">
          <p>이번 주 기록이 아직 없어요</p>
          <p className="empty-sub">오늘 하루를 남기면 페이스가 보여요</p>
        </div>
      ) : (
        <div className="rank-list">
          {loadFailed && (
            <div className="rank-stale-banner">
              <span className="rank-stale-text"><CustomIcon emoji="⚠️" /> 순위 갱신 실패 · 마지막 데이터 표시 중</span>
              {onRetry && (
                <button className="rank-stale-retry-btn" onClick={onRetry}>재시도</button>
              )}
            </div>
          )}
          {/* 💸 유지출 절약 순위 */}
          {spendGroup.length > 0 && (
            <>
              <div className="rank-divider">
                <div className="rank-divider-line" />
                <span className="rank-divider-label"><CustomIcon emoji="💸" /> 절약 순위</span>
                <div className="rank-divider-line" />
              </div>
              {spendGroup.map((row, i) => (
                <div key={row.user_id} className={`rank-row glass-card ${row.user_id === userId ? 'rank-row--mine' : ''}`}>
                  <span className="rank-pos">
                    {i < 3 ? <CustomIcon emoji={MEDAL[i]} /> : <span className="rank-num">{i + 1}</span>}
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
                    {i === 0 && <span className="rank-crown"><CustomIcon emoji="👑" /></span>}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* 👑 무지출 인증단 */}
          {zeroGroup.length > 0 && (
            <>
              <div className={`rank-divider${spendGroup.length > 0 ? ' rank-divider--zero' : ''}`}>
                <div className="rank-divider-line rank-divider-line--zero" />
                <span className="rank-divider-label rank-divider-label--zero"><CustomIcon emoji="👑" /> 무지출 인증단</span>
                <div className="rank-divider-line rank-divider-line--zero" />
              </div>
              {zeroGroup.map((row, i) => (
                <div key={row.user_id} className={`rank-row glass-card rank-row--zero ${row.user_id === userId ? 'rank-row--mine' : ''}`}>
                  <span className="rank-pos">
                    {i < 3 ? <CustomIcon emoji={MEDAL[i]} /> : <span className="rank-num">{i + 1}</span>}
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
                    <span className="rank-row-amount rank-row-amount--zero">0원</span>
                    {i === 0 && <span className="rank-crown">👑</span>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="rank-bottom-spacer" />
    </div>
  );
}
