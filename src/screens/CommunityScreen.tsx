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

interface Props {
  userId: string;
}

const CATEGORIES: { key: CommunityCategory | 'all'; label: string; emoji: string }[] = [
  { key: 'all',      label: '전체',       emoji: '🌿' },
  { key: 'together', label: '같이 놀기',  emoji: '🤝' },
  { key: 'tip',      label: '플러스 꿀팁', emoji: '💡' },
  { key: 'recipe',   label: '웰빙 레시피', emoji: '🍳' },
  { key: 'daily',    label: '소소한 성취', emoji: '☀️' },
  { key: 'question', label: '짠친 고민',  emoji: '❓' },
  { key: 'free',     label: '자유 톡',    emoji: '💬' },
];

const POST_CATEGORIES: { key: CommunityCategory; label: string; emoji: string }[] = [
  { key: 'together', label: '같이 놀기',  emoji: '🤝' },
  { key: 'tip',      label: '플러스 꿀팁', emoji: '💡' },
  { key: 'recipe',   label: '웰빙 레시피', emoji: '🍳' },
  { key: 'daily',    label: '소소한 성취', emoji: '☀️' },
  { key: 'question', label: '짠친 고민',  emoji: '❓' },
  { key: 'free',     label: '자유 톡',    emoji: '💬' },
];

const COMPOSE_PLACEHOLDER: Record<CommunityCategory, { title: string; content: string }> = {
  together: {
    title: '예) 점심 먹고 산책하면서 10분 걷기 놀이 🏃',
    content: '우리 어떤 놀이를 같이 해볼까요? 친구들과 부담 없이 함께할 챌린지 규칙을 정해주세요!',
  },
  tip: { title: '예) 안 쓰면 100% 할인! 나만의 해피 머니 세이빙 꿀팁 ☕', content: '일상에서 소소하지만 확실하게 \'플러스\'가 되었던 꿀팁이나 습관을 공유해주세요!' },
  recipe: { title: '예) 냉장고 털이용 초간단 5천원 마라샹궈 🍳', content: '건강도 챙기고 지갑도 지키는 나만의 \'가성비 웰빙 레시피\'가 있다면 레시피와 예상 비용을 알려주세요!' },
  daily: { title: '예) 오늘 소비 안 하고 도서관에서 책 빌렸어요 📚', content: '오늘 나를 기분 좋게 만든 작고 확실한 절약 성취나, 짠친들과 나누고 싶은 소소한 일상을 남겨주세요.' },
  question: { title: '예) 다들 배달 앱 대신 포장 주문 자주 하시나요? 🤔', content: '합리적인 소비 생활을 하면서 궁금했던 점을 짠친들에게 물어보고 서로의 아이디어를 나눠요.' },
  free: { title: '제목을 입력해주세요', content: '자유롭게 이야기 나눠보세요.' },
};

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
                  <span className="community-post-cat" style={{ background: '#3182F61F', color: '#7FAEFF' }}>
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
              <span className="community-post-cat" style={{ background: '#3182F61F', color: '#7FAEFF', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
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
