import React, { useState } from 'react';
import { Button } from '@toss/tds-mobile';
import type { SpendingItem } from '../lib/supabase';
import { formatAmount, getTodayStr } from '../lib/utils';
import CustomIcon, { renderTextWithEmoji } from '../components/CustomIcon';
import { setLastEmotion } from '../lib/storage';
import { haptic } from '../lib/haptics';

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

const TIP_CATEGORIES = [
  { label: '다이소·생활', emoji: '🏠' },
  { label: '패션·뷰티 꿀템', emoji: '👗' },
  { label: '전자기기 득템', emoji: '🎧' },
  { label: '가성비 맛집', emoji: '🍜' },
  { label: '앱테크·할인', emoji: '💰' },
  { label: '기타 꿀팁', emoji: '💡' },
];

const QUICK_AMOUNTS = [
  { label: '+1천', value: 1000 },
  { label: '+5천', value: 5000 },
  { label: '+1만', value: 10000 },
  { label: '+3만', value: 30000 },
  { label: '+5만', value: 50000 },
  { label: '+10만', value: 100000 },
];

interface Props {
  onSubmit: (items: SpendingItem[], image?: string) => Promise<void>;
  onClose: () => void;
  submitting: boolean;
  isAdditional?: boolean;
}

type RecordMode = 'spend' | 'dilemma' | 'save' | 'tip';

