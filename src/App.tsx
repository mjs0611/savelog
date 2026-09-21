import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import JournalIcon from './components/JournalIcon';
import { EMPTY_JOURNAL, JOURNAL_KEY, MAX_AMOUNT, mergeJournal, parseJournal, readJournal, saveCheckIn,
  todayKST, weekDates, weekSummary, type Journal } from './lib/journal';
import { trackJournal } from './lib/journalAnalytics';

const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;
const dayLabel = (date: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'long',
}).format(new Date(`${date}T12:00:00+09:00`));
const weekdays = ['월', '화', '수', '목', '금', '토', '일'];

export default function App() {
  const [today, setToday] = useState(todayKST);
  const [selectedDate, setSelectedDate] = useState(todayKST);
  const [tab, setTab] = useState<'today' | 'history'>(window.location.pathname === '/history' ? 'history' : 'today');
  const [initial] = useState(() => {
    try { return { journal: readJournal(localStorage), error: '' }; }
    catch { return { journal: EMPTY_JOURNAL, error: '이 기기의 기록을 읽을 수 없어요. 저장 공간 설정을 확인한 뒤 다시 열어 주세요. 기존 기록은 덮어쓰지 않아요.' }; }
  });
  const [journal, setJournal] = useState<Journal>(initial.journal);
  const [storageError, setStorageError] = useState(initial.error);
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<'zero' | 'spend' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [backupText, setBackupText] = useState('');
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const draftActive = useRef(false);
  const amountInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const entry = journal.entries.find(e => e.date === selectedDate);
  const summary = weekSummary(journal, today);
  const dates = weekDates(today);
  const isForm = !entry || editing;
  draftActive.current = isForm && kind !== null;

  useEffect(() => { trackJournal('open', { has_history: initial.journal.entries.length > 0 }); }, [initial]);
  useEffect(() => {
    let currentDay = todayKST();
    function refresh() {
      const next = todayKST();
      if (currentDay === next) return;
      currentDay = next;
      setToday(next);
      if (draftActive.current) {
        setMessage('날짜가 바뀌었어요. 작성 중인 기록은 원래 날짜로 저장돼요.');
      } else {
        setSelectedDate(next); setEditing(false); setKind(null); setAmount(''); setNote('');
        setMessage('날짜가 바뀌었어요. 오늘 기록을 시작해 주세요.');
      }
    }
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => {
    function update(e: StorageEvent) {
      if (e.key !== JOURNAL_KEY && e.key !== null) return;
      try { setJournal(readJournal(localStorage)); setStorageError(''); }
      catch { setStorageError('다른 창의 기록을 읽을 수 없어요. 이 화면을 다시 열어 주세요.'); }
    }
    window.addEventListener('storage', update);
    return () => window.removeEventListener('storage', update);
  }, []);
  useEffect(() => {
    if (kind === 'spend' && isForm) amountInput.current?.focus();
  }, [kind, isForm]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  function selectDate(date: string, discard = false) {
    if (date === selectedDate) { changeTab('today'); return; }
    if (!discard && date !== selectedDate && draftActive.current) { setPendingDate(date); return; }
    setPendingDate(null);
    setSelectedDate(date); setEditing(false); setKind(null); setAmount(''); setNote(''); setError('');
    changeTab('today');
  }
  function changeTab(next: 'today' | 'history') {
    setTab(next);
    window.history.replaceState(null, '', next === 'today' ? '/' : '/history');
    if (next === 'history') trackJournal('history_open');
  }
  function choose(next: 'zero' | 'spend') {
    setKind(next); setError('');
    trackJournal('record_start', { kind: next, action: entry ? 'edit' : 'create' });
  }
  function edit() {
    if (!entry) return;
    setKind(entry.amount === 0 ? 'zero' : 'spend'); setAmount(entry.amount ? String(entry.amount) : '');
    setNote(entry.note); setEditing(true); setError('');
  }
  function save(event: FormEvent) {
    event.preventDefault();
    const total = kind === 'zero' ? 0 : Number(amount);
    if (!kind) { setError('오늘 소비를 선택해 주세요.'); return; }
    if (kind === 'spend' && (!amount || !Number.isSafeInteger(total) || total <= 0 || total > MAX_AMOUNT)) {
      setError(`쓴 금액을 1원부터 ${won(MAX_AMOUNT)}까지 입력해 주세요.`); amountInput.current?.focus(); return;
    }
    if (selectedDate > todayKST()) { setError('미래 날짜는 기록할 수 없어요.'); return; }
    try {
      const next = saveCheckIn(localStorage, { date: selectedDate, amount: total, note: note.trim(), updatedAt: new Date().toISOString() });
      setJournal(next); setEditing(false); setError(''); setStorageError('');
      setMessage(entry ? '기록을 수정했어요.' : '이 기기에 기록했어요.');
      trackJournal('record_saved', { kind, action: entry ? 'edit' : 'create', has_history: journal.entries.length > 0 });
    } catch {
      setError('저장하지 못했어요. 입력한 내용은 그대로예요. 기기 저장 공간을 확인한 뒤 다시 눌러 주세요.');
      trackJournal('record_failed', { kind });
    }
  }
  function exportBackup() {
    try {
      const contents = JSON.stringify(readJournal(localStorage), null, 2);
      setBackupText(contents);
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `savelog-${today}.json`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      trackJournal('backup_export');
    } catch { setMessage('백업을 만들 수 없어요. 기기 저장 공간을 확인해 주세요.'); }
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('5MB 이하의 세이브로그 백업 파일을 선택해 주세요.');
      const imported = parseJournal(await file.text());
      if (imported.entries.some(e => e.date > todayKST())) throw new Error('미래 날짜가 있는 백업은 가져올 수 없어요.');
      const result = mergeJournal(localStorage, imported);
      setJournal(result.journal); setMessage(`${result.added}일의 기록을 가져왔어요. 같은 날짜의 기존 기록은 유지했어요.`);
      trackJournal('backup_import');
    } catch (e) { setMessage(e instanceof Error ? e.message : '가져오지 못했어요. 백업 파일을 확인해 주세요.'); }
    finally { if (importInput.current) importInput.current.value = ''; }
  }

  return (
    <div className="journal-app">
      <a className="journal-skip" href="#journal-main">본문으로 이동</a>
      <header className="journal-header">
        <a href="/" className="journal-wordmark" aria-label="세이브로그 홈">savelog<span /></a>
        <a href="/legacy" className="journal-legacy-link" onClick={() => trackJournal('legacy_open')}>기존 공개 기록 <JournalIcon name="arrow" size={14} /></a>
      </header>
      <main id="journal-main">
        {storageError && <div className="journal-error" role="alert">{storageError}<button className="journal-text-button" onClick={() => window.location.reload()}>다시 열기</button></div>}
        {pendingDate && <div className="journal-date-warning" role="alert"><p>아직 저장하지 않은 내용이 있어요.</p><div><button className="journal-text-button" onClick={() => setPendingDate(null)}>계속 작성하기</button><button className="journal-text-button" onClick={() => selectDate(pendingDate, true)}>저장하지 않고 날짜 이동</button></div></div>}
        {tab === 'today' ? <>
          <section className="journal-intro">
            <div className="journal-date-line"><time dateTime={selectedDate}>{dayLabel(selectedDate)}</time></div>
            <h1>{entry && !editing ? selectedDate === today ? '오늘을 남겼어요.' : '이날을 남겼어요.' : selectedDate === today ? '오늘, 어떻게 썼나요?' : '이날, 어떻게 썼나요?'}</h1>
            <p>{entry && !editing ? '잘 쓴 날도, 안 쓴 날도. 내 일주일이 보여요.' : '쓴 돈만 짧게. 평가는 하지 않아요.'}</p>
          </section>
          <div className="journal-workspace">
            <section className="journal-entry" aria-label="소비 기록">
              {isForm ? <form onSubmit={save}>
                <fieldset className="journal-choices" disabled={!!storageError}>
                  <legend className="journal-sr-only">소비 여부</legend>
                  <button type="button" className={`journal-choice ${kind === 'spend' ? 'is-selected' : ''}`} aria-pressed={kind === 'spend'} onClick={() => choose('spend')}>
                    <span className="journal-choice-symbol"><JournalIcon name="wallet" size={27} /></span><strong>돈을 썼어요</strong><span>오늘 쓴 총액 남기기</span>
                  </button>
                  <button type="button" className={`journal-choice ${kind === 'zero' ? 'is-selected' : ''}`} aria-pressed={kind === 'zero'} onClick={() => choose('zero')}>
                    <span className="journal-choice-symbol"><JournalIcon name="check" size={27} /></span><strong>안 썼어요</strong><span>0원으로 하루 남기기</span>
                  </button>
                </fieldset>
                {kind && <div className="journal-fields">
                  {kind === 'spend' ? <div className="journal-amount-field">
                    <label htmlFor="daily-amount">{selectedDate === today ? '오늘' : '이날'} 쓴 총액</label>
                    <div className="journal-amount-input"><input ref={amountInput} id="daily-amount" inputMode="numeric" autoComplete="off" value={amount} maxLength={8}
                      placeholder="0" aria-invalid={!!error} aria-describedby={error ? 'record-error' : 'amount-help'} onChange={e => {
                        const next = e.target.value.replace(/[,\s]/g, '');
                        if (/^\d*$/.test(next)) { setAmount(next); setError(''); }
                        else setError('금액은 원 단위 숫자로 입력해 주세요.');
                      }} /><span>원</span></div>
                    <p id="amount-help">빠뜨린 지출은 나중에 총액을 수정하면 돼요.</p>
                  </div> : <p className="journal-zero-note">{selectedDate === today ? '오늘' : '이날'} 쓴 돈을 <strong>0원</strong>으로 기록해요.</p>}
                  <label className="journal-note-label" htmlFor="daily-note">한 줄 메모 <span>선택</span></label>
                  <input className="journal-note-input" id="daily-note" value={note} maxLength={120} placeholder={kind === 'zero' ? '집밥 먹고 산책한 날' : '친구와 먹은 점심이 좋았어요'} onChange={e => setNote(e.target.value)} />
                  {error && <p id="record-error" className="journal-error" role="alert">{error}</p>}
                  <button className="journal-primary" type="submit" disabled={!!storageError}>{editing ? '수정한 내용 저장' : kind === 'zero' ? '0원으로 기록하기' : '소비 기록하기'}<JournalIcon name="check" size={19} /></button>
                  {editing && <button className="journal-text-button journal-cancel" type="button" onClick={() => { setEditing(false); setKind(null); setError(''); }}>수정 취소</button>}
                </div>}
                {!kind && <p className="journal-entry-hint">둘 중 하나를 고르면 기록을 시작할 수 있어요.</p>}
              </form> : <div className="journal-saved">
                <div className="journal-saved-heading"><span><JournalIcon name="check" size={18} /> 기록 완료</span><button className="journal-text-button" onClick={edit}>수정하기</button></div>
                <p className="journal-saved-amount">{won(entry.amount)}</p>
                <p className="journal-saved-note">{entry.note || (entry.amount === 0 ? '돈을 쓰지 않은 하루였어요.' : '쓴 돈을 확인했어요.')}</p>
                <p className="journal-return-prompt">내일도 이 칸에서 하루를 남겨보세요.</p>
              </div>}
              <p className="journal-private"><JournalIcon name="lock" size={14} /> 로그인 없이 이 기기에만 저장해요.</p>
            </section>
            <section className="journal-week" aria-labelledby="week-title">
              <div className="journal-section-heading"><h2 id="week-title">이번 주, 한 칸씩</h2><span>{Number(dates[0].slice(5, 7))}.{Number(dates[0].slice(8))} – {Number(dates[6].slice(5, 7))}.{Number(dates[6].slice(8))}</span></div>
              <div className="journal-week-grid">
                {dates.map((date, i) => {
                  const item = journal.entries.find(e => e.date === date);
                  return <button key={date} className={`journal-day ${item ? 'is-recorded' : ''} ${date === selectedDate ? 'is-current' : ''}`}
                    aria-label={`${dayLabel(date)}, ${item ? won(item.amount) : '기록 없음'}`} aria-pressed={date === selectedDate} disabled={date > today} onClick={() => selectDate(date)}>
                    <span>{weekdays[i]}</span><span className="journal-day-cell">{item ? <JournalIcon name="check" size={20} /> : Number(date.slice(8))}</span><span className="journal-day-state">{item ? item.amount === 0 ? '0원' : '지출' : date === today ? '오늘' : '—'}</span>
                  </button>;
                })}
              </div>
              {summary.recorded > 0 ? <div className="journal-week-summary"><p><strong>{summary.recorded}일</strong>을 남겼어요. 그중 무지출은 <strong>{summary.zero}일</strong>.</p><p>기록한 소비 합계 <strong>{won(summary.total)}</strong></p><span>빈 날짜는 합계에 포함하지 않아요.</span></div>
                : <p className="journal-week-empty">첫 기록이 이곳에 쌓여요.<br />하루 빠져도 괜찮아요. 남긴 날은 그대로예요.</p>}
              {selectedDate !== today && <button className="journal-text-button" onClick={() => selectDate(today)}>오늘로 돌아오기 <JournalIcon name="arrow" size={14} /></button>}
            </section>
          </div>
          <section className="journal-bottom-note"><h2>정확한 가계부가 부담스러운 날에도.</h2><p>금액 하나, 기억하고 싶은 한 줄이면 충분해요.<br />카드·계좌 내역은 연결하지 않아요.</p></section>
        </> : <>
          <section className="journal-intro"><h1>내가 남긴 날들</h1><p>남과 비교하지 않고, 지난 나를 돌아봐요.</p></section>
          {journal.entries.length ? <div className="journal-history">
            <p className="journal-history-count">총 {journal.entries.length}일의 기록</p>
            {journal.entries.map(item => <button className="journal-history-row" key={item.date} onClick={() => selectDate(item.date)}>
              <span className={`journal-history-mark ${item.amount === 0 ? 'is-zero' : ''}`}><JournalIcon name={item.amount === 0 ? 'check' : 'wallet'} size={19} /></span>
              <span className="journal-history-copy"><time dateTime={item.date}>{dayLabel(item.date)}</time><span>{item.note || (item.amount === 0 ? '무지출로 남긴 하루' : '쓴 돈을 확인한 하루')}</span></span>
              <strong>{won(item.amount)}</strong><JournalIcon name="arrow" size={14} />
            </button>)}
          </div> : <section className="journal-empty-history"><JournalIcon name="book" size={36} /><h2>첫 페이지를 남겨볼까요?</h2><p>기록한 날짜와 금액을 여기서 다시 볼 수 있어요.</p><button className="journal-primary" onClick={() => selectDate(today)}>오늘 기록하기<JournalIcon name="arrow" size={18} /></button></section>}
          <section className="journal-backup"><h2>내 기록 보관하기</h2><p>이 기록은 현재 기기에만 있어요. 앱 데이터 삭제나 기기 변경 전에는 백업 파일을 보관해 주세요.</p>
            <div className="journal-backup-actions"><button className="journal-secondary" disabled={!journal.entries.length || !!storageError} onClick={exportBackup}><JournalIcon name="download" size={17} /> 백업 내보내기</button><button className="journal-secondary" disabled={!!storageError} onClick={() => importInput.current?.click()}>백업 가져오기</button></div>
            <input className="journal-sr-only" ref={importInput} type="file" accept=".json,application/json" aria-label="세이브로그 백업 파일" onChange={e => { void importBackup(e.target.files?.[0]); }} />
            {backupText && <div className="journal-backup-fallback"><label htmlFor="backup-content">파일 저장이 안 되면 아래 내용을 복사해 보관해 주세요.</label><textarea id="backup-content" readOnly value={backupText} onFocus={e => e.target.select()} /><button className="journal-text-button" onClick={() => setBackupText('')}>백업 내용 닫기</button></div>}
          </section>
          <a className="journal-legacy-card" href="/legacy" onClick={() => trackJournal('legacy_open')}><span><strong>예전에 남긴 공개 기록을 찾으세요?</strong><span>예전 공개 기록은 이전 공간에서 확인해요.<br />여기서 쓴 개인 기록은 피드에 올라가지 않아요.</span></span><JournalIcon name="arrow" size={18} /></a>
        </>}
      </main>
      <div className="journal-status" role="status" aria-live="polite">{message && <p>{message}</p>}</div>
      <nav className="journal-nav" aria-label="주 메뉴">
        <button className={tab === 'today' ? 'is-active' : ''} aria-current={tab === 'today' ? 'page' : undefined} onClick={() => selectDate(today)}><JournalIcon name="today" /><span>오늘</span></button>
        <button className={tab === 'history' ? 'is-active' : ''} aria-current={tab === 'history' ? 'page' : undefined} onClick={() => changeTab('history')}><JournalIcon name="book" /><span>내 기록</span></button>
      </nav>
    </div>
  );
}
