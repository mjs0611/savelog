import { lazy, Suspense } from 'react';
import App from './App';

// Existing public links keep their destination; personal home does not load TDS or Supabase.
const LegacyRoot = lazy(() => import('./LegacyRoot'));
export default function Root() {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  const legacy = ['/legacy', '/feed', '/community', '/chat', '/mylog', '/profile'].some(p => path === p || path.startsWith(p + '/')) ||
    ['duo', 'circle', 'room', 'by'].some(key => params.has(key));
  return legacy ? <Suspense fallback={<div className="boot-splash">기존 공간을 불러오는 중</div>}><LegacyRoot /></Suspense> : <App />;
}
