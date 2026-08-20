import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// TDS(약 870KB)와 앱 본체를 시작 번들에서 분리한다. 첫 페인트는 아래 스플래시가
// CSS만으로 즉시 그리고, 그 뒤에 본체 청크가 붙는다.
// (자매앱 fx-signal·economy-piggy가 "최초 접속 20초 초과"로 반려된 사유를 선제 차단)
const Root = lazy(() => import('./Root'));

function BootSplash() {
  return (
    <div className="boot-splash">
      <span className="boot-splash-logo">savelog</span>
      <span className="boot-splash-sub">불러오는 중</span>
    </div>
  );
}

declare const __BUILD_ID__: string;
(window as unknown as Record<string, unknown>).__build__ = __BUILD_ID__;

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#191F28', background: '#ffffff', minHeight: '100dvh' }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>앱 오류</h2>
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--ink-red-strong)' }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <Suspense fallback={<BootSplash />}>
      <Root />
    </Suspense>
  </ErrorBoundary>,
);
