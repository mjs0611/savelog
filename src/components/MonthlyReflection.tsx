import { useEffect, useRef, useState } from 'react';
import type { Journal } from '../lib/journal';
import { shiftDate } from '../lib/journal';
import { monthSummary, nextWeekStart, saveMonthReflection, saveWeeklyPromise, shiftMonth, type Reflection } from '../lib/reflection';
import JournalIcon from './JournalIcon';

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
const monthLabel = (month: string) => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월`;
const shortDate = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`;
const suggestions = ['결제 전에 한 번 더 생각하기', '좋았던 지출은 이유를 남기기', '장보기 전에 필요한 것 적기'];

export default function MonthlyReflection({ journal, today, reflection, storageError, onSaved, onDate }: {
  journal: Journal; today: string; reflection: Reflection; storageError: string;
  onSaved: (value: Reflection) => void; onDate: (date: string) => void;
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const saved = reflection.months.find(e => e.month === month);
  const [memorableDate, setMemorableDate] = useState(saved?.memorableDate ?? '');
  const [note, setNote] = useState(saved?.note ?? '');
  const [dirty, setDirty] = useState(false);
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);
  const target = nextWeekStart(today);
  const upcoming = reflection.promises.find(e => e.weekStart === target);
  const [promiseText, setPromiseText] = useState(upcoming?.text ?? '');
  const [promiseEditing, setPromiseEditing] = useState(!upcoming);
  const [promiseDirty, setPromiseDirty] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [allRecords, setAllRecords] = useState(false);
  const previousTarget = useRef(target);
  const summary = monthSummary(journal, month, today);
  const memorable = journal.entries.find(e => e.date === memorableDate);
  const shownEntries = allRecords ? summary.entries : summary.entries.slice(0, 5);

  useEffect(() => {
    if (!dirty) { setMemorableDate(saved?.memorableDate ?? ''); setNote(saved?.note ?? ''); }
  }, [saved, month, dirty]);
  useEffect(() => {
    if (!promiseDirty) { setPromiseText(upcoming?.text ?? ''); setPromiseEditing(!upcoming); }
  }, [upcoming, target, promiseDirty]);
  useEffect(() => {
    if (previousTarget.current !== target && promiseDirty) setStatus('주가 바뀌었어요. 작성 중인 약속은 그대로예요. 아래 새 날짜를 확인하고 저장해 주세요.');
    previousTarget.current = target;
  }, [target, promiseDirty]);
  useEffect(() => {
    if (!dirty && !promiseDirty) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, promiseDirty]);

  function moveMonth(next: string, discard = false) {
    if (dirty && !discard) { setPendingMonth(next); return; }
    setMonth(next); setDirty(false); setPendingMonth(null); setError(''); setStatus(''); setAllRecords(false);
  }
  function saveReview() {
    try {
      onSaved(saveMonthReflection(localStorage, { month, ...(memorableDate ? { memorableDate } : {}), note: note.trim(), updatedAt: new Date().toISOString() }));
      setDirty(false); setError(''); setStatus('이달의 회고를 이 기기에 저장했어요.');
    } catch { setError('회고를 저장하지 못했어요. 선택과 메모는 그대로예요. 저장 공간을 확인하고 다시 눌러 주세요.'); }
  }
  function savePromise() {
    if (!promiseText.trim()) { setError('다음 주에 해보고 싶은 약속 하나를 적어 주세요.'); return; }
    try {
      const sourceMonth = summary.recorded ? month : upcoming?.sourceMonth ?? month;
      const sourceDate = summary.recorded ? memorableDate : upcoming?.sourceDate;
      onSaved(saveWeeklyPromise(localStorage, { weekStart: target, text: promiseText.trim(), sourceMonth,
        ...(sourceDate ? { sourceDate } : {}), updatedAt: new Date().toISOString() }));
      setPromiseDirty(false); setPromiseEditing(false); setError(''); setStatus('다음 주 약속을 저장했어요. 그 주의 하루 기록에서 다시 만나요.');
    } catch { setError('약속을 저장하지 못했어요. 적은 내용은 그대로예요. 저장 공간을 확인하고 다시 눌러 주세요.'); }
  }

  return <section className="journal-month-review" aria-labelledby="month-review-title">
    <div className="journal-intro"><h1 id="month-review-title">한 달 돌아보기</h1><p>쓴 돈보다, 남기고 싶은 기억부터.</p></div>
    <div className="journal-month-heading"><h2>{monthLabel(month)}</h2><nav aria-label="회고 월 이동">
      <button className="journal-text-button" onClick={() => moveMonth(shiftMonth(month, -1))}><JournalIcon name="back" size={14} /> 지난 달</button>
      <button className="journal-text-button" disabled={month >= today.slice(0, 7)} onClick={() => moveMonth(shiftMonth(month, 1))}>다음 달 <JournalIcon name="arrow" size={14} /></button>
      {month !== today.slice(0, 7) && <button className="journal-text-button" onClick={() => moveMonth(today.slice(0, 7))}>이번 달</button>}
    </nav></div>
    {pendingMonth && <div className="journal-date-warning" role="alert"><p>저장하지 않은 회고가 있어요.</p><button className="journal-text-button" onClick={() => setPendingMonth(null)}>계속 회고하기</button><button className="journal-text-button" onClick={() => moveMonth(pendingMonth, true)}>저장하지 않고 월 이동</button></div>}
    {storageError && <p className="journal-error" role="alert">{storageError}</p>}
    {summary.recorded ? <>
      <dl className="journal-month-summary"><div><dt>기록한 소비 합계</dt><dd>{won(summary.total)}</dd></div><div><dt>남긴 날</dt><dd>{summary.recorded}일<span>그중 0원은 {summary.zero}일</span></dd></div></dl>
      <p className="journal-month-disclaimer">{summary.missing}일은 기록이 없어요. 빈 날은 0원으로 세지 않아요.{month === today.slice(0, 7) ? ` ${shortDate(today)}까지 남긴 기록이에요.` : ''}</p>
      <section className="journal-memory" aria-labelledby="memory-title"><h2 id="memory-title">기억에 남는 하루</h2><p>좋았던 소비, 바꾸고 싶은 소비. 하나만 골라도 괜찮아요.</p>
        {memorable && <p className="journal-selected-memory">기억할 날: {shortDate(memorable.date)} · {won(memorable.amount)}<br />{memorable.note || '메모 없이 남긴 하루'}{!shownEntries.some(e => e.date === memorable.date) && <button className="journal-text-button" onClick={() => setAllRecords(true)}>선택한 날 보기</button>}</p>}
        <ul className="journal-month-list">{shownEntries.map(item => <li key={item.date}>
          <button className={`journal-memory-choice ${memorableDate === item.date ? 'is-selected' : ''}`} aria-label={`${shortDate(item.date)} 기억할 하루`} aria-pressed={memorableDate === item.date} disabled={!!storageError} onClick={() => { setMemorableDate(memorableDate === item.date ? '' : item.date); setDirty(true); setStatus(''); }}>
            <span className="journal-memory-indicator"><JournalIcon name="check" size={15} /></span><span><time dateTime={item.date}>{shortDate(item.date)}</time><span>{item.note || (item.amount === 0 ? '무지출로 남긴 하루' : '메모 없이 남긴 하루')}</span></span><strong>{won(item.amount)}</strong>
          </button><button className="journal-text-button journal-record-open" onClick={() => onDate(item.date)} aria-label={`${shortDate(item.date)} 기록 열기`}>기록 열기 <JournalIcon name="arrow" size={14} /></button>
        </li>)}</ul>
        {summary.recorded > 5 && <button className="journal-text-button" onClick={() => setAllRecords(!allRecords)}>{allRecords ? '최근 5일만 보기' : `전체 ${summary.recorded}일 펼치기`}</button>}
        {memorableDate && !memorable && <p className="journal-month-disclaimer">기억할 날은 남아 있지만 이 기기에 그날 기록이 없어요. 백업에서 기록을 가져올 수 있어요.</p>}
        <label className="journal-note-label" htmlFor="month-reflection-note">이달에 기억할 한 줄 <span>선택</span></label><textarea id="month-reflection-note" className="journal-reflection-input" maxLength={140} rows={3} value={note} disabled={!!storageError} placeholder="어떤 소비가 내게 좋았나요?" onChange={e => { setNote(e.target.value); setDirty(true); setStatus(''); }} />
        <button className="journal-secondary" disabled={!!storageError || !dirty} onClick={saveReview}>{dirty ? '회고 저장하기' : saved ? '회고 저장됨' : '회고를 골라보세요'}<JournalIcon name="check" size={16} /></button>
        {dirty && <p className="journal-month-disclaimer">아직 저장 전이에요. 탭을 옮겨도 이 화면에 내용이 남아요.</p>}
      </section>
    </> : <div className="journal-month-empty"><JournalIcon name="book" size={32} /><h2>이달의 기억은 아직 비어 있어요.</h2><p>하루를 남기면 소비와 메모를 여기서 돌아볼 수 있어요.</p><button className="journal-secondary" onClick={() => onDate(today)}>오늘 기록하기 <JournalIcon name="arrow" size={16} /></button></div>}
      {(!!summary.recorded || !!upcoming) && <section className="journal-next-promise" aria-labelledby="promise-title"><h2 id="promise-title">다음 주, 약속 하나</h2><p>오늘 기준 다음 주, {target.slice(0, 4)}년 {shortDate(target)} – {target.slice(0, 4) !== shiftDate(target, 6).slice(0, 4) ? `${shiftDate(target, 6).slice(0, 4)}년 ` : ''}{shortDate(shiftDate(target, 6))}. 완벽하게 지키기보다 한 번 해봐요.</p>
        {upcoming && !promiseEditing ? <div className="journal-promise-saved"><p>{upcoming.text}</p><button className="journal-text-button" onClick={() => { setPromiseText(upcoming.text); setPromiseEditing(true); }}>약속 수정하기</button></div> : <>
          <div className="journal-promise-suggestions" aria-label="약속 예시">{suggestions.map(text => <button className="journal-secondary" key={text} onClick={() => { setPromiseText(text); setPromiseDirty(true); setError(''); }} disabled={!!storageError}>{text}</button>)}</div>
          <label className="journal-note-label" htmlFor="weekly-promise">내가 정한 약속</label><textarea id="weekly-promise" className="journal-reflection-input" maxLength={80} rows={2} value={promiseText} disabled={!!storageError} onChange={e => { setPromiseText(e.target.value); setPromiseDirty(true); setStatus(''); }} placeholder="다음 주에 해보고 싶은 한 가지" />
          <button className="journal-primary" disabled={!!storageError} onClick={savePromise}>다음 주 약속 저장 <JournalIcon name="check" size={17} /></button>
          {upcoming && <button className="journal-text-button" onClick={() => { setPromiseText(upcoming.text); setPromiseDirty(false); setPromiseEditing(false); setError(''); }}>약속 수정 취소</button>}
        </>}
        <p className="journal-month-disclaimer">해당 주의 기록에서 내가 직접 돌아봐요. 기록했다고 약속을 지켰다고 표시하지 않아요.</p>
      </section>}
    {error && <p className="journal-error" role="alert">{error}</p>}
    <p className="journal-reflection-status" role="status" aria-live="polite">{status}</p>
    <p className="journal-private"><JournalIcon name="lock" size={14} /> 회고와 약속도 이 기기에만 저장해요.</p>
  </section>;
}
