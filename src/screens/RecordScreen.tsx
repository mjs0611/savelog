import { useState } from 'react';
import { Button, TextField } from '@toss/tds-mobile';
import type { SpendingItem } from '../lib/supabase';
import { formatAmount } from '../lib/utils';

const CATEGORIES = [
  { label: '식비',  emoji: '🍚' },
  { label: '배달',  emoji: '🛵' },
  { label: '교통',  emoji: '🚇' },
  { label: '카페',  emoji: '☕' },
  { label: '쇼핑',  emoji: '🛍️' },
  { label: '취미',  emoji: '🎮' },
  { label: '시발비용', emoji: '🔥' },
  { label: 'Flex',  emoji: '💎' },
  { label: '술/유흥', emoji: '🍻' },
  { label: '의료',  emoji: '💊' },
  { label: '기타',  emoji: '📦' },
];

interface Props {
  onSubmit: (items: SpendingItem[], image?: string) => Promise<void>;
  onClose: () => void;
  submitting: boolean;
}

export default function RecordScreen({ onSubmit, onClose, submitting }: Props) {
  const [items, setItems] = useState<SpendingItem[]>([]);
  const [showForm, setShowForm] = useState(true);
  const [selCat, setSelCat] = useState(CATEGORIES[0]);
  const [amountStr, setAmountStr] = useState('');
  const [comment, setComment] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showZeroNote, setShowZeroNote] = useState(false);
  const [zeroNote, setZeroNote] = useState('');

  const total = items.reduce((s, i) => s + i.amount, 0);

  function addItem() {
    const amount = parseInt(amountStr.replace(/,/g, '')) || 0;
    if (amount < 0) return;
    // 0원 항목은 메모가 있을 때만 허용 (버튼 disabled 조건과 일치)
    if (amount === 0 && !comment.trim()) return;
    setItems((prev) => [
      ...prev,
      { category: selCat.label, emoji: selCat.emoji, amount, comment: comment.trim() },
    ]);
    setAmountStr('');
    setComment('');
    setShowForm(false);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    // 마지막 항목을 삭제하면 폼을 다시 열어서 바로 입력할 수 있게 함
    if (items.length === 1) setShowForm(true);
  }

  function handleAmountChange(val: string) {
    const digits = val.replace(/\D/g, '');
    if (!digits) { setAmountStr(''); return; }
    const num = Math.min(parseInt(digits, 10), 9999999);
    setAmountStr(num.toLocaleString('ko-KR'));
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setImageError('이미지 크기는 2MB 이하여야 합니다.');
      e.target.value = '';
      return;
    }
    setImageError(null);
    const input = e.target;
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.error) {
        setImageError('이미지를 불러오지 못했습니다. 다른 파일을 시도해 주세요.');
        input.value = '';
        return;
      }
      setImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (items.length === 0) return;
    // 폼에 금액을 입력했지만 "항목 추가"를 누르지 않은 경우 자동으로 추가
    let finalItems = items;
    if (showForm && amountStr) {
      const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;
      if (amount > 0 || (amount === 0 && comment.trim())) {
        const autoItem = { category: selCat.label, emoji: selCat.emoji, amount, comment: comment.trim() };
        finalItems = [...items, autoItem];
        setItems(finalItems);
        setAmountStr('');
        setComment('');
        setShowForm(false);
      }
    }
    await onSubmit(finalItems, image || undefined);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-sheet">
        {/* 헤더 */}
        <div className="modal-header">
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>✕</button>
          <h2 className="modal-title">오늘 소비 기록</h2>
          <div style={{ width: 32 }} />
        </div>

        <div className="modal-body">
          {/* 오늘 지출 없음 (무지출 인증) */}
          {items.length === 0 && !showZeroNote && (
            <button
              className="no-spend-quick-btn"
              disabled={submitting}
              onClick={() => setShowZeroNote(true)}
              style={{
                width: '100%',
                padding: '16px',
                background: 'linear-gradient(135deg, rgba(0, 245, 160, 0.12), rgba(0, 245, 160, 0.04))',
                border: '1.5px dashed var(--primary)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--primary)',
                fontSize: '14px',
                fontWeight: 800,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              🌿 오늘 돈 한 푼도 안 썼어요 (무지출 인증)
            </button>
          )}

          {/* 무지출 한마디 입력 */}
          {items.length === 0 && showZeroNote && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px', background: 'linear-gradient(135deg, rgba(0, 245, 160, 0.06), rgba(0, 245, 160, 0.02))', border: '1.5px dashed var(--primary)', borderRadius: 'var(--radius-md)' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 900, color: 'var(--primary)' }}>🌿 무지출 인증</p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.5 }}>오늘 어떻게 무지출을 달성했나요? 피드에 공유돼요.</p>
              <textarea
                value={zeroNote}
                onChange={e => setZeroNote(e.target.value)}
                placeholder="예) 도시락 싸서 점심 해결, 배달 참기 성공 🎉"
                maxLength={80}
                rows={3}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 13,
                  padding: '10px 12px',
                  resize: 'none',
                  outline: 'none',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                }}
              />
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text-mute)', textAlign: 'right' }}>{zeroNote.length}/80 · 5자 이상 입력</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setShowZeroNote(false); setZeroNote(''); }}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-mute)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  취소
                </button>
                <button
                  disabled={zeroNote.trim().length < 5 || submitting}
                  onClick={async () => {
                    await onSubmit([{ category: '기타', emoji: '🌿', amount: 0, comment: zeroNote.trim() }]);
                  }}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: zeroNote.trim().length < 5 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #00F5A0 0%, #00D9F5 100%)', color: zeroNote.trim().length < 5 ? 'var(--text-mute)' : '#090A10', fontSize: 12, fontWeight: 900, cursor: zeroNote.trim().length < 5 ? 'default' : 'pointer' }}
                >
                  {submitting ? '저장 중...' : '무지출 기록 완료'}
                </button>
              </div>
            </div>
          )}

          {/* 기록된 항목 목록 */}
          {items.length > 0 && (
            <div className="items-list">
              {items.map((item, i) => (
                <div key={i} className="item-row">
                  <span className="item-emoji">{item.emoji}</span>
                  <div className="item-info">
                    <span className="item-cat">{item.category}</span>
                    {item.comment && <span className="item-comment">{item.comment}</span>}
                  </div>
                  <span className="item-amount">{formatAmount(item.amount)}</span>
                  <button className="item-remove" onClick={() => removeItem(i)}>✕</button>
                </div>
              ))}
              <div className="items-total-row">
                <span>오늘 총 소비</span>
                <span className="items-total-amount">{formatAmount(total)}</span>
              </div>
            </div>
          )}

          {/* 항목 추가 폼 — zero-note 모드일 때 숨김 */}
          {!showZeroNote && (showForm ? (
            <div className="item-form">
              <p className="form-label">카테고리</p>
              <div className="cat-grid">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.label}
                    className={`cat-btn ${selCat.label === c.label ? 'cat-btn--active' : ''}`}
                    onClick={() => setSelCat(c)}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>

              <TextField
                variant="box"
                label="지출 금액"
                placeholder="0"
                value={amountStr}
                suffix="원"
                inputMode="numeric"
                onChange={(e: any) => handleAmountChange(e.target.value)}
              />

              <TextField
                variant="box"
                label="한 줄 메모 (선택)"
                placeholder="예: 회사 탕비실 커피로 해결"
                value={comment}
                maxLength={40}
                onChange={(e: any) => setComment(e.target.value)}
              />

              <Button size="medium" display="full" color="primary" variant="fill" onClick={addItem} disabled={!amountStr || (amountStr === '0' && !comment.trim())}>
                항목 추가
              </Button>
            </div>
          ) : (
            <button className="add-more-btn" onClick={() => setShowForm(true)}>
              + 항목 추가하기
            </button>
          ))}

          {/* 이미지 업로드 영역 */}
          <div className="image-upload-section">
            <p className="form-label">지출 인증샷 / 영수증 (선택)</p>
            {imageError && (
              <p style={{ fontSize: 12, color: '#FF4D4F', fontWeight: 600, margin: '0 0 8px 0' }}>
                ⚠️ {imageError}
              </p>
            )}
            {image ? (
              <div className="image-preview-container" style={{ position: 'relative', width: '100%', height: 160, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <img src={image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  onClick={() => { setImage(null); setImageError(null); }}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ✕
                </button>
              </div>
            ) : (
              <label
                className="image-upload-label"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px dashed rgba(255, 255, 255, 0.15)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  color: 'var(--text-sub)',
                  fontSize: '14px',
                  fontWeight: 700,
                  transition: 'all 0.2s ease',
                }}
              >
                <span>📸</span>
                <span>인증샷 / 영수증 첨부</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
              </label>
            )}
          </div>
        </div>

        {/* 제출 */}
        <div className="modal-footer">
          {items.length === 0 ? (
            <p className="submit-hint">항목을 1개 이상 추가해 주세요</p>
          ) : (
            <Button
              size="xlarge"
              display="full"
              color="primary"
              variant="fill"
              onClick={handleSubmit}
              loading={submitting}
            >
              {submitting ? '저장 중...' : `오늘 기록 완료 🌿`}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
