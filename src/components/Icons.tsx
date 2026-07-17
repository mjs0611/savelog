// 크롬(탭바·액션바) 전용 단색 SVG 아이콘 — 이모지의 원색 노이즈를 걷어내고
// currentColor로 상태 색(active/mute)을 그대로 상속한다. 콘텐츠 영역 이모지는 유지.
interface IconProps {
  size?: number;
  strokeWidth?: number;
  filled?: boolean;
  className?: string;
}

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    className,
    'aria-hidden': true as const,
  };
}

// 말풍선 (댓글)
export function IconChat({ size = 17, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3.5c-4.8 0-8.5 3.2-8.5 7.3 0 2.3 1.2 4.3 3.1 5.6-.1 1-.5 2.2-1.4 3.1 1.6.1 3.2-.5 4.3-1.3.8.2 1.6.3 2.5.3 4.8 0 8.5-3.2 8.5-7.3S16.8 3.5 12 3.5z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

// 도장 (판정 스탬프)
export function IconStamp({ size = 17, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3.5a3.2 3.2 0 0 0-3.2 3.2c0 1.5.9 2.5 1.4 3.6.3.7.3 1.7-.4 2.2H8a2.5 2.5 0 0 0-2.5 2.5V16h13v-1a2.5 2.5 0 0 0-2.5-2.5h-1.8c-.7-.5-.7-1.5-.4-2.2.5-1.1 1.4-2.1 1.4-3.6A3.2 3.2 0 0 0 12 3.5z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M5.5 19.5h13" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

// 하트 (응원)
export function IconHeart({ size = 17, strokeWidth = 1.8, filled = false, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path
        d="M12 20s-7.5-4.6-7.5-10A4.4 4.4 0 0 1 9 5.6c1.3 0 2.4.6 3 1.6.6-1 1.7-1.6 3-1.6a4.4 4.4 0 0 1 4.5 4.4c0 5.4-7.5 10-7.5 10z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

// 공유 (트레이에서 위로)
export function IconShare({ size = 17, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 3.5v11M12 3.5 8 7.5M12 3.5l4 4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 12.5v6A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

// ── 탭바 3종 ──────────────────────────────────────────────────────────────────

// 피드 (홈)
export function IconTabFeed({ size = 22, strokeWidth = 1.8, filled = false, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path
        d="M4 10.2 12 3.8l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5h-4V14h-5v6.5h-4A1.5 1.5 0 0 1 4 19v-8.8z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  );
}

// 광장 (말풍선 두 개)
export function IconTabPlaza({ size = 22, strokeWidth = 1.8, filled = false, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path
        d="M4 5.5h11A1.5 1.5 0 0 1 16.5 7v6a1.5 1.5 0 0 1-1.5 1.5H8.5l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 13V7A1.5 1.5 0 0 1 4 5.5z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
      <path d="M19.5 9.5h.5A1.5 1.5 0 0 1 21.5 11v5a1.5 1.5 0 0 1-1.5 1.5h-.5v2.5l-3-2.5h-3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// 마이로그 (사람)
export function IconTabMy({ size = 22, strokeWidth = 1.8, filled = false, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="8" r="3.8" stroke="currentColor" strokeWidth={strokeWidth} fill={filled ? 'currentColor' : 'none'} />
      <path d="M4.5 20.5c.8-3.6 3.9-5.7 7.5-5.7s6.7 2.1 7.5 5.7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  );
}

// 짠친 목록 (두 사람)
export function IconFriends({ size = 18, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="9" cy="8.5" r="3.2" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M3.5 19.5c.7-3 3-4.8 5.5-4.8s4.8 1.8 5.5 4.8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M15.5 5.8a3.2 3.2 0 0 1 0 5.4M17.5 14.9c1.6.8 2.7 2.4 3 4.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

// 트로피 (주간 랭킹)
export function IconTrophy({ size = 18, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M8 4.5h8v5a4 4 0 0 1-8 0v-5z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M8 6H5.5v1.5a3 3 0 0 0 2.7 3M16 6h2.5v1.5a3 3 0 0 1-2.7 3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M12 13.5v3M9 19.5h6M10 16.5h4v3h-4z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" />
    </svg>
  );
}

// 설정 (기어)
export function IconGear({ size = 18, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={strokeWidth} />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
