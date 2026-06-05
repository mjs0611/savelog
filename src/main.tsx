import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, PortalProvider } from '@toss/tds-mobile';
import './style.css';
import App from './App';

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
          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#FF4D4F' }}>
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
    <ThemeProvider>
      <PortalProvider>
        <App />
      </PortalProvider>
    </ThemeProvider>
  </ErrorBoundary>,
);
