import { ThemeProvider, PortalProvider } from '@toss/tds-mobile';
import App from './LegacyApp';
import './style.css';

/**
 * TDS 프로바이더 + App.
 * main.tsx에서 지연 로드되는 경계 — 이 파일이 TDS(약 870KB)를 시작 번들 밖으로 밀어낸다.
 * 첫 페인트는 main.tsx의 스플래시가 CSS만으로 그리고, 그 다음에 이 청크가 붙는다.
 */
export default function Root() {
  return (
    <ThemeProvider>
      <PortalProvider>
        <a className="legacy-return" href="/">← 개인 소비 기록으로 돌아가기</a>
        <App />
      </PortalProvider>
    </ThemeProvider>
  );
}
