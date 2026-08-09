import React, { useState } from 'react';
import { Button } from '@toss/tds-mobile';
import type { SpendingItem } from '../lib/supabase';
import { formatAmount, getTodayStr } from '../lib/utils';
import CustomIcon, { renderTextWithEmoji } from '../components/CustomIcon';
import { setLastEmotion } from '../lib/storage';

const SPEND_CATEGORIES = [
  { label: '식비/식품', emoji: '🍚' },
  { label: '배달/외식', emoji: '🛵' },
  { label: '카페/간식', emoji: '☕' },
  { label: '교통/차량', emoji: '🚇' },
  { label: '쇼핑/패션', emoji: '🛍️' },
  { label: '취미/여가', emoji: '🎮' },
  { label: '생활/잡화', emoji: '🏠' },
  { label: '기타', emoji: '📦' },
];

const DEFENSE_CATEGORIES = [
  { label: '배달·외식 방어', emoji: '🍳' },
  { label: '카페·음료 방어', emoji: '☕' },
  { label: '택시·교통 방어', emoji: '🚇' },
  { label: '충동쇼핑 방어', emoji: '🛡️' },
  { label: '구독·고정비 절감', emoji: '✂️' },
  { label: '기타 방어', emoji: '🌿' },
];

const DILEMMA_CATEGORIES = [
  { label: '전자·IT기기', emoji: '📱' },
  { label: '패션·뷰티', emoji: '👗' },
  { label: '취미·게임·굿즈', emoji: '🎮' },
  { label: '가구·인테리어', emoji: '🛋️' },
  { label: '외식·배달', emoji: '🍕' },
  { label: '기타 고민', emoji: '⚖️' },
];

interface Props {
  onSubmit: (items: SpendingItem[], image?: string) => Promise<void>;
  onClose: () => void;
  submitting: boolean;
  isAdditional?: boolean;
}

type RecordMode = 'spend' | 'save' | 'dilemma';

