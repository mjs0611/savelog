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

const TIP_CATEGORIES = [
  { label: '식비 아끼기', emoji: '🍚' },
  { label: '생활비 아끼기', emoji: '🏠' },
  { label: '무료 혜택', emoji: '🎁' },
  { label: '중고 거래', emoji: '🤝' },
  { label: '짠테크/적금', emoji: '💰' },
  { label: '기타 꿀팁', emoji: '💡' },
];

const DILEMMA_CATEGORIES = [
  { label: '쇼핑 고민', emoji: '🛍️' },
  { label: '전자기기', emoji: '💻' },
  { label: '패션/뷰티', emoji: '🧥' },
  { label: '음식/맛집', emoji: '🍕' },
  { label: '문화/여가', emoji: '🎮' },
  { label: '기타 고민', emoji: '⚖️' },
];

interface Props {
  onSubmit: (items: SpendingItem[], image?: string, isBalanceGame?: boolean) => Promise<void>;
  onClose: () => void;
  submitting: boolean;
  isAdditional?: boolean;
}

export default function RecordScreen({ onSubmit, onClose, submitting, isAdditional = false }: Props) {
  const [creatorMode, setCreatorMode] = useState<'record' | 'tip' | 'dilemma'>('record');
  
  // 소비/무지출 모드 상태
  const [items, setItems] = useState<SpendingItem[]>([]);
  const [selCat, setSelCat] = useState(CATEGORIES[0]);
  const [amountStr, setAmountStr] = useState('');
  const [comment, setComment] = useState('');
  const [dailyNote, setDailyNote] = useState('');
  const [showZeroNote, setShowZeroNote] = useState(false);
  const [zeroNote, setZeroNote] = useState('');
  const [isBalanceGame, setIsBalanceGame] = useState(false);

  // 절약 꿀팁 모드 상태
  const [tipCategory, setTipCategory] = useState(TIP_CATEGORIES[0]);
  const [tipText, setTipText] = useState('');

  // 소비 고민 모드 상태
  const [dilemmaCategory, setDilemmaCategory] = useState(DILEMMA_CATEGORIES[0]);
  const [dilemmaText, setDilemmaText] = useState('');
  const [dilemmaCostStr, setDilemmaCostStr] = useState('');

  // 공통 이미지 상태
  const [image, setImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

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
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    if (next.length === 0 || next.reduce((s, i) => s + i.amount, 0) === 0) {
      setIsBalanceGame(false);
    }
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
    if (creatorMode === 'tip') {
      if (tipText.trim().length < 5) return;
      const withNote: SpendingItem[] = [
        { category: '꿀팁', emoji: '💡', amount: 0, comment: `[${tipCategory.emoji} ${tipCategory.label}] ${tipText.trim()}` }
      ];
      await onSubmit(withNote, image || undefined, false);
      return;
    }

    if (creatorMode === 'dilemma') {
      if (dilemmaText.trim().length < 5 || !dilemmaCostStr) return;
      const cost = parseInt(dilemmaCostStr.replace(/,/g, ''), 10) || 0;
      const withNote: SpendingItem[] = [
        { category: '소비 고민', emoji: '⚖️', amount: cost, comment: `[${dilemmaCategory.emoji} ${dilemmaCategory.label}] ${dilemmaText.trim()}` }
      ];
      await onSubmit(withNote, image || undefined, true); // is_balance_game = true
      return;
    }

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
    await onSubmit(withNote, image || undefined, isBalanceGame);
  }

  return (
    <div className="modal-overlay">
      <div className="modal-sheet">
        {/* 헤더 */}
        <div className="modal-header">
          <button className="modal-close-btn" onClick={onClose} disabled={submitting}>✕</button>
          <h2 className="modal-title">
            {isAdditional ? '소비 추가 기록' : creatorMode === 'tip' ? '절약 꿀팁 공유' : creatorMode === 'dilemma' ? '소비 고민 투표 올리기' : '오늘 소비 기록'}
          </h2>
          <div className="modal-header-spacer" />
        </div>

        <div className="modal-body">
          {/* 세그먼트 탭 선택자 (추가 기록이 아닐 때만 노출) */}
          {!isAdditional && (
            <div className="record-tabs-header">
              <button
                className={`record-tab-btn ${creatorMode === 'record' ? 'active' : ''}`}
                onClick={() => setCreatorMode('record')}
                disabled={submitting}
              >
                소비/무지출
              </button>
              <button
                className={`record-tab-btn ${creatorMode === 'tip' ? 'active' : ''}`}
                onClick={() => setCreatorMode('tip')}
                disabled={submitting}
              >
                절약 꿀팁
              </button>
              <button
                className={`record-tab-btn ${creatorMode === 'dilemma' ? 'active' : ''}`}
                onClick={() => setCreatorMode('dilemma')}
                disabled={submitting}
              >
                소비 고민
              </button>
            </div>
          )}

          {/* 1. 소비/무지출 모드 폼 */}
          {creatorMode === 'record' && (
            <>
              {/* 오늘 지출 없음 (무지출 인증) — 추가 기록 모드에서는 숨김 */}
              {items.length === 0 && !showZeroNote && !isAdditional && (
                <button
                  className="no-spend-quick-btn"
                  disabled={submitting}
                  onClick={() => setShowZeroNote(true)}
                >
                  🌿 오늘 돈 한 푼도 안 썼어요 (무지출 인증)
                </button>
              )}

              {/* 무지출 한마디 입력 — 추가 기록 모드에서는 숨김 */}
              {items.length === 0 && showZeroNote && !isAdditional && (
                <div className="zero-note-section">
                  <p className="zero-note-title">🌿 무지출 인증</p>
                  <p className="zero-note-desc">오늘 어떻게 무지출을 달성했나요? 피드에 공유돼요.</p>
                  <textarea
                    className="zero-note-textarea"
                    value={zeroNote}
                    onChange={e => setZeroNote(e.target.value)}
                    placeholder="예) 도시락 싸서 점심 해결, 배달 참기 성공 🎉"
                    maxLength={80}
                    rows={3}
                  />
                  <p className="zero-note-char-count">{zeroNote.length}/80 · 5자 이상 입력</p>
                  <div className="zero-note-actions">
                    <button
                      className="zero-note-cancel-btn"
                      disabled={submitting}
                      onClick={() => { setShowZeroNote(false); setZeroNote(''); }}
                    >
                      취소
                    </button>
                    <button
                      className="zero-note-submit-btn"
                      disabled={zeroNote.trim().length < 5 || submitting}
                      onClick={async () => {
                        await onSubmit([{ category: '한마디', emoji: '💬', amount: 0, comment: zeroNote.trim() }]);
                      }}
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
                    onKeyDown={(e: any) => { if (e.key === 'Enter') addItem(); }}
                  />

                  <TextField
                    variant="box"
                    label="한 줄 메모 (선택)"
                    placeholder="예: 회사 탕비실 커피로 해결"
                    value={comment}
                    maxLength={40}
                    onChange={(e: any) => setComment(e.target.value)}
                    onKeyDown={(e: any) => { if (e.key === 'Enter') addItem(); }}
                  />

                  <Button size="medium" display="full" color="primary" variant="fill" onClick={addItem} disabled={!amountStr || (amountStr === '0' && !comment.trim())}>
                    {items.length > 0 ? '+ 항목 추가' : '항목 추가'}
                  </Button>
                </div>
              )}

              {/* 오늘 한마디 (첫 기록이고 항목이 1개 이상일 때 표시) */}
              {items.length > 0 && !showZeroNote && !isAdditional && (
                <div className="daily-note-section">
                  <p className="form-label">오늘 한마디 <span className="daily-note-required">*</span></p>
                  <p className="daily-note-desc">오늘 지출에 대한 한 줄 일기를 남겨요. 피드에 공유됩니다.</p>
                  <textarea
                    className={`daily-note-textarea${dailyNote.trim().length >= 5 ? ' daily-note-textarea--valid' : ''}`}
                    value={dailyNote}
                    onChange={e => setDailyNote(e.target.value)}
                    placeholder="예) 친구 생일이라 어쩔 수 없었어... 다음엔 아껴야지 😅"
                    maxLength={80}
                    rows={2}
                  />
                  <p className="daily-note-char-count">{dailyNote.length}/80 · 5자 이상 입력</p>
                </div>
              )}

              {/* 밸런스 게임 opt-in — 지출이 있고 첫 기록일 때만 */}
              {items.length > 0 && total > 0 && !isAdditional && !showZeroNote && (
                <button
                  type="button"
                  className={`balance-game-opt-btn${isBalanceGame ? ' balance-game-opt-btn--on' : ''}`}
                  onClick={() => setIsBalanceGame(v => !v)}
                >
                  <span className="balance-game-opt-icon">⚖️</span>
                  <div>
                    <p className="balance-game-opt-title">
                      {isBalanceGame ? '밸런스 게임 등록됨 ✓' : '내 지출, 합리적일까? 다른 사람들한테 물어보기'}
                    </p>
                    <p className="balance-game-opt-desc">
                      {isBalanceGame ? '피드 밸런스 게임에 올라가요 · 다시 누르면 취소' : '피드에서 다른 사람들이 과소비 / 합리적 판정을 해줘요'}
                    </p>
                  </div>
                </button>
              )}
            </>
          )}

          {/* 2. 절약 꿀팁 모드 폼 */}
          {creatorMode === 'tip' && (
            <div className="record-mode-form">
              <p className="form-label">꿀팁 카테고리</p>
              <div className="cat-grid">
                {TIP_CATEGORIES.map((c) => (
                  <button
                    key={c.label}
                    className={`cat-btn ${tipCategory.label === c.label ? 'cat-btn--active' : ''}`}
                    onClick={() => setTipCategory(c)}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>

              <div className="daily-note-section daily-note-section--mt">
                <p className="form-label">절약 꿀팁 공유 <span className="daily-note-required">*</span></p>
                <p className="daily-note-desc">나만 아는 생활비 절약법, 할인 혜택 등을 짠친들과 공유해 보세요!</p>
                <textarea
                  className={`daily-note-textarea${tipText.trim().length >= 5 ? ' daily-note-textarea--valid' : ''}`}
                  value={tipText}
                  onChange={e => setTipText(e.target.value)}
                  placeholder="예) 카페인 수혈 필요할 때 편의점 구독 쿠폰 쓰면 아메리카노 반값이에요 ☕"
                  maxLength={120}
                  rows={3}
                />
                <p className="daily-note-char-count">{tipText.length}/120 · 5자 이상 입력</p>
              </div>
            </div>
          )}

          {/* 3. 소비 고민 모드 폼 */}
          {creatorMode === 'dilemma' && (
            <div className="record-mode-form">
              <p className="form-label">카테고리</p>
              <div className="cat-grid">
                {DILEMMA_CATEGORIES.map((c) => (
                  <button
                    key={c.label}
                    className={`cat-btn ${dilemmaCategory.label === c.label ? 'cat-btn--active' : ''}`}
                    onClick={() => setDilemmaCategory(c)}
                  >
                    <span>{c.emoji}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>

              <TextField
                variant="box"
                label="예상 소비 금액"
                placeholder="0"
                value={dilemmaCostStr}
                suffix="원"
                inputMode="numeric"
                onChange={(e: any) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  if (!digits) { setDilemmaCostStr(''); return; }
                  const num = Math.min(parseInt(digits, 10), 9999999);
                  setDilemmaCostStr(num.toLocaleString('ko-KR'));
                }}
              />

              <div className="daily-note-section daily-note-section--mt">
                <p className="form-label">소비 고민 설명 <span className="daily-note-required">*</span></p>
                <p className="daily-note-desc">살까 말까 진짜 필요할까? 짠친들에게 과소비 판정을 요청해 보세요.</p>
                <textarea
                  className={`daily-note-textarea${dilemmaText.trim().length >= 5 ? ' daily-note-textarea--valid' : ''}`}
                  value={dilemmaText}
                  onChange={e => setDilemmaText(e.target.value)}
                  placeholder="예) 가죽 재킷 세일하는데, 이번 달 식비 아껴서 살까요? 😭"
                  maxLength={120}
                  rows={3}
                />
                <p className="daily-note-char-count">{dilemmaText.length}/120 · 5자 이상 입력</p>
              </div>
            </div>
          )}

          {/* 사진 업로드 영역 */}
          {creatorMode !== 'record' && (
            <div className="image-upload-section">
              <p className="form-label">사진 첨부 (선택)</p>
              {imageError && (
                <p className="image-error-msg">⚠️ {imageError}</p>
              )}
              {image ? (
                <div className="image-preview-container">
                  <img src={image} alt="Preview" />
                  <button
                    className="image-remove-btn"
                    onClick={() => { setImage(null); setImageError(null); }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="image-upload-label">
                  <span>📸</span>
                  <span>인증샷 / 사진 첨부</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                  />
                </label>
              )}
            </div>
          )}

          {/* 소비/무지출 모드에서만 노출하는 이미지 업로드 영역 */}
          {creatorMode === 'record' && !showZeroNote && (
            <div className="image-upload-section">
              <p className="form-label">지출 인증샷 / 영수증 (선택)</p>
              {imageError && (
                <p className="image-error-msg">⚠️ {imageError}</p>
              )}
              {image ? (
                <div className="image-preview-container">
                  <img src={image} alt="Preview" />
                  <button
                    className="image-remove-btn"
                    onClick={() => { setImage(null); setImageError(null); }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <label className="image-upload-label">
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
          )}
        </div>

        {/* 제출 */}
        <div className="modal-footer">
          {creatorMode === 'record' && (
            items.length === 0 && !showZeroNote ? (
              <p className="submit-hint">항목을 1개 이상 추가해 주세요</p>
            ) : items.length > 0 ? (
              <>
                {!isAdditional && dailyNote.trim().length < 5 && (
                  <p className="submit-hint submit-hint--mb">오늘 한마디를 5자 이상 입력해 주세요</p>
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
            ) : null
          )}

          {creatorMode === 'tip' && (
            <>
              {tipText.trim().length < 5 && (
                <p className="submit-hint submit-hint--mb">꿀팁 내용을 5자 이상 입력해 주세요</p>
              )}
              <Button
                size="xlarge"
                display="full"
                color="primary"
                variant="fill"
                onClick={handleSubmit}
                loading={submitting}
                disabled={tipText.trim().length < 5}
              >
                {submitting ? '저장 중...' : '꿀팁 공유하기 💡'}
              </Button>
            </>
          )}

          {creatorMode === 'dilemma' && (
            <>
              {(dilemmaText.trim().length < 5 || !dilemmaCostStr) && (
                <p className="submit-hint submit-hint--mb">금액과 고민 설명을 5자 이상 입력해 주세요</p>
              )}
              <Button
                size="xlarge"
                display="full"
                color="primary"
                variant="fill"
                onClick={handleSubmit}
                loading={submitting}
                disabled={dilemmaText.trim().length < 5 || !dilemmaCostStr}
              >
                {submitting ? '저장 중...' : '판정 투표 올리기 ⚖️'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
