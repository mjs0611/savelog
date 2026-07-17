import React, { useState } from 'react';
import { Button } from '@toss/tds-mobile';
import type { SpendingItem } from '../lib/supabase';
import { formatAmount, getTodayStr } from '../lib/utils';
import CustomIcon, { renderTextWithEmoji } from '../components/CustomIcon';
import { setLastEmotion } from '../lib/storage';

const UNIFIED_CATEGORIES = [
  { label: '식비/식품', emoji: '🍚' },
  { label: '생활/배달', emoji: '🏠' },
  { label: '교통/차량', emoji: '🚇' },
  { label: '카페/간식', emoji: '☕' },
  { label: '쇼핑/패션', emoji: '🛍️' },
  { label: '취미/여가', emoji: '🎮' },
  { label: '혜택/이벤트', emoji: '🎁' },
  { label: '짠테크/적금', emoji: '💰' },
  { label: '기타', emoji: '📦' },
];

interface Props {
  onSubmit: (items: SpendingItem[], image?: string) => Promise<void>;
  onClose: () => void;
  submitting: boolean;
  isAdditional?: boolean;
}

export default function RecordScreen({ onSubmit, onClose, submitting, isAdditional = false }: Props) {
  const [selCat, setSelCat] = useState(UNIFIED_CATEGORIES[0]);
  const [amountStr, setAmountStr] = useState('');
  const [dailyNote, setDailyNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  // 💭 소비 감정 태그 (돈 멘탈 케어)
  const [emotion, setEmotion] = useState<string | null>(null);
  const EMOTIONS = ['😌 필요했어', '😅 충동이었어', '😤 홧김에', '🙂 후회없어'];

  const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;
  const isFoodCategory = ['식비/식품', '카페/간식'].includes(selCat.label);
  const isNoteValid = isAdditional || dailyNote.trim().length >= 5;

  function handleAmountChange(val: string) {
    const digits = val.replace(/\D/g, '');
    if (!digits) { setAmountStr(''); return; }
    const num = Math.min(parseInt(digits, 10), 9999999);
    setAmountStr(num.toLocaleString('ko-KR'));
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const input = e.target;
    if (file.size > 20 * 1024 * 1024) {
      setImageError('이미지가 너무 커요. 20MB 이하 파일을 선택해 주세요.');
      input.value = '';
      return;
    }
    setImageError(null);
    try {
      const compressed = await compressImage(file, 1600, 0.85);
      setImage(compressed);
    } catch {
      setImageError('이미지를 불러오지 못했습니다. 다른 파일을 시도해 주세요.');
      input.value = '';
    }
  }

  function compressImage(file: File, maxDim: number, quality: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
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
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image load failed'));
      };
      img.src = url;
    });
  }

  async function handleSubmit() {
    if (!isNoteValid) return;
    if (isAdditional && amount <= 0) return;

    try {
      let finalItems: SpendingItem[] = [];
      if (amount > 0) {
        if (emotion) setLastEmotion(getTodayStr(), emotion);
        const item: SpendingItem = { category: selCat.label, emoji: selCat.emoji, amount, ...(emotion ? { comment: `[${emotion}]` } : {}) };
        finalItems = isAdditional
          ? [item]
          : [{ category: '한마디', emoji: '💬', amount: 0, comment: dailyNote.trim() }, item];
      } else {
        // 금액 없음 = 무지출 기록
        finalItems = [{ category: '한마디', emoji: '💬', amount: 0, comment: dailyNote.trim() }];
      }
      await onSubmit(finalItems, image || undefined);
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-sheet">
        {/* 헤더 */}
        <div className="modal-header">
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>✕</button>
          <h2 className="modal-title">
            {isAdditional ? '추가 지출 기록' : '오늘의 기록'}
          </h2>
          <div className="modal-header-spacer" />
        </div>

        <div className="modal-body" style={{ paddingTop: '12px' }}>

          {/* 1. 한 줄 메모 (가장 먼저, 가볍게) */}
          {!isAdditional && (
            <div className="daily-note-section">
              <p className="form-label">오늘 어땠어요?</p>
              <p className="daily-note-desc">한 줄이면 충분해요. 금액은 아래에 적어도 돼요.</p>
              <textarea
                className={`daily-note-textarea${isNoteValid ? ' daily-note-textarea--valid' : ''}`}
                value={dailyNote}
                onChange={e => setDailyNote(e.target.value)}
                placeholder="예) 오늘 도시락 싸왔어요 🌿 / 오랜만에 좋아하는 카페 ☕"
                maxLength={120}
                rows={3}
                disabled={submitting}
                autoFocus
              />
              <p className="daily-note-char-count">{dailyNote.length}/120 · 5자 이상</p>
            </div>
          )}

          {/* 2. 금액 (선택) */}
          <div className="custom-input-wrapper" style={{ marginTop: !isAdditional ? '16px' : '0' }}>
            <p className="form-label">{isAdditional ? '추가 지출 금액' : '금액 (안 적어도 OK)'}</p>
            <div className="custom-input-box">
              <input
                className="custom-input-field"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amountStr}
                onChange={(e) => handleAmountChange(e.target.value)}
                disabled={submitting}
              />
              <span className="custom-input-suffix">원</span>
            </div>
          </div>

          {/* 3. 카테고리 (선택) */}
          <div style={{ marginTop: '16px' }}>
            <p className="form-label" style={{ marginBottom: '8px' }}>카테고리 {amount === 0 && <span className="daily-note-desc" style={{ display: 'inline', marginLeft: 4 }}>(선택)</span>}</p>
            <div className="cat-grid">
              {UNIFIED_CATEGORIES.map((c) => (
                <button
                  key={c.label}
                  className={`cat-btn ${selCat.label === c.label ? 'cat-btn--active' : ''}`}
                  onClick={() => setSelCat(c)}
                  disabled={submitting}
                >
                  <span className="cat-btn-emoji"><CustomIcon emoji={c.emoji} /></span>
                  <span className="cat-btn-label">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 4. 소비 감정 태그 (돈 멘탈 케어) */}
          {amount > 0 && (
            <div style={{ marginTop: '16px' }}>
              <p className="form-label" style={{ marginBottom: '8px' }}>이 소비, 지금 마음은? <span className="daily-note-desc" style={{ display: 'inline', marginLeft: 4 }}>(선택)</span></p>
              <div className="emotion-select-container">
                {EMOTIONS.map(e => {
                  let btnClass = '';
                  if (e.includes('필요')) btnClass = 'emotion-btn--need';
                  else if (e.includes('충동')) btnClass = 'emotion-btn--impulse';
                  else if (e.includes('홧김')) btnClass = 'emotion-btn--stress';
                  else if (e.includes('후회')) btnClass = 'emotion-btn--no-regret';

                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmotion(prev => prev === e ? null : e)}
                      className={`emotion-select-btn ${btnClass} ${emotion === e ? 'active' : ''}`}
                    >
                      {renderTextWithEmoji(e)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. 인증 사진 첨부 (선택) */}
          <div className="image-upload-section">
            <p className="form-label">사진 첨부 (선택)</p>
            {isFoodCategory && !image && (
              <div className="food-photo-notice">
                <span className="food-photo-notice-icon"><CustomIcon emoji="🍔" /></span>
                <span className="food-photo-notice-text">
                  영수증이나 빈 그릇 사진을 올리면 짠친들이 더 잘 믿어줘요
                </span>
              </div>
            )}
            {imageError && (
              <p className="image-error-msg"><CustomIcon emoji="⚠️" /> {imageError}</p>
            )}
            {image ? (
              <div className="image-preview-container">
                <img src={image} alt="Preview" />
                <button
                  className="image-remove-btn"
                  onClick={() => { setImage(null); setImageError(null); }}
                  disabled={submitting}
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className={`image-upload-label${isFoodCategory ? ' image-upload-label--highlighted' : ''}`}>
                <CustomIcon emoji="📸" />
                <span>기록 인증샷 / 영수증 첨부</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                  disabled={submitting}
                />
              </label>
            )}
          </div>
        </div>

        {/* 6. 제출 — 화면당 primary CTA 하나 */}
        <div className="modal-footer" style={{ flexDirection: 'column', gap: '8px' }}>
          {!isNoteValid && !isAdditional && (
            <p className="submit-hint submit-hint--mb">기록 내용을 5자 이상 입력해 주세요</p>
          )}
          <Button
            size="xlarge"
            display="full"
            color="primary"
            variant="fill"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!isNoteValid || submitting || (isAdditional && amount <= 0)}
          >
            {isAdditional
              ? '추가 지출 기록하기'
              : amount > 0
                ? `기록하기 (${formatAmount(amount)})`
                : '무지출로 기록하기 🌿'}
          </Button>
        </div>
      </div>
    </div>
  );
}
