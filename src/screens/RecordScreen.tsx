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
  isAdditional?: boolean;
}

export default function RecordScreen({ onSubmit, onClose, submitting, isAdditional = false }: Props) {
  const [items, setItems] = useState<SpendingItem[]>([]);
  const [selCat, setSelCat] = useState(CATEGORIES[0]);
  const [amountStr, setAmountStr] = useState('');
  const [comment, setComment] = useState('');
  const [dailyNote, setDailyNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showZeroNote, setShowZeroNote] = useState(false);
  const [zeroNote, setZeroNote] = useState('');

  const total = items.reduce((s, i) => s + i.amount, 0);

  function addItem() {
    const amount = parseInt(amountStr.replace(/,/g, '')) || 0;
    if (amount < 0) return;
    if (amount === 0 && !comment.trim()) return;
    setItems((prev) => [
      ...prev,
      { category: selCat.label, emoji: selCat.emoji, amount, comment: comment.trim() },
    ]);
    setAmountStr('');
    setComment('');
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
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
    if (!isAdditional && dailyNote.trim().length < 5) return;
    // 금액을 입력했지만 "항목 추가"를 누르지 않은 경우 자동으로 추가
    let finalItems = items;
    if (amountStr) {
      const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;
      if (amount > 0 || (amount === 0 && comment.trim())) {
        const autoItem = { category: selCat.label, emoji: selCat.emoji, amount, comment: comment.trim() };
        finalItems = [...items, autoItem];
        setItems(finalItems);
        setAmountStr('');
        setComment('');
      }
    }
    // 추가 기록은 한마디 없이, 첫 기록은 한마디 포함
    const withNote: SpendingItem[] = isAdditional
      ? finalItems
      : [{ category: '한마디', emoji: '💬', amount: 0, comment: dailyNote.trim() }, ...finalItems];
    await onSubmit(withNote, image || undefined);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-sheet">
        {/* 헤더 */}
        <div className="modal-header">
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>✕</button>
          <h2 className="modal-title">{isAdditional ? '소비 추가 기록' : '오늘 소비 기록'}</h2>
          <div style={{ width: 32 }} />
        </div>

        <div className="modal-body">
          {/* 오늘 지출 없음 (무지출 인증) — 추가 기록 모드에서는 숨김 */}
          {items.length === 0 && !showZeroNote && !isAdditional && (
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

          {/* 무지출 한마디 입력 — 추가 기록 모드에서는 숨김 */}
          {items.length === 0 && showZeroNote && !isAdditional && (
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
                  disabled={submitting}
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
                  style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: zeroNote.trim().length < 5 || submitting ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #00F5A0 0%, #00D9F5 100%)', color: zeroNote.trim().length < 5 || submitting ? 'var(--text-mute)' : '#090A10', fontSize: 12, fontWeight: 900, cursor: zeroNote.trim().length < 5 || submitting ? 'default' : 'pointer' }}
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
          {!showZeroNote && (
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
                {items.length > 0 ? '+ 항목 추가' : '항목 추가'}
              </Button>
            </div>
          )}

          {/* 오늘 한마디 (첫 기록이고 항목이 1개 이상일 때 표시) */}
          {items.length > 0 && !showZeroNote && !isAdditional && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p className="form-label" style={{ margin: 0 }}>오늘 한마디 <span style={{ color: 'var(--primary)', fontWeight: 900 }}>*</span></p>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--text-mute)', lineHeight: 1.4 }}>오늘 지출에 대한 한 줄 일기를 남겨요. 피드에 공유됩니다.</p>
              <textarea
                value={dailyNote}
                onChange={e => setDailyNote(e.target.value)}
                placeholder="예) 친구 생일이라 어쩔 수 없었어... 다음엔 아껴야지 😅"
                maxLength={80}
                rows={2}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)',
                  border: `1px solid ${dailyNote.trim().length >= 5 ? 'var(--primary)' : 'rgba(255,255,255,0.12)'}`,
                  borderRadius: 10,
                  color: '#fff',
                  fontSize: 13,
                  padding: '10px 12px',
                  resize: 'none',
                  outline: 'none',
                  lineHeight: 1.6,
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s',
                }}
              />
              <p style={{ margin: 0, fontSize: 10, color: 'var(--text-mute)', textAlign: 'right' }}>{dailyNote.length}/80 · 5자 이상 입력</p>
            </div>
          )}

          {/* 이미지 업로드 영역 — zero-note 모드에서는 숨김 */}
          {!showZeroNote && <div className="image-upload-section">
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
          </div>}
        </div>

        {/* 제출 */}
        <div className="modal-footer">
          {items.length === 0 && !showZeroNote ? (
            <p className="submit-hint">항목을 1개 이상 추가해 주세요</p>
          ) : items.length > 0 ? (
            <>
              {!isAdditional && dailyNote.trim().length < 5 && (
                <p className="submit-hint" style={{ marginBottom: 8 }}>오늘 한마디를 5자 이상 입력해 주세요</p>
              )}
              <Button
                size="xlarge"
                display="full"
                color="primary"
                variant="fill"
                onClick={handleSubmit}
                loading={submitting}
                disabled={!isAdditional && dailyNote.trim().length < 5}
              >
                {submitting ? '저장 중...' : isAdditional ? '추가 기록 완료 🌿' : '오늘 기록 완료 🌿'}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
