import { useEffect, useState } from 'react';
import { fetchFeed, type EntryWithReactions } from '../lib/supabase';
import { PERSONAS } from '../lib/storage';
import CustomIcon from './CustomIcon';

// 금주의 짠테크 꿀팁 베스트 — 피드(꿀팁 글)에서 추출해 커뮤니티 탭 상단에 노출
export default function TopTipsWidget({ userId }: { userId: string }) {
  const [entries, setEntries] = useState<EntryWithReactions[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchFeed(userId).then(d => { if (!cancelled && d) setEntries(d); }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const topTips = entries
    .flatMap(entry =>
      entry.items
        .filter(item => item.category === '꿀팁')
        .map(item => ({
          entryId: entry.id,
          nickname: entry.nickname,
          persona: entry.persona,
          item,
          likes: (entry.trust_count || 0) + (entry.doubt_count || 0),
        }))
    )
    .sort((a, b) => b.likes - a.likes)
    .slice(0, 5);

  if (topTips.length === 0) return null;

  return (
    <div className="top-tips-container">
      <h3 className="top-tips-title"><CustomIcon emoji="🏆" /> 금주의 짠테크 꿀팁 베스트</h3>
      <div className="top-tips-scroll">
        {topTips.map((tip, idx) => {
          const p = tip.persona ? PERSONAS[tip.persona] : null;
          return (
            <div key={`${tip.entryId}-${idx}`} className="top-tip-card">
              <div className="top-tip-header">
                <span className="top-tip-avatar" style={p ? { background: `${p.color}20`, color: p.color } : {}}>
                  {p ? <img src={p.icon} alt="" className="custom-icon--sm" /> : <CustomIcon emoji="🐷" className="custom-icon--sm" />}
                </span>
                <span className="top-tip-nickname">{tip.nickname}</span>
              </div>
              <p className="top-tip-text">
                <span className="top-tip-emoji"><CustomIcon emoji={tip.item.emoji} /></span>
                {(tip.item.comment || '').replace(/^\[.*?\]\s*/, '')}
              </p>
              <div className="top-tip-footer">
                <span className="top-tip-likes"><CustomIcon emoji="❤️" /> {tip.likes}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
