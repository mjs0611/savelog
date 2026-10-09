import { ThemeProvider, PortalProvider } from '@toss/tds-mobile';
import App from './LegacyApp';
import './style.css';

/**
 * 기존 커뮤니티 화면의 TDS 프로바이더 + App.
 * Root.tsx가 기존 공간 경로·공유 링크에서만 지연 로드한다. 개인 기록 홈에서는 로드하지 않는다.
 * main.tsx는 Root를 기다리는 스플래시, Root.tsx는 이 청크를 기다리는 스플래시를 표시한다.
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
