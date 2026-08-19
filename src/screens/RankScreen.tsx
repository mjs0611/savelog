import { useState, useEffect } from 'react';
import { Badge } from '@toss/tds-mobile';
import type { WeekRankRow } from '../lib/supabase';
import { formatAmount, formatWeekRange, getWeekKey, getPrevWeekKey, getTodayStr } from '../lib/utils';
import { sendCheeringMessage, getNickname, getPersona, getDailyMission } from '../lib/storage';
import { shareExternal, buildRankBragMessage } from '../lib/share';
import CustomIcon, { renderTextWithEmoji } from '../components/CustomIcon';
import { IconTrophy } from '../components/Icons';

interface Props {
  userId: string;
  weekRank: WeekRankRow[];
  prevWeekRank?: WeekRankRow[];
  loading: boolean;
  loadFailed?: boolean;
  dailyRecorded?: boolean;
  onClaimRankReward?: (amount: number) => void;
  claimedThisWeek?: boolean;
  rankClaiming?: boolean;
  onRetry?: () => void;
}

const MEDAL = ['🥇', '🥈', '🥉'];

export default function RankScreen({ userId, weekRank, prevWeekRank = [], loading, loadFailed, dailyRecorded = false, onClaimRankReward, claimedThisWeek, rankClaiming = false, onRetry }: Props) {
  const weekKey = getWeekKey();
  const [duelSent, setDuelSent] = useState<boolean>(() => {
    try { return localStorage.getItem(`savelog_duel_${getWeekKey()}`) === 'true'; } catch { return false; }
  });

  // 주가 바뀌면 duelSent 재동기화 (앱을 주 경계 넘어 열어둔 경우)
  useEffect(() => {
    try { setDuelSent(localStorage.getItem(`savelog_duel_${weekKey}`) === 'true'); } catch {}
  }, [weekKey]);



  // ── 순위 리워드는 지난 주 최종 성적 기준으로만 계산 ──
  // 참여자 게이트: 주간 참여 5명 미만이면 보상 미지급 (2026-W29 정산분부터 — 이전 주는 소급하지 않음)
  const MIN_WEEKLY_PARTICIPANTS = 5;
  const REWARD_GATE_FROM_WEEK = '2026-W29';
  const prevWeekKeyStr = getPrevWeekKey();
  const prevRewardGated = prevWeekKeyStr >= REWARD_GATE_FROM_WEEK && prevWeekRank.length < MIN_WEEKLY_PARTICIPANTS;
  const curRewardGated = weekRank.length < MIN_WEEKLY_PARTICIPANTS;
  const prevSpendGroup = prevWeekRank.filter(r => r.total > 0);
  const prevZeroGroup = prevWeekRank.filter(r => r.total === 0);
  const myPrevSpendIdx = prevSpendGroup.findIndex(r => r.user_id === userId);
  const myPrevZeroIdx = prevZeroGroup.findIndex(r => r.user_id === userId);
  const prevMyRow = myPrevSpendIdx >= 0 ? prevSpendGroup[myPrevSpendIdx]
    : myPrevZeroIdx >= 0 ? prevZeroGroup[myPrevZeroIdx] : null;
  const isPrevSuspicious = prevMyRow ? (prevMyRow.total === 0 && prevMyRow.doubtCount >= 3) : false;
  const prevMyDays = prevMyRow?.days ?? 0;
  const rankRewardAmount = isPrevSuspicious || prevRewardGated ? 0
    : myPrevSpendIdx === 0 && prevMyDays >= 3 ? 50
    : myPrevSpendIdx >= 0 && prevMyDays >= 3 && prevSpendGroup.length > 0 && (myPrevSpendIdx + 1) / prevSpendGroup.length <= 0.1 ? 30
    : myPrevZeroIdx === 0 && prevMyDays >= 3 ? 50
    : 0;


  // 이번 주 리그(유지출/무지출)별 보상 예상 — 실제 정산은 지난 주 성적 기준
  const curSpendGroup = weekRank.filter(r => r.total > 0);
  const curZeroGroup = weekRank.filter(r => r.total === 0);
  const projectReward = (row: WeekRankRow): { amount: number; label: string } | null => {
    if (curRewardGated) return null;
    if (row.days < 3) return null;
    if (row.total > 0) {
      const idx = curSpendGroup.findIndex(r => r.user_id === row.user_id);
      if (idx === 0) return { amount: 50, label: '유지출 1위' };
      if (curSpendGroup.length > 0 && (idx + 1) / curSpendGroup.length <= 0.1) return { amount: 30, label: '상위 10%' };
    } else {
      const idx = curZeroGroup.findIndex(r => r.user_id === row.user_id);
      if (idx === 0) return { amount: 50, label: '무지출 1위' };
    }
    return null;
  };

  const personaKey = getPersona() || 'hamster';
  let leagueName = "🌿 짠물 예산 방어 리그";
  if (personaKey === 'cost_ai') leagueName = "🤖 가성비 AI 분석가 리그";
  else if (personaKey === 'hamster') leagueName = "🐹 차곡차곡 도토리 수집 리그";
  else if (personaKey === 'flexer') leagueName = "🦄 낭만 소비 수비 리그";
  else if (personaKey === 'keeper') leagueName = "🛒 장바구니 신중 큐레이터 리그";

  return (
    <div className="screen screen-rank">
      <div className="rank-header">
        <h2 className="rank-title">
          주간 절약 순위
          <IconTrophy size={20} />
        </h2>
        <p className="rank-period">{formatWeekRange(weekKey)}</p>
        {/* 마감 임박에만 노출(넛지 피로 방지) — 손실 프레이밍+실데이터 사회적 증거 */}
        {(() => {
          const dow = new Date(getTodayStr()).getDay(); // 0=일
          if (dow !== 0 && dow !== 6) return null;
          const label = dow === 0 ? '오늘 밤 마감' : '내일 마감';
          return (
            <p style={{ margin: '4px 0 0', fontSize: '12px', fontWeight: 800, color: 'var(--accent, var(--ink-red-strong))' }}>
              <CustomIcon emoji="⏳" /> 이번 주 순위 {label}{weekRank.length > 0 ? ` · 지금 ${weekRank.length}명 참여 중` : ''}
            </p>
          );
        })()}
        <div className="glass-card" style={{
          background: 'var(--surface-dim)',
          padding: '12px 14px',
          fontSize: '13px',
          fontWeight: 800,
          color: 'var(--text-main)',
          borderRadius: '12px',
          marginTop: '8px',
          marginBottom: '16px'
        }}>
          <CustomIcon emoji="🏆" /> 소속 리그: {renderTextWithEmoji(leagueName)}
        </div>
        <p className="rank-reset-hint">{renderTextWithEmoji('🔄 매주 월요일 오전 9시 초기화')}</p>
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
              <span style={{ fontSize: '12px', color: 'var(--text-sub)', fontWeight: 600 }}><CustomIcon emoji="🪙" /> {mission.reward}원 리워드</span>
              {!mission.completed && (
                <span style={{ fontSize: '11px', color: 'var(--text-mute)' }}>지출 입력 시 자동 판정</span>
              )}
            </div>
          </div>
        );
      })()}

      {/* 내 순위 요약 */}
      {(() => {
        const myRankIdx = weekRank.findIndex(r => r.user_id === userId);
        if (myRankIdx < 0) return null;
        const myRow = weekRank[myRankIdx];
        const myScore = myRow.score ?? (800 * myRow.days + Math.round(Math.max(0, 100000 - myRow.total) / 100000 * 4400));
        const handleBragRank = () => {
          const statLine = myRow.total === 0
            ? `🌿 이번 주 무지출 달성 · ✍️ ${myRow.days}일 기록 · ${myScore}점`
            : `💸 이번 주 지출 ${formatAmount(myRow.total)} · ✍️ ${myRow.days}일 기록 · ${myScore}점`;
          shareExternal(buildRankBragMessage(myRankIdx + 1, weekRank.length, statLine));
        };
        return (
          <div className="glass-card my-rank-card" style={{ background: 'linear-gradient(135deg, rgba(26, 21, 51, 0.08) 0%, rgba(26, 21, 51, 0.02) 100%)', border: '1.5px solid rgba(26, 21, 51, 0.3)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="my-rank-left">
                <span className="my-rank-pos" style={{ color: 'var(--primary)', fontSize: '20px', fontWeight: 800 }}>{myRankIdx + 1}위</span>
                <span className="my-rank-label" style={{ fontSize: '12px', color: 'var(--text-sub)' }}>/ {weekRank.length}명</span>
              </div>
              <div className="my-rank-right" style={{ textAlign: 'right' }}>
                <p className="my-rank-amount" style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  {myRow.total === 0 ? <>0원 (무지출) <CustomIcon emoji="🌿" /></> : formatAmount(myRow.total)}
                </p>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <Badge size="small" color="blue" variant="weak">{myRow.days}일 기록</Badge>
                  <Badge size="small" color="green" variant="weak">{myScore}점</Badge>
                </div>
              </div>
            </div>
            <button
              onClick={handleBragRank}
              style={{ marginTop: '10px', width: '100%', padding: '9px', borderRadius: '10px', background: 'rgba(26, 21, 51,0.12)', color: 'var(--primary)', border: '1px solid rgba(26, 21, 51,0.3)', fontWeight: 800, cursor: 'pointer', fontSize: '12.5px' }}
            >
              <CustomIcon emoji="📣" /> 친구에게 내 순위 자랑하기
            </button>
          </div>
        );
      })()}

      {/* 도발 카드: 바로 위 순위 */}
      {(() => {
        const myRankIdx = weekRank.findIndex(r => r.user_id === userId);
        if (myRankIdx <= 0) return null;
        const above = weekRank[myRankIdx - 1];
        const me = weekRank[myRankIdx];
        const myScore = me.score ?? (800 * me.days + Math.round(Math.max(0, 100000 - me.total) / 100000 * 4400));
        const aboveScore = above.score ?? (800 * above.days + Math.round(Math.max(0, 100000 - above.total) / 100000 * 4400));
        const scoreDiff = aboveScore - myScore;

        return (
          <div className="glass-card duel-card" style={{ marginBottom: '16px' }}>
            <p className="duel-title"><CustomIcon emoji="🔥" /> 지금 역전 가능해요</p>
            <div className="duel-competitor-row">
              <div>
                <span className="duel-competitor-name">{above.nickname}</span>
                <span className="duel-competitor-pos">({myRankIdx}위)</span>
              </div>
              <span className="duel-diff">점수 차이 {scoreDiff}점</span>
            </div>
            <p className="duel-hint">
              {dailyRecorded ? '오늘 기록 완료! 내일 더 아끼거나 기록하면 역전할 수 있어요' : '오늘 하루 수비를 기록하면 점수를 획득해 역전할 수 있어요!'}
            </p>
            <button
              className="duel-action-btn"
              disabled={duelSent}
              onClick={() => {
                const myName = getNickname() || '나';
                const myPersona = getPersona();
                sendCheeringMessage(above.nickname, `⚡ 절약 대결 신청! 제 점수는 ${myScore}점인데 ${above.nickname}님을 추격 중이에요! 🔥`, myName, myPersona);
                try { localStorage.setItem(`savelog_duel_${weekKey}`, 'true'); } catch {}
                setDuelSent(true);
              }}
            >
              {duelSent ? '대결 신청 완료 ✓' : <><CustomIcon emoji="⚡" /> 1:1 절약 대결 신청하기</>}
            </button>
          </div>
        );
      })()}


      {/* 주간 리워드 안내 + 수령 */}
      <div className="glass-card reward-info-card">
        <p className="reward-info-title">주간 리워드</p>
        <div className="reward-rows">
          <div className="reward-row reward-row--section"><CustomIcon emoji="💸" /> 절약 순위 리워드 (유지출 그룹)</div>
          <div className="reward-row reward-row--indent"><CustomIcon emoji="🥇" /> 1위 (3일↑) <span>+50원</span></div>
          <div className="reward-row reward-row--indent"><CustomIcon emoji="📊" /> 상위 10% (3일↑) <span>+30원</span></div>
          <div className="reward-rows-divider" />
          <div className="reward-row reward-row--section"><CustomIcon emoji="🌿" /> 무지출 인증단 순위 리워드</div>
          <div className="reward-row reward-row--indent"><CustomIcon emoji="🥇" /> 1위 (3일↑) <span>+50원</span></div>
          <div className="reward-rows-divider" />
          <div className="reward-row"><CustomIcon emoji="📝" /> 매일 기록 <span>+3원</span></div>
        </div>
        <p className="reward-info-note">모든 리워드는 광고 시청 후 수령</p>
        {prevMyRow && rankRewardAmount === 0 && !isPrevSuspicious && prevMyDays > 0 && prevMyDays < 3 && (
          <p className="reward-days-hint"><CustomIcon emoji="📅" /> 지난 주 기록이 3일 미만이라 순위 리워드가 없어요 ({prevMyDays}/3일)</p>
        )}
        {prevWeekRank.length === 0 && (
          <p className="reward-days-hint"><CustomIcon emoji="📅" /> 순위 리워드는 매주 월요일 오전 9시 이후 지난 주 성적 기준으로 수령 가능해요</p>
        )}
        {rankRewardAmount > 0 && onClaimRankReward && (
          <button
            className="rank-reward-btn"
            disabled={claimedThisWeek || rankClaiming}
            onClick={() => onClaimRankReward(rankRewardAmount)}
          >
            {claimedThisWeek ? <><CustomIcon emoji="✅" /> 지난 주 리워드 수령 완료</> : rankClaiming ? '광고 시청 중...' : <><CustomIcon emoji="📺" /> 광고 보고 +{rankRewardAmount}원 받기</>}
          </button>
        )}
        <p className={`reward-note${rankRewardAmount > 0 ? ' reward-note--compact' : ''}`}>* 순위 리워드는 지난 주 성적 기준 · 3일 이상 기록 시 광고 보고 수령</p>
      </div>

      {/* 💡 하이브리드 절약 점수 안내 카드 */}
      <div className="glass-card" style={{ padding: '16px', background: 'var(--surface-dim)', borderRadius: '20px', border: '1px solid var(--divider)', marginBottom: '20px', textAlign: 'left' }}>
        <h4 style={{ margin: '0 0 6px 0', fontSize: '13px', fontWeight: 800, color: 'var(--primary)' }}><CustomIcon emoji="💡" /> savelog 하이브리드 점수제</h4>
        <p style={{ margin: 0, fontSize: '11px', lineHeight: '1.5', color: 'var(--text-sub)' }}>
          기록 성실도(최대 5,600점)와 주간 예산 절약비율(최대 4,400점)을 합산하여 <strong>10,000점 만점</strong>으로 공정하게 평가해요. 지출이 있어도 성실하게 기록하면 높은 점수를 얻을 수 있어요!
        </p>
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

          <p style={{ fontSize: '11px', color: 'var(--text-mute)', textAlign: 'center', margin: '0 0 8px' }}>
            <CustomIcon emoji="🏆" /> 뱃지 = 이번 주 마감 시 예상 보상 · 실제 지급은 지난 주 성적 기준
          </p>

          {/* 목표 근접 효과: 실참여 인원으로 게이트를 진행형으로 — "N명만 더" */}
          {curRewardGated && (
            <div className="glass-card" style={{ padding: '12px 14px', borderRadius: '12px', margin: '0 0 10px', background: '#FFFFFF', border: '1.5px solid var(--divider)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-main)' }}>보상 게이트 {Math.min(weekRank.length, MIN_WEEKLY_PARTICIPANTS)}/{MIN_WEEKLY_PARTICIPANTS}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-sub)' }}>
                  {MIN_WEEKLY_PARTICIPANTS - weekRank.length}명만 더 오면 전원 보상이 열려요
                </span>
              </div>
              <div style={{ height: '6px', borderRadius: '3px', background: 'var(--divider)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (weekRank.length / MIN_WEEKLY_PARTICIPANTS) * 100)}%`, borderRadius: '3px', background: 'var(--text-main)' }} />
              </div>
            </div>
          )}

          {weekRank.map((row, i) => {
            const rowScore = row.score ?? (800 * row.days + Math.round(Math.max(0, 100000 - row.total) / 100000 * 4400));
            const reward = projectReward(row);
            return (
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
                    {reward && (
                      <span style={{ marginLeft: 6, fontSize: '10px', fontWeight: 800, color: 'var(--primary)', background: 'rgba(26, 21, 51,0.12)', borderRadius: '8px', padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        <CustomIcon emoji="🏆" /> {reward.label} +{reward.amount}원
                      </span>
                    )}
                  </span>
                  <span className="rank-row-days" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: row.total === 0 ? 'var(--ink-blue)' : 'var(--brass)' }}>{row.total === 0 ? <><CustomIcon emoji="🌿" /> 무지출</> : <><CustomIcon emoji="💸" /> 유지출</>}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>·</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>{row.days}일 기록</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>·</span>
                    <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 800 }}>{rowScore}점</span>
                  </span>
                </div>
                <div className="rank-row-right">
                  <span className="rank-row-amount">{row.total === 0 ? <>무지출 <CustomIcon emoji="🌿" /></> : formatAmount(row.total)}</span>
                  {i === 0 && <span className="rank-crown"><CustomIcon emoji="👑" /></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rank-bottom-spacer" />
    </div>
  );
}
