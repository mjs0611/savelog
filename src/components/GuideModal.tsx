import { Button } from '@toss/tds-mobile';
import { renderTextWithEmoji } from './CustomIcon';

// savelog 사용법 — 개념이 많아 3그룹으로 위계화 (기본 루프 → 오늘의 재미 → 짠친과 함께)
const GROUPS: { title: string; items: { emoji: string; title: string; desc: string }[] }[] = [
  {
    title: '기본 · 하루 한 줄이면 됩니다',
    items: [
      { emoji: '✍️', title: '매일 한 줄 기록', desc: '오늘 쓴 돈을 한 줄로 남겨요. 안 썼으면 그냥 무지출이라고 쓰면 돼요.' },
      { emoji: '💰', title: '토스포인트 (진짜 현금)', desc: '기록하면 쌓여요. "광고 보고 받기"를 누르면 실제 토스포인트로 받아요.' },
      { emoji: '🪙', title: '젤리 (앱 안 재화)', desc: '기록·룰렛·배틀로 모이는 가상 재화. 절약 요정을 꾸미는 데 써요.' },
    ],
  },
  {
    title: '오늘의 재미',
    items: [
      { emoji: '🎰', title: '지갑 수비 룰렛', desc: '기록 1번 = 룰렛권 1장(무지출은 2장). 돌리면 젤리 5~150개가 랜덤으로!' },
      { emoji: '🐹', title: '절약 요정 (펫)', desc: '기록하면 자라고, 방치하면 어수선해져요. 마이로그에서 젤리로 꾸며요.' },
      { emoji: '🎯', title: '절약 목표', desc: '여행·갖고 싶은 것 등 목표를 정하면 오늘 안 쓴 돈이 게이지를 채워요.' },
      { emoji: '🛒', title: '충동 대기방', desc: '사고 싶은 걸 담아두면 48시간 뒤 "아직도 원해?"라고 물어봐요. 참으면 목표 충전.' },
    ],
  },
  {
    title: '짠친과 함께',
    items: [
      { emoji: '🔒', title: '짠 서클 (기본 공간)', desc: '3~8명이 우리끼리 기록을 보는 방이에요. 초대 코드나 랜덤 매칭으로 들어가고, 다 같이 주간 보스를 잡아요.' },
      { emoji: '⚖️', title: '판정과 스탬프', desc: '짠친 기록에 응원이나 스탬프(어림도 없지, 그돈씨…)를 찍어요. 같은 스탬프 2표면 판결 확정!' },
      { emoji: '🤔', title: '살까 고민', desc: '살까 말까 망설일 때 올리면 짠친들이 투표로 말려줘요. 보고 최종 결정해요.' },
      { emoji: '💞', title: '짝꿍 · 머니 듀오 · 배틀', desc: '서로 맞팔하면 짝꿍. 듀오를 맺으면 목표·스트릭을 함께 키우고, "오늘 하루 덜 쓰기 배틀"도 걸 수 있어요.' },
      { emoji: '🗣️', title: '광장', desc: '아낀 자랑, 살까 말까, 텅장 실화, 꿀팁·핫딜까지. 매일 바뀌는 오늘의 질문도 있어요.' },
      { emoji: '🏆', title: '주간 순위', desc: '절약 점수(기록+절약)로 리그 경쟁. 상위권은 토스포인트 보상을 받아요.' },
    ],
  },
];

export default function GuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 16px 12px', textAlign: 'left' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>{'savelog 사용법'}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-sub)' }}>하루 한 줄 기록하면, 나머지는 전부 따라와요.</p>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 16px', flex: 1 }}>
          {GROUPS.map((g) => (
            <div key={g.title} style={{ marginBottom: '6px' }}>
              <p style={{ margin: '14px 0 4px', fontSize: '13px', fontWeight: 800, color: 'var(--primary)', textAlign: 'left' }}>{renderTextWithEmoji(g.title)}</p>
              {g.items.map((s) => (
                <div key={s.title} style={{ display: 'flex', gap: '12px', padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', textAlign: 'left' }}>
                  <span style={{ fontSize: '20px', flexShrink: 0, lineHeight: 1.2 }}>{renderTextWithEmoji(s.emoji)}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '13.5px', fontWeight: 800, color: 'var(--text-main)' }}>{s.title}</p>
                    <p style={{ margin: '3px 0 0', fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.5 }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding: '12px 16px 16px' }}>
          <Button size="large" display="full" color="primary" variant="fill" onClick={onClose}>이해했어요</Button>
        </div>
      </div>
    </div>
  );
}
