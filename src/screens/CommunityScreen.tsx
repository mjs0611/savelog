import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@toss/tds-mobile';
import {
  fetchCommunityPosts,
  createCommunityPost,
  toggleCommunityLike,
  fetchCommunityComments,
  addCommunityComment,
  deleteCommunityComment,
  deleteCommunityPost,
  type CommunityCategory,
  type CommunityPostWithMyLike,
  type CommunityComment,
} from '../lib/supabase';
import { PERSONAS, getPersona, getNickname } from '../lib/storage';
import { timeAgo } from '../lib/utils';
import CustomIcon from '../components/CustomIcon';
import TopTipsWidget from '../components/TopTipsWidget';

interface Props {
  userId: string;
}

// 광장 주제 — 거지방 정체성의 실전 주제 (DB 키는 기존 6종 재사용, 라벨만 재정의)
const CATEGORIES: { key: CommunityCategory | 'all'; label: string; emoji: string }[] = [
  { key: 'all',      label: '전체',       emoji: '🌿' },
  { key: 'daily',    label: '아낀 자랑',  emoji: '💸' },
  { key: 'question', label: '살까 말까',  emoji: '⚖️' },
  { key: 'together', label: '텅장 실화',  emoji: '😭' },
  { key: 'tip',      label: '꿀팁·핫딜',  emoji: '💡' },
  { key: 'recipe',   label: '짠밥 레시피', emoji: '🍳' },
  { key: 'free',     label: '잡담',       emoji: '💬' },
];

const POST_CATEGORIES: { key: CommunityCategory; label: string; emoji: string }[] = [
  { key: 'daily',    label: '아낀 자랑',  emoji: '💸' },
  { key: 'question', label: '살까 말까',  emoji: '⚖️' },
  { key: 'together', label: '텅장 실화',  emoji: '😭' },
  { key: 'tip',      label: '꿀팁·핫딜',  emoji: '💡' },
  { key: 'recipe',   label: '짠밥 레시피', emoji: '🍳' },
  { key: 'free',     label: '잡담',       emoji: '💬' },
];

const COMPOSE_PLACEHOLDER: Record<CommunityCategory, { title: string; content: string }> = {
  daily: { title: '예) 배달 참고 집밥 — 오늘 18,000원 지켰다', content: '오늘 뭘 참았고 얼마를 지켰는지 자랑해 주세요. 짠친들이 👏를 보냅니다.' },
  question: { title: '예) 에어팟 4세대, 지금 사도 될까요?', content: '뭘 살지 말지 고민되면 올려주세요. 짠친들이 말리거나 등을 밀어줍니다.' },
  together: { title: '예) 충동구매한 무드등, 3일째 박스째 있음', content: '지출 실패담을 고백하는 곳. 웃으면서 배웁니다. 어림도 없지!' },
  tip: { title: '예) 통신비 1만원대로 줄인 방법 / 지금 반값 핫딜', content: '실제로 돈이 굳는 꿀팁이나 핫딜 정보를 공유해 주세요.' },
  recipe: { title: '예) 5천원으로 4끼 — 냉털 카레', content: '가성비 최고의 레시피와 예상 비용을 알려주세요.' },
  free: { title: '제목을 입력해주세요', content: '돈 얘기든 아니든, 자유롭게.' },
};