export default function RecordScreen({ onSubmit, onClose, submitting, isAdditional = false }: Props) {
  const [mode, setMode] = useState<RecordMode>('spend');
  const [selCat, setSelCat] = useState(SPEND_CATEGORIES[0]);
  const [selDefCat, setSelDefCat] = useState(DEFENSE_CATEGORIES[0]);
  const [selDilemmaCat, setSelDilemmaCat] = useState(DILEMMA_CATEGORIES[0]);

  const [amountStr, setAmountStr] = useState('');
  const [dailyNote, setDailyNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // 💭 소비 감정 태그 (지출 자백 전용)
  const [emotion, setEmotion] = useState<string | null>(null);
  const EMOTIONS = ['😌 꼭 필요했어', '😅 충동이었어', '😤 홧김/스트레스', '🙂 후회없어'];

  const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;
  const isFoodCategory = ['식비/식품', '배달/외식', '카페/간식'].includes(selCat.label);
  const isNoteValid = isAdditional || dailyNote.trim().length >= 4;

  function switchMode(m: RecordMode) {
    setMode(m);
    setAmountStr('');
    setEmotion(null);
    setDailyNote('');
    setImage(null);
    setImageError(null);
  }

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
    if (mode === 'save' && amount <= 0) return;

    try {
      let finalItems: SpendingItem[] = [];
      const noteItem: SpendingItem = { category: '한마디', emoji: '💬', amount: 0, comment: dailyNote.trim() };

      if (mode === 'save') {
        // 🛡️ 지킨 돈 (방어 머니): saved_amount로 피드에 플러스(+) 표시 & 저금통 충전
        const defenseItem: SpendingItem = {
          category: '절약 방어',
          emoji: selDefCat.emoji,
          amount: 0,
          saved_amount: amount,
          comment: `[${selDefCat.label}] ${dailyNote.trim()}`,
        };
        finalItems = isAdditional ? [defenseItem] : [noteItem, defenseItem];
      } else if (mode === 'dilemma') {
        // ⚖️ 살까 말까? 디인플루언싱 투표 생성
        const dilemmaItem: SpendingItem = {
          category: '소비 고민',
          emoji: selDilemmaCat.emoji,
          amount: amount,
          comment: `[${selDilemmaCat.label}] ${dailyNote.trim()}`,
        };
        finalItems = [dilemmaItem];
      } else {
        // 💸 지출 자백 (0원이면 무지출)
        if (amount > 0) {
          if (emotion) setLastEmotion(getTodayStr(), emotion);
          const item: SpendingItem = {
            category: selCat.label,
            emoji: selCat.emoji,
            amount,
            ...(emotion ? { comment: `[${emotion}]` } : {}),
          };
          finalItems = isAdditional ? [item] : [noteItem, item];
        } else {
          finalItems = [noteItem];
        }
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
            {isAdditional ? '추가 지출 자백' : '오늘의 인증 & 자백'}
          </h2>
          <div className="modal-header-spacer" />
        </div>

        <div className="modal-body" style={{ paddingTop: '8px' }}>
          {/* 0. 3대 모드 탭 세그먼트 */}
          {!isAdditional && (
            <div className="record-mode-seg" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px', marginBottom: '16px' }}>
              <button
                className={`record-mode-btn${mode === 'spend' ? ' record-mode-btn--active' : ''}`}
                onClick={() => switchMode('spend')}
                disabled={submitting}
              >
                💸 지출 자백
              </button>
              <button
                className={`record-mode-btn${mode === 'save' ? ' record-mode-btn--active' : ''}`}
                onClick={() => switchMode('save')}
                disabled={submitting}
              >
                🛡️ 지킨 돈 (+)
              </button>
              <button
                className={`record-mode-btn${mode === 'dilemma' ? ' record-mode-btn--active' : ''}`}
                onClick={() => switchMode('dilemma')}
                disabled={submitting}
              >
                ⚖️ 살까 말까?
              </button>
            </div>
          )}

          {/* 1. 한 줄 메모 (모드별 안내) */}
          {!isAdditional && (
            <div className="daily-note-section">
              <p className="form-label">
                {mode === 'spend' && '오늘의 솔직한 자백 한 줄'}
                {mode === 'save' && '어떻게 지갑을 지켰어요?'}
                {mode === 'dilemma' && '살까 말까 고민 중인 내용'}
              </p>
              <p className="daily-note-desc">
                {mode === 'spend' && '0원이면 무지출! 쓴 돈은 털어놓고 위로받아요.'}
                {mode === 'save' && '배달·택시·카페 참은 썰! 굳은 돈이 저금통에 쌓여요.'}
                {mode === 'dilemma' && '결제 직전 짠친들에게 물어보세요. 팩폭 투표를 올려드려요.'}
              </p>
              <textarea
                className={`daily-note-textarea${isNoteValid ? ' daily-note-textarea--valid' : ''}`}
                value={dailyNote}
                onChange={e => setDailyNote(e.target.value)}
                placeholder={
                  mode === 'spend'
                    ? '예) 오늘 도시락 싸서 0원 방어! / 야근하고 홧김에 마라탕 18,000원 🥲'
                    : mode === 'save'
                    ? '예) 택시 타려다 지하철 탐 🚇 / 배달앱 지우고 냉파 성공 🍳'
                    : '예) 에어팟 4세대 노캔 26만원 살까말까? 지금 쓰는 거 살짝 끊김 🎧'
                }
                maxLength={120}
                rows={3}
                disabled={submitting}
                autoFocus
              />
              <p className="daily-note-char-count">{dailyNote.length}/120 · 4자 이상</p>
            </div>
          )}

          {/* 2. 금액 입력 */}
          <div className="custom-input-wrapper" style={{ marginTop: !isAdditional ? '14px' : '0' }}>
            <p className="form-label">
              {isAdditional
                ? '추가 지출 금액'
                : mode === 'spend'
                ? '쓴 금액 (0원이면 무지출)'
                : mode === 'save'
                ? '지킨 금액 (아낀 돈)'
                : '예상 가격 (고민 중인 금액)'}
            </p>
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

          {/* 3. 카테고리 선택 */}
          <div style={{ marginTop: '14px' }}>
            <p className="form-label" style={{ marginBottom: '8px' }}>
              {mode === 'spend' ? '소비 카테고리' : mode === 'save' ? '방어 항목' : '고민 분야'}
            </p>
            <div className="cat-grid">
              {(mode === 'spend' ? SPEND_CATEGORIES : mode === 'save' ? DEFENSE_CATEGORIES : DILEMMA_CATEGORIES).map((c) => {
                const isSelected =
                  mode === 'spend'
                    ? selCat.label === c.label
                    : mode === 'save'
                    ? selDefCat.label === c.label
                    : selDilemmaCat.label === c.label;

                return (
                  <button
                    key={c.label}
                    className={`cat-btn ${isSelected ? 'cat-btn--active' : ''}`}
                    onClick={() => {
                      if (mode === 'spend') setSelCat(c);
                      else if (mode === 'save') setSelDefCat(c);
                      else setSelDilemmaCat(c);
                    }}
                    disabled={submitting}
                  >
                    <span className="cat-btn-emoji"><CustomIcon emoji={c.emoji} /></span>
                    <span className="cat-btn-label">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. 감정 태그 (지출 자백에만) */}
          {mode === 'spend' && amount > 0 && (
            <div style={{ marginTop: '14px' }}>
              <p className="form-label" style={{ marginBottom: '8px' }}>
                이 소비, 지금 마음은? <span className="daily-note-desc" style={{ display: 'inline', marginLeft: 4 }}>(선택)</span>
              </p>
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

          {/* 5. 사진 첨부 */}
          <div className="image-upload-section" style={{ marginTop: '14px' }}>
            <p className="form-label">사진 첨부 (선택)</p>
            {mode === 'spend' && isFoodCategory && !image && (
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
              <label className="image-upload-label">
                <CustomIcon emoji="📸" />
                <span>
                  {mode === 'dilemma' ? '상품 캡처 / 장바구니 사진' : '기록 인증샷 / 영수증 첨부'}
                </span>
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

        {/* 6. 제출 버튼 */}
        <div className="modal-footer" style={{ flexDirection: 'column', gap: '8px' }}>
          {!isNoteValid && !isAdditional && (
            <p className="submit-hint submit-hint--mb">내용을 4자 이상 입력해 주세요</p>
          )}
          <Button
            size="xlarge"
            display="full"
            color="primary"
            variant="fill"
            onClick={handleSubmit}
            loading={submitting}
            disabled={!isNoteValid || submitting || (isAdditional && amount <= 0) || (mode === 'save' && amount <= 0)}
          >
            {isAdditional
              ? '추가 지출 자백하기'
              : mode === 'save'
              ? (amount > 0 ? `🛡️ ${formatAmount(amount)} 지킨 돈 저금하기` : '지킨 금액을 입력해 주세요')
              : mode === 'dilemma'
              ? (amount > 0 ? `⚖️ ${formatAmount(amount)} 살까말까 투표 올리기` : '⚖️ 살까말까 투표 올리기')
              : amount > 0
              ? `💸 ${formatAmount(amount)} 지출 자백하기`
              : '🌿 오늘 무지출 인증하기'}
          </Button>
        </div>
      </div>
    </div>
  );
}

