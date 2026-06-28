import React, { useState, useEffect } from 'react';
import { Button } from '@toss/tds-mobile';
import type { SpendingItem } from '../lib/supabase';
import { formatAmount } from '../lib/utils';
import CustomIcon from '../components/CustomIcon';
import { getWeeklyBudget } from '../lib/storage';

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
  onSubmit: (items: SpendingItem[], image?: string, isBalanceGame?: boolean) => Promise<void>;
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
  const [activeSubmitType, setActiveSubmitType] = useState<'spend' | 'save' | 'dilemma' | 'zero' | 'tip' | null>(null);
  const [dopamineDelayMode, setDopamineDelayMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(600);

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

  async function handleSubmit(type: 'spend' | 'save' | 'dilemma' | 'zero' | 'tip') {
    if (!isNoteValid) return;
    if (type !== 'zero' && type !== 'tip' && amount <= 0) return;

    setActiveSubmitType(type);
    try {
      let finalItems: SpendingItem[] = [];
      let isBalanceGame = false;

      if (type === 'spend') {
        const item = { category: selCat.label, emoji: selCat.emoji, amount };
        finalItems = isAdditional
          ? [item]
          : [{ category: '한마디', emoji: '💬', amount: 0, comment: dailyNote.trim() }, item];
      } else if (type === 'save') {
        finalItems = [
          { category: '절약 방어', emoji: '🛡️', amount: 0, saved_amount: amount, comment: dailyNote.trim() }
        ];
      } else if (type === 'dilemma') {
        finalItems = [
          { category: '소비 고민', emoji: '⚖️', amount, comment: dailyNote.trim() }
        ];
        isBalanceGame = true;
      } else if (type === 'zero') {
        finalItems = [
          { category: '한마디', emoji: '💬', amount: 0, comment: dailyNote.trim() }
        ];
      } else if (type === 'tip') {
        finalItems = [
          { category: '꿀팁', emoji: '💡', amount: 0, comment: dailyNote.trim() }
        ];
      }

      await onSubmit(finalItems, image || undefined, isBalanceGame);
    } catch (e) {
      console.error(e);
    } finally {
      setActiveSubmitType(null);
    }
  }

  useEffect(() => {
    if (!dopamineDelayMode) return;
    if (timeLeft <= 0) {
      handleSubmit('save');
      return;
    }
    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [dopamineDelayMode, timeLeft]);

  if (dopamineDelayMode) {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    return (
      <div className="modal-overlay">
        <div className="modal-sheet" style={{ textAlign: 'center', padding: '24px' }}>
          <div className="modal-header" style={{ justifyContent: 'center' }}>
            <h2 className="modal-title">👾 지름신 쫓아내는 중...</h2>
          </div>
          
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '20px' }}>
            <div className="dopamine-timer-circle" style={{
              width: '160px',
              height: '160px',
              borderRadius: '50%',
              border: '8px solid var(--primary-light)',
              borderTopColor: 'var(--primary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-md)',
              background: 'rgba(255,255,255,0.7)'
            }}>
              <span style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-main)' }}>{timeStr}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-sub)', marginTop: '4px' }}>남은 시간</span>
            </div>
            
            <div style={{ padding: '0 20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                충동구매 욕구는 평균 10분 뒤에 사라집니다
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.5, margin: 0 }}>
                현재 지각적 도파민 딜레이가 가동되었습니다. 10분을 버텨내면 <strong>절약 방어 성공 뱃지</strong>와 함께 <strong>젤리 리워드</strong>를 받게 됩니다!
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '20px' }}>
              <button 
                className="fast-forward-btn" 
                onClick={() => handleSubmit('save')}
                style={{
                  flex: 1,
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                💪 참아냈어요! (즉시 성공)
              </button>
              
              <button 
                onClick={() => {
                  setDopamineDelayMode(false);
                  setTimeLeft(600);
                }}
                style={{
                  flex: 1,
                  background: '#F2F4F7',
                  color: 'var(--text-sub)',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '14px',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                💸 그냥 살래요 (포기)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
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
              <p className="daily-note-desc">한 줄이면 충분해요. 카테고리나 금액은 아래에서 선택해도 좋아요.</p>
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

          {/* 4. 인증 사진 첨부 (선택) */}
          <div className="image-upload-section">
            <p className="form-label">사진 첨부 (선택)</p>
            {isFoodCategory && !image && (
              <div className="food-photo-notice">
                <span className="food-photo-notice-icon"><CustomIcon emoji="🍔" /></span>
                <span className="food-photo-notice-text">
                  맛있는 음식 인증샷이나, 영수증, 혹은 빈 그릇/물잔 사진을 올리면 짠친구들이 더 좋아해요!
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
          {amount > 0 && (
            <div className="utility-deflector-card glass-card" style={{
              marginTop: '16px',
              padding: '16px',
              borderRadius: '16px',
              border: '1px solid rgba(255, 74, 107, 0.15)',
              background: 'rgba(255, 74, 107, 0.03)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>💡</span>
                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>한계 효용 디플렉터 (소비 시간 변환)</span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-sub)', lineHeight: 1.5 }}>
                이 소비 금액은 최저임금 기준(시급 9,860원)으로 <strong>{(amount / 9860).toFixed(1)}시간</strong> 동안 일한 노동력과 같으며, 하루 평균 예산의 <strong>{(amount / (getWeeklyBudget() / 7)).toFixed(1)}일 치</strong>에 해당합니다.
              </div>
              <button
                onClick={() => setDopamineDelayMode(true)}
                style={{
                  background: 'var(--primary-light)',
                  color: 'var(--primary)',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'background 0.2s'
                }}
              >
                ⏱️ 10분 참기 타이머 가동 (도파민 디플렉터)
              </button>
            </div>
          )}
          </div>
        </div>

        {/* 5. 동적 제출 버튼 그룹 */}
        <div className="modal-footer" style={{ flexDirection: 'column', gap: '8px' }}>
          {!isNoteValid && !isAdditional && (
            <p className="submit-hint submit-hint--mb">기록 내용을 5자 이상 입력해 주세요</p>
          )}

          {isAdditional ? (
            <Button
              size="xlarge"
              display="full"
              color="primary"
              variant="fill"
              onClick={() => handleSubmit('spend')}
              loading={submitting}
              disabled={amount <= 0}
              style={{ background: 'linear-gradient(135deg, #FF4A6B 0%, #E22D50 100%)', border: 'none' }}
            >
              <CustomIcon emoji="💸" /> 추가 소비 기록하기
            </Button>
          ) : amount > 0 ? (
            <div className="submit-btn-group-vertical" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Button
                size="xlarge"
                display="full"
                color="primary"
                variant="fill"
                onClick={() => handleSubmit('spend')}
                loading={submitting && activeSubmitType === 'spend'}
                disabled={!isNoteValid || submitting}
                style={{ background: 'linear-gradient(135deg, #FF4A6B 0%, #E22D50 100%)', border: 'none' }}
              >
                <CustomIcon emoji="💸" /> 나의 가치 소비 기록 ({formatAmount(amount)})
              </Button>

              <Button
                size="xlarge"
                display="full"
                color="primary"
                variant="fill"
                onClick={() => handleSubmit('dilemma')}
                loading={submitting && activeSubmitType === 'dilemma'}
                disabled={!isNoteValid || submitting}
                style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)', border: 'none' }}
              >
                <CustomIcon emoji="⚖️" /> 플러스 소비 밸런스 게임 올리기
              </Button>
            </div>
          ) : (
            <div className="submit-btn-group-vertical" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <Button
                size="xlarge"
                display="full"
                color="primary"
                variant="fill"
                onClick={() => handleSubmit('zero')}
                loading={submitting && activeSubmitType === 'zero'}
                disabled={!isNoteValid || submitting}
                style={{ background: 'linear-gradient(135deg, #0EA5E9 0%, #0284C7 100%)', border: 'none' }}
              >
                <CustomIcon emoji="🌿" /> 오늘 지갑 충전 힐링 데이 인증
              </Button>

              <Button
                size="xlarge"
                display="full"
                color="primary"
                variant="fill"
                onClick={() => handleSubmit('tip')}
                loading={submitting && activeSubmitType === 'tip'}
                disabled={!isNoteValid || submitting}
                style={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', border: 'none' }}
              >
                <CustomIcon emoji="💡" /> 나만의 힙한 플러스 꿀팁 공유
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