// 오늘의 질문 — 날짜 해시로 매일 1개 고정 (빈 광장 콜드스타트용 대화 씨앗)
const DAILY_QUESTIONS: { q: string; category: CommunityCategory }[] = [
  { q: '이번 주 최고의 "안 사길 잘했다"는?', category: 'daily' },
  { q: '지금 장바구니에 며칠째 잠들어 있는 물건은?', category: 'question' },
  { q: '인생 최악의 충동구매를 고백한다면?', category: 'together' },
  { q: '요즘 제일 아까운 고정지출은?', category: 'free' },
  { q: '만원으로 하루 세 끼, 가능하다 vs 불가능하다?', category: 'recipe' },
  { q: '구독 서비스 중 하나만 남긴다면 뭘 남길래요?', category: 'question' },
  { q: '배달 끊기 도전, 최고 기록 며칠까지 가봤어요?', category: 'daily' },
  { q: '돈 굳는 나만의 이상한 습관 하나 공개!', category: 'tip' },
  { q: '월급날 제일 먼저 하는 일은?', category: 'free' },
  { q: '"이건 사치가 아니라 투자"라고 우기는 지출은?', category: 'together' },
  { q: '편의점에서 제일 가성비 좋은 조합은?', category: 'recipe' },
  { q: '올해 산 것 중 최고의 가성비 아이템은?', category: 'tip' },
  { q: '커피값 아끼는 본인만의 방법 있어요?', category: 'tip' },
  { q: '무지출 데이 성공하면 뭐가 제일 뿌듯해요?', category: 'daily' },
  { q: '친구가 "야 그돈씨"라고 말려준 적 있나요?', category: 'together' },
  { q: '요즘 눈독 들이는 물건, 짠친들이 판정해 드림', category: 'question' },
  { q: '집밥 vs 외식 — 진짜 아끼는 건 어느 쪽?', category: 'recipe' },
  { q: '텅장 직전에 겨우 참은 소비가 있다면?', category: 'daily' },
  { q: '중고로 사서 대성공한 물건은?', category: 'tip' },
  { q: '돈 안 쓰고 노는 최고의 주말 코스는?', category: 'free' },
  { q: '할부의 유혹, 어디까지 참아봤어요?', category: 'together' },
  { q: '냉장고 털어서 만든 인생 요리 있어요?', category: 'recipe' },
  { q: '"무료배송 채우려고 더 샀다" — 유죄 vs 무죄?', category: 'question' },
  { q: '지금 통장에 제일 미안한 지출은?', category: 'together' },
  { q: '앱테크/포인트 모으기, 실제로 얼마나 벌었어요?', category: 'tip' },
  { q: '경조사비, 다들 얼마가 적당하다고 생각해요?', category: 'free' },
  { q: '세일이라서 산 것 중 후회 1위는?', category: 'together' },
  { q: '한 달 식비, 다들 얼마나 써요?', category: 'free' },
  { q: '올해 가장 잘한 소비 하나만 자랑해 주세요', category: 'daily' },
  { q: '지갑 지키는 최후의 주문 한마디는?', category: 'tip' },
];

function todayQuestion(): { q: string; category: CommunityCategory } {
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const hash = key.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  return DAILY_QUESTIONS[Math.abs(hash) % DAILY_QUESTIONS.length];
}

function categoryMeta(key: CommunityCategory) {
  return POST_CATEGORIES.find(c => c.key === key) ?? POST_CATEGORIES[POST_CATEGORIES.length - 1];
}