export default function RecordScreen({ onSubmit, onClose, submitting, isAdditional = false }: Props) {
  const [mode, setMode] = useState<RecordMode>('spend');
  const [selCat, setSelCat] = useState(SPEND_CATEGORIES[0]);
  const [selDefCat, setSelDefCat] = useState(DEFENSE_CATEGORIES[0]);
  const [selDilemmaCat, setSelDilemmaCat] = useState(DILEMMA_CATEGORIES[0]);
  const [selTipCat, setSelTipCat] = useState(TIP_CATEGORIES[0]);

  const [amountStr, setAmountStr] = useState('');
  const [dailyNote, setDailyNote] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  // 💭 소비 감정 태그 (지출 자백 전용)
  const [emotion, setEmotion] = useState<string | null>(null);
  const EMOTIONS = ['😌 꼭 필요했어', '😅 충동이었어', '😤 홧김/스트레스', '✨ 갓생소비', '💸 완벽한 지름'];

  const amount = parseInt(amountStr.replace(/,/g, ''), 10) || 0;
  const isFoodCategory = ['식비/식품', '배달/외식', '카페/간식'].includes(selCat.label);
  const isNoteValid = isAdditional || dailyNote.trim().length >= 4;

  function switchMode(m: RecordMode) {
    haptic('tickWeak');
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

  function handleQuickAddAmount(added: number) {
    haptic('tickWeak');
    const current = amount;
    const next = Math.min(current + added, 9999999);
    setAmountStr(next.toLocaleString('ko-KR'));
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
      setImageError('이미지를 불러오지 못했어요. 다른 파일을 골라주세요.');
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
      } else if (mode === 'tip') {
        // 💡 꿀템/꿀팁 공유
        const tipItem: SpendingItem = {
          category: '꿀팁',
          emoji: selTipCat.emoji,
          amount: amount,
          comment: `[${selTipCat.label}] ${dailyNote.trim()}`,
        };
        finalItems = [tipItem];
      } else {
        // 💸 솔직 지출 자백 (0원이면 무지출)
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="modal-header">
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>✕</button>
          <h2 className="modal-title">
            {isAdditional ? '추가 지출 털어놓기' : '오늘의 머니 스토리'}
          </h2>
          <div className="modal-header-spacer" />
        </div>

        <div className="modal-body" style={{ paddingTop: '4px' }}>
          {/* 0. 4대 모드 탭 세그먼트 */}
          {!isAdditional && (
            <div className="record-mode-seg">
              <button
                className={`record-mode-btn${mode === 'spend' ? ' record-mode-btn--active' : ''}`}
                onClick={() => switchMode('spend')}
                disabled={submitting}
              >
                💸 솔직 지출
              </button>
              <button
                className={`record-mode-btn${mode === 'dilemma' ? ' record-mode-btn--active' : ''}`}
                onClick={() => switchMode('dilemma')}
                disabled={submitting}
              >
                ⚖️ 살까말까
              </button>
              <button
                className={`record-mode-btn${mode === 'save' ? ' record-mode-btn--active' : ''}`}
                onClick={() => switchMode('save')}
                disabled={submitting}
              >
                🛡️ 지킨 돈 (+)
              </button>
              <button
                className={`record-mode-btn${mode === 'tip' ? ' record-mode-btn--active' : ''}`}
                onClick={() => switchMode('tip')}
                disabled={submitting}
              >
                💡 꿀템·꿀팁
              </button>
            </div>
          )}

          {/* 1. 한 줄 메모 (모드별 안내) */}
          {!isAdditional && (
            <div className="daily-note-section">
              <p className="form-label" style={{ fontWeight: 800, fontSize: '13.5px' }}>
                {mode === 'spend' && '오늘의 솔직한 지출 한 줄'}
                {mode === 'dilemma' && '살까 말까 고민 중인 내용'}
                {mode === 'save' && '어떻게 지갑을 지켰어요?'}
                {mode === 'tip' && '공유하고 싶은 꿀템 & 절약 꿀팁'}
              </p>
              <p className="daily-note-desc" style={{ fontSize: '12px', color: 'var(--text-sub)', marginBottom: '8px' }}>
                {mode === 'spend' && '0원이면 무지출 인증! 쓴 돈은 털어놓고 친구들의 위로와 공감을 받아요.'}
                {mode === 'dilemma' && '결제 직전 짠친들에게 물어보세요. 실시간 팩폭 투표를 올려드려요.'}
                {mode === 'save' && '배달·택시·카페 참은 썰! 굳은 돈만큼 목표 저금통이 차올라요.'}
                {mode === 'tip' && '다이소 득템, 할인 꿀팁, 가성비템을 자랑해 보세요.'}
              </p>
              <textarea
                className={`daily-note-textarea${isNoteValid ? ' daily-note-textarea--valid' : ''}`}
                value={dailyNote}
                onChange={e => setDailyNote(e.target.value)}
                placeholder={
                  mode === 'spend'
                    ? '예) 오늘 도시락 싸서 0원 방어! / 야근하고 홧김에 마라탕 18,000원 🥲'
                    : mode === 'dilemma'
                    ? '예) 에어팟 4세대 노캔 26만원 살까말까? 지금 쓰는 거 살짝 끊김 🎧'
                    : mode === 'save'
                    ? '예) 택시 타려다 따릉이 탐 🚲 / 배달앱 지우고 냉파 성공 🍳'
                    : '예) 다이소 3천원짜리 밀폐용기 퀄리티 미쳤음! 식비 아끼는데 필수템'
                }
                maxLength={140}
                rows={3}
                disabled={submitting}
                autoFocus
              />
              <p className="daily-note-char-count">{dailyNote.length}/140 · 4자 이상</p>
            </div>
          )}

          {/* 2. 금액 입력 & 퀵 칩 */}
          <div className="custom-input-wrapper" style={{ marginTop: !isAdditional ? '14px' : '0' }}>
            <p className="form-label" style={{ fontWeight: 800, fontSize: '13.5px' }}>
              {isAdditional
                ? '추가 지출 금액'
                : mode === 'spend'
                ? '쓴 금액 (0원이면 무지출)'
                : mode === 'dilemma'
                ? '예상 가격 (고민 중인 금액)'
                : mode === 'save'
                ? '지킨 금액 (아낀 돈)'
                : '아이템 가격 (선택)'}
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

            {/* 원터치 금액 가산 칩 */}
            <div className="amount-quick-chips">
              {QUICK_AMOUNTS.map(qa => (
                <button
                  key={qa.label}
                  type="button"
                  className="amount-quick-chip"
                  onClick={() => handleQuickAddAmount(qa.value)}
                >
                  {qa.label}
                </button>
              ))}
              {amount > 0 && (
                <button
                  type="button"
                  className="amount-quick-chip"
                  style={{ color: '#E53935' }}
                  onClick={() => { haptic('tickWeak'); setAmountStr(''); }}
                >
                  초기화
                </button>
              )}
            </div>
          </div>

          {/* 3. 카테고리 선택 */}
          <div style={{ marginTop: '16px' }}>
            <p className="form-label" style={{ marginBottom: '8px', fontWeight: 800, fontSize: '13.5px' }}>
              {mode === 'spend' ? '소비 카테고리' : mode === 'dilemma' ? '고민 분야' : mode === 'save' ? '방어 항목' : '꿀팁 분야'}
            </p>
            <div className="cat-grid">
              {(mode === 'spend' ? SPEND_CATEGORIES : mode === 'dilemma' ? DILEMMA_CATEGORIES : mode === 'save' ? DEFENSE_CATEGORIES : TIP_CATEGORIES).map((c) => {
                const isSelected =
                  mode === 'spend'
                    ? selCat.label === c.label
                    : mode === 'dilemma'
                    ? selDilemmaCat.label === c.label
                    : mode === 'save'
                    ? selDefCat.label === c.label
                    : selTipCat.label === c.label;

                return (
                  <button
                    key={c.label}
                    className={`cat-btn ${isSelected ? 'cat-btn--active' : ''}`}
                    onClick={() => {
                      haptic('tickWeak');
                      if (mode === 'spend') setSelCat(c);
                      else if (mode === 'dilemma') setSelDilemmaCat(c);
                      else if (mode === 'save') setSelDefCat(c);
                      else setSelTipCat(c);
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
            <div style={{ marginTop: '16px' }}>
              <p className="form-label" style={{ marginBottom: '8px', fontWeight: 800, fontSize: '13.5px' }}>
                이 소비, 지금 마음은? <span className="daily-note-desc" style={{ display: 'inline', marginLeft: 4 }}>(선택)</span>
              </p>
              <div className="emotion-select-container">
                {EMOTIONS.map(e => {
                  let btnClass = '';
                  if (e.includes('필요')) btnClass = 'emotion-btn--need';
                  else if (e.includes('충동')) btnClass = 'emotion-btn--impulse';
                  else if (e.includes('홧김')) btnClass = 'emotion-btn--stress';
                  else if (e.includes('갓생')) btnClass = 'emotion-btn--no-regret';
                  else if (e.includes('완벽')) btnClass = 'emotion-btn--no-regret';

                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => { haptic('tickWeak'); setEmotion(prev => prev === e ? null : e); }}
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
          <div className="image-upload-section" style={{ marginTop: '16px' }}>
            <p className="form-label" style={{ fontWeight: 800, fontSize: '13.5px' }}>사진 첨부 (선택)</p>
            {mode === 'spend' && isFoodCategory && !image && (
              <div className="food-photo-notice">
                <span className="food-photo-notice-icon"><CustomIcon emoji="🍔" /></span>
                <span className="food-photo-notice-text">
                  영수증이나 음식 사진을 올리면 짠친들의 공감이 2배로 늘어나요
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
                  {mode === 'dilemma' ? '상품 캡처 / 장바구니 사진 올리기' : '기록 인증샷 / 영수증 첨부'}
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
              ? '추가 지출 털어놓기'
              : mode === 'dilemma'
              ? (amount > 0 ? `⚖️ ${formatAmount(amount)} 살까말까 투표 올리기` : '⚖️ 살까말까 투표 올리기')
              : mode === 'save'
              ? (amount > 0 ? `🛡️ ${formatAmount(amount)} 지킨 돈 저금하기` : '지킨 금액을 입력해 주세요')
              : mode === 'tip'
              ? '💡 꿀템·꿀팁 피드에 공유하기'
              : amount > 0
              ? `💸 ${formatAmount(amount)} 지출 털어놓기`
              : '🌿 오늘 0원 무지출 인증하기'}
          </Button>
        </div>
      </div>
    </div>
  );
}

