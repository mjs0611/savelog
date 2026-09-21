export default function JournalIcon({ name, size = 22 }: {
  name: 'check' | 'book' | 'today' | 'arrow' | 'back' | 'download' | 'lock' | 'close' | 'wallet'; size?: number;
}) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    book: <><path d="M5 3h12a2 2 0 0 1 2 2v16H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Z" /><path d="M3 17h16M8 7h6M8 11h4" /></>,
    today: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-12 5 2 2 4-4" /></>,
    arrow: <path d="m9 5 7 7-7 7" />,
    back: <path d="m15 5-7 7 7 7" />,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    wallet: <><path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7" /><path d="M20 12h-5v5h5m-3-2.5h.01" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