export default function CommunityScreen({ userId }: Props) {
  const [category, setCategory] = useState<CommunityCategory | 'all'>('all');
  const [posts, setPosts] = useState<CommunityPostWithMyLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeCategory, setComposeCategory] = useState<CommunityCategory>('together');
  const [composeTitle, setComposeTitle] = useState('');
  const [composeContent, setComposeContent] = useState('');
  const [composeImage, setComposeImage] = useState<string | null>(null);
  const [composeImageError, setComposeImageError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [detailPost, setDetailPost] = useState<CommunityPostWithMyLike | null>(null);
  const [detailComments, setDetailComments] = useState<CommunityComment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [toastText, setToastText] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastText(msg);
    toastTimerRef.current = setTimeout(() => { setToastText(null); toastTimerRef.current = null; }, 2200);
  }
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    fetchCommunityPosts(category, userId).then(data => {
      if (cancelled) return;
      if (data === null) {
        setLoadFailed(true);
      } else {
        setPosts(data);
      }
    }).catch(() => {
      if (!cancelled) setLoadFailed(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [category, userId, refreshKey]);

  function openCompose() {
    setComposeCategory('together');
    setComposeTitle('');
    setComposeContent('');
    setComposeImage(null);
    setComposeImageError(null);
    setComposeOpen(true);
  }

  function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim; }
            else { width = Math.round((width * maxDim) / height); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('canvas context unavailable'));
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(url);
          resolve(dataUrl);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  async function handleComposeImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setComposeImageError('이미지가 너무 커요. 20MB 이하 파일을 선택해 주세요.');
      e.target.value = '';
      return;
    }
    setComposeImageError(null);
    try {
      const compressed = await compressImage(file, 1600, 0.85);
      setComposeImage(compressed);
    } catch {
      setComposeImageError('이미지를 불러오지 못했습니다.');
      e.target.value = '';
    }
  }

  async function handleSubmitPost() {
    const title = composeTitle.trim();
    const content = composeContent.trim();
    if (title.length < 2 || content.length < 5) {
      showToast('제목 2자 이상, 본문 5자 이상 입력해 주세요.');
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const nickname = getNickname() ?? '익명';
      const persona = getPersona();
      const created = await createCommunityPost({
        user_id: userId,
        nickname,
        persona,
        category: composeCategory,
        title,
        content,
        image: composeImage,
      });
      if (!created) {
        showToast('글 작성에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      setComposeOpen(false);
      showToast('🌿 글이 등록됐어요');
      // 새 글이 보이는 위치로 카테고리 이동
      if (category !== 'all' && category !== composeCategory) {
        setCategory(composeCategory);
      } else {
        setRefreshKey(k => k + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleLike(post: CommunityPostWithMyLike) {
    // 낙관 업데이트
    const prevLiked = post.liked_by_me;
    const prevCount = post.like_count;
    const optimistic = {
      ...post,
      liked_by_me: !prevLiked,
      like_count: Math.max(0, prevCount + (prevLiked ? -1 : 1)),
    };
    setPosts(prev => prev.map(p => p.id === post.id ? optimistic : p));
    if (detailPost?.id === post.id) setDetailPost(optimistic);

    const result = await toggleCommunityLike(post.id, userId);
    if (!result) {
      // 롤백
      setPosts(prev => prev.map(p => p.id === post.id ? post : p));
      if (detailPost?.id === post.id) setDetailPost(post);
      showToast('좋아요 처리에 실패했어요.');
      return;
    }
    const corrected = { ...post, liked_by_me: result.liked, like_count: result.like_count };
    setPosts(prev => prev.map(p => p.id === post.id ? corrected : p));
    if (detailPost?.id === post.id) setDetailPost(corrected);
  }

  function openDetail(post: CommunityPostWithMyLike) {
    setDetailPost(post);
    setDetailComments([]);
    setDetailLoading(true);
    setCommentDraft('');
    fetchCommunityComments(post.id).then(rows => {
      setDetailComments(rows);
    }).finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setDetailPost(null);
    setDetailComments([]);
    setCommentDraft('');
  }

  async function handleSubmitComment() {
    if (!detailPost) return;
    const text = commentDraft.trim();
    if (text.length === 0) return;
    if (commentSubmitting) return;
    setCommentSubmitting(true);
    try {
      const nickname = getNickname() ?? '익명';
      const persona = getPersona();
      const added = await addCommunityComment({
        post_id: detailPost.id,
        user_id: userId,
        nickname,
        persona,
        content: text,
      });
      if (!added) {
        showToast('댓글 작성에 실패했어요.');
        return;
      }
      setDetailComments(prev => [...prev, added]);
      setCommentDraft('');
      const updated = { ...detailPost, comment_count: detailPost.comment_count + 1 };
      setDetailPost(updated);
      setPosts(prev => prev.map(p => p.id === detailPost.id ? updated : p));
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function handleDeleteComment(c: CommunityComment) {
    if (!detailPost) return;
    if (c.user_id !== userId) return;
    if (!confirm('댓글을 삭제할까요?')) return;
    const ok = await deleteCommunityComment(c.id, detailPost.id);
    if (!ok) {
      showToast('댓글 삭제에 실패했어요.');
      return;
    }
    setDetailComments(prev => prev.filter(x => x.id !== c.id));
    const updated = { ...detailPost, comment_count: Math.max(0, detailPost.comment_count - 1) };
    setDetailPost(updated);
    setPosts(prev => prev.map(p => p.id === detailPost.id ? updated : p));
  }

  async function handleDeletePost() {
    if (!detailPost) return;
    if (detailPost.user_id !== userId) return;
    if (!confirm('이 글을 삭제할까요? 댓글도 함께 사라져요.')) return;
    const ok = await deleteCommunityPost(detailPost.id);
    if (!ok) {
      showToast('글 삭제에 실패했어요.');
      return;
    }
    setPosts(prev => prev.filter(p => p.id !== detailPost.id));
    closeDetail();
    showToast('글이 삭제됐어요.');
  }

  return (
    <div className="screen screen-community">
      {/* 🏆 금주의 짠테크 꿀팁 베스트 (피드에서 이동) */}
      <TopTipsWidget userId={userId} />

      {/* 오늘의 질문 — 매일 바뀌는 대화 씨앗, 답하기 원탭 */}
      {(() => {
        const tq = todayQuestion();
        return (
          <div className="glass-card" style={{ padding: '14px 16px', margin: '4px 0 0', textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: '10.5px', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.3px' }}>오늘의 질문</p>
            <p style={{ margin: '4px 0 10px', fontSize: '14.5px', fontWeight: 800, color: 'var(--text-main)', lineHeight: 1.45 }}>{tq.q}</p>
            <button
              onClick={() => {
                setComposeCategory(tq.category);
                setComposeTitle(tq.q);
                setComposeContent('');
                setComposeOpen(true);
              }}
              style={{ padding: '9px 16px', borderRadius: '100px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer' }}
            >
              답하기
            </button>
          </div>
        );
      })()}

      {/* 카테고리 탭바 */}
      <div className="community-cat-bar">
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`community-cat-chip ${category === c.key ? 'community-cat-chip--active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            <span className="community-cat-emoji"><CustomIcon emoji={c.emoji} /></span>
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      {/* 글 리스트 */}
      <div className="community-list">
        {loading ? (
          <>
            <div className="skeleton-card" style={{ height: '120px' }} />
            <div className="skeleton-card" style={{ height: '120px' }} />
            <div className="skeleton-card" style={{ height: '120px' }} />
          </>
        ) : loadFailed ? (
          <div className="empty-state">
            <p>커뮤니티를 불러오지 못했어요</p>
            <button onClick={() => setRefreshKey(k => k + 1)} className="rank-empty-retry-btn">다시 시도</button>
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <p>아직 글이 없어요</p>
            <p className="empty-sub">첫 번째 글을 남겨 보세요!</p>
          </div>
        ) : (
          posts.map(post => {
            const meta = categoryMeta(post.category);
            const p = post.persona ? PERSONAS[post.persona] : null;
            return (
              <button
                key={post.id}
                className="community-post-card"
                onClick={() => openDetail(post)}
              >
                <div className="community-post-meta-row">
                  <span className="community-post-cat" style={{ background: '#3182F61F', color: '#3182F6' }}>
                    <CustomIcon emoji={meta.emoji} /> {meta.label}
                  </span>
                  <span className="community-post-time">{timeAgo(post.created_at)}</span>
                </div>
                <h3 className="community-post-title">{post.title}</h3>
                <p className="community-post-content">{post.content}</p>
                {post.image && (
                  <div className="community-post-image-wrap">
                    <img src={post.image} alt="" className="community-post-image" />
                  </div>
                )}
                <div className="community-post-footer">
                  <span className="community-post-author">
                    {p ? <img src={p.icon} alt="" className="custom-icon--sm" /> : <CustomIcon emoji="🐷" className="custom-icon--sm" />} {post.nickname}
                  </span>
                  <span className="community-post-stats">
                    <span className={`community-stat ${post.liked_by_me ? 'community-stat--liked' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleToggleLike(post); }}
                    >
                      <CustomIcon emoji={post.liked_by_me ? '💖' : '🤍'} /> {post.like_count > 0 ? `${post.like_count}명의 응원` : '응원하기'}
                    </span>
                    <span className="community-stat"><CustomIcon emoji="💬" /> {post.comment_count}</span>
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 작성 FAB */}
      <button className="community-fab" onClick={openCompose} aria-label="새 글 작성">
        <CustomIcon emoji="📝" />
      </button>

      {/* 작성 모달 */}
      {composeOpen && (
        <div className="modal-overlay" onClick={() => !submitting && setComposeOpen(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <button className="modal-close-btn" onClick={() => setComposeOpen(false)} disabled={submitting}>✕</button>
              <h2 className="modal-title">새 글 작성</h2>
              <div className="modal-header-spacer" />
            </div>

            <div className="modal-body community-compose-body">
              <div className="community-compose-cat-row">
                {POST_CATEGORIES.map(c => (
                  <button
                    key={c.key}
                    className={`community-compose-cat-chip ${composeCategory === c.key ? 'community-compose-cat-chip--active' : ''}`}
                    onClick={() => setComposeCategory(c.key)}
                  >
                    <CustomIcon emoji={c.emoji} /> {c.label}
                  </button>
                ))}
              </div>

              <input
                className="community-compose-input"
                placeholder={COMPOSE_PLACEHOLDER[composeCategory].title}
                value={composeTitle}
                onChange={e => setComposeTitle(e.target.value.slice(0, 60))}
                maxLength={60}
              />
              
              <div className="community-textarea-wrap">
                <textarea
                  className="community-compose-textarea"
                  placeholder={COMPOSE_PLACEHOLDER[composeCategory].content}
                  value={composeContent}
                  onChange={e => setComposeContent(e.target.value.slice(0, 2000))}
                  maxLength={2000}
                  rows={8}
                />
                <span className="community-compose-counter">{composeContent.length}/2000</span>
              </div>

              <label className="community-compose-image-btn">
                <CustomIcon emoji="📷" /> 사진 첨부
                <input type="file" accept="image/*" onChange={handleComposeImageChange} style={{ display: 'none' }} />
              </label>
              {composeImageError && <p className="image-error-msg">{composeImageError}</p>}
              {composeImage && (
                <div className="community-compose-image-preview">
                  <img src={composeImage} alt="" />
                  <button className="community-compose-image-remove" onClick={() => setComposeImage(null)}>✕</button>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <div className="community-compose-actions">
                <Button display="full" size="large" color="dark" variant="weak" onClick={() => setComposeOpen(false)} disabled={submitting}>취소</Button>
                <Button display="full" size="large" color="primary" variant="fill" onClick={handleSubmitPost} disabled={submitting || composeTitle.trim().length < 2 || composeContent.trim().length < 5}>
                  {submitting ? '등록 중...' : '등록'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 상세 모달 */}
      {detailPost && (
        <div className="modal-overlay" onClick={closeDetail}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="community-post-cat" style={{ background: '#3182F61F', color: '#3182F6', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <CustomIcon emoji={categoryMeta(detailPost.category).emoji} /> {categoryMeta(detailPost.category).label}
              </span>
              <button className="modal-close-btn" onClick={closeDetail}>✕</button>
            </div>

            <div className="modal-body community-detail-body">
              <h3 className="community-detail-title">{detailPost.title}</h3>
              <div className="community-detail-meta">
                <span className="community-post-author">
                  {(() => { const p = detailPost.persona ? PERSONAS[detailPost.persona] : null;
                    return p ? <img src={p.icon} alt="" className="custom-icon--sm" /> : <CustomIcon emoji="🐷" className="custom-icon--sm" />; })()}
                  {detailPost.nickname}
                </span>
                <span className="community-post-time">{timeAgo(detailPost.created_at)}</span>
              </div>

              <p className="community-detail-content">{detailPost.content}</p>
              {detailPost.image && (
                <div className="community-detail-image-wrap">
                  <img src={detailPost.image} alt="" className="community-detail-image" />
                </div>
              )}

              <div className="community-detail-actions">
                <button
                  className={`community-stat ${detailPost.liked_by_me ? 'community-stat--liked' : ''}`}
                  onClick={() => handleToggleLike(detailPost)}
                >
                  <CustomIcon emoji={detailPost.liked_by_me ? '💖' : '🤍'} /> {detailPost.like_count > 0 ? `${detailPost.like_count}명의 응원` : '응원하기'}
                </button>
                <span className="community-stat"><CustomIcon emoji="💬" /> {detailPost.comment_count}</span>
                {detailPost.user_id === userId && (
                  <button className="community-detail-delete" onClick={handleDeletePost}>🗑 글 삭제</button>
                )}
              </div>

              {/* 댓글 */}
              <div className="community-comments-section">
                <h4 className="community-comments-title">댓글</h4>
                {detailLoading ? (
                  <p className="community-comments-loading">불러오는 중...</p>
                ) : detailComments.length === 0 ? (
                  <p className="community-comments-empty">첫 댓글을 남겨 보세요!</p>
                ) : (
                  <div className="community-comments-list">
                    {detailComments.map(c => {
                      const cp = c.persona ? PERSONAS[c.persona] : null;
                      return (
                        <div key={c.id} className="community-comment-row">
                          <div className="community-comment-avatar">
                            {cp ? <img src={cp.icon} alt="" /> : (c.nickname ? c.nickname.charAt(0).toUpperCase() : '?')}
                          </div>
                          <div className="community-comment-body">
                            <div className="community-comment-head">
                              <span className="community-comment-name">{c.nickname}</span>
                              <span className="community-comment-time">{timeAgo(c.created_at)}</span>
                              {c.user_id === userId && (
                                <button className="community-comment-del" onClick={() => handleDeleteComment(c)}>삭제</button>
                              )}
                            </div>
                            <p className="community-comment-text">{c.content}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))' }}>
              <div className="community-comment-input-row">
                <input
                  className="community-comment-input"
                  placeholder="댓글 달기..."
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value.slice(0, 200))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSubmitComment(); } }}
                  maxLength={200}
                />
                <button
                  className="community-comment-submit"
                  onClick={handleSubmitComment}
                  disabled={!commentDraft.trim() || commentSubmitting}
                >
                  게시
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {toastText && (
        <div className="point-toast point-toast--feed">{toastText}</div>
      )}
    </div>
  );
}
