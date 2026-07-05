import React from 'react';

const EMOJI_MAP: Record<string, string> = {
  // Categories
  '🍚': '/images/icon_food.png',
  '🛵': '/images/icon_food.png',
  '🍔': '/images/icon_food.png',
  '🍻': '/images/icon_food.png',
  '🍕': '/images/icon_food.png',
  '🥗': '/images/icon_food.png',
  '🍽️': '/images/icon_food.png',
  
  '☕': '/images/icon_cafe.png',
  
  '🚇': '/images/icon_bus.png',
  '🚌': '/images/icon_bus.png',
  '🚶': '/images/icon_bus.png',
  '🏃': '/images/icon_bus.png',
  
  '🏠': '/images/icon_home.png',
  '💊': '/images/icon_cart.png',
  '🛒': '/images/icon_cart.png',
  '🏪': '/images/icon_cart.png',
  '🛍': '/images/icon_cart.png',
  
  '🛍️': '/images/icon_shopping.png',
  '💎': '/images/icon_shopping.png',
  '💻': '/images/icon_shopping.png',
  '🧥': '/images/icon_shopping.png',
  '💸': '/images/icon_shopping.png',
  
  '🎮': '/images/icon_other.png',
  '📦': '/images/icon_other.png',
  '🎁': '/images/icon_other.png',
  '🤝': '/images/icon_friends.svg',
  '💞': '/images/icon_friends.svg',
  '💰': '/images/icon_other.png',
  '🪙': '/images/icon_other.png',
  '💬': '/images/icon_other.png',
  '🎉': '/images/icon_other.png',
  '🔄': '/images/icon_other.png',
  '⏰': '/images/icon_other.png',
  '⏳': '/images/icon_other.png',
  '🎩': '/images/icon_other.png',
  
  // UI Tabs & Badges
  '📋': '/images/icon_records.png',
  '🖼️': '/images/icon_gallery.png',
  '📸': '/images/icon_gallery.png',
  '📷': '/images/icon_gallery.png',
  '📊': '/images/icon_stats.png',
  '✉️': '/images/icon_mail.png',
  '💌': '/images/icon_mail.png',
  '📬': '/images/icon_mailbox.png',
  '📮': '/images/icon_mailbox.png',
  '✨': '/images/icon_zero_spend.png',
  '💡': '/images/icon_bulb.png',
  '🌡️': '/images/icon_temp.png',
  '🔥': '/images/icon_flame.png',
  '🏆': '/images/icon_medal.png',
  '👑': '/images/icon_medal.png',
  '🥇': '/images/icon_medal.png',
  '🥈': '/images/icon_medal.png',
  '🥉': '/images/icon_medal.png',
  '🏅': '/images/icon_medal.png',
  '👥': '/images/icon_friends.svg',
  '⚙️': '/images/icon_settings.svg',
  '⚡': '/images/icon_thunder.svg',
  '👏': '/images/icon_clap.svg',
  '🛡️': '/images/icon_shield.svg',
  '🐷': '/images/icon_pig.svg',
  '🚫': '/images/icon_zero_spend.png',
  '🌿': '/images/icon_zero_spend.png',
  '⚖️': '/images/icon_target.png',
  '🎯': '/images/icon_target.png',
  '📝': '/images/icon_records.png',
  '🌱': '/images/icon_zero_spend.png',
  '🎓': '/images/icon_other.png',
  '🕸️': '/images/icon_other.png',
  '🧊': '/images/icon_zero_spend.png',
  '🌋': '/images/icon_flame.png',
  '☀️': '/images/icon_temp.png',
  '❓': '/images/icon_other.png',
  '🌳': '/images/icon_zero_spend.png',
  '🥤': '/images/icon_other.png',
  '🍱': '/images/icon_food.png',
  '🎨': '/images/icon_other.png',
  '📚': '/images/icon_other.png',
  '💧': '/images/icon_temp.png',
  '➕': '/images/icon_other.png',
  '⚠️': '/images/icon_other.png',
  '⚠': '/images/icon_other.png',
  '🎴': '/images/icon_other.png',
  '🐹': '/images/mbti_hamster.png',
  '✍️': '/images/icon_records.png',
  '🍳': '/images/icon_food.png',
  '🤖': '/images/mbti_robot.png',
  '🦄': '/images/mbti_unicorn.png',
  '🔒': '/images/icon_lock.png',
  '🚨': '/images/icon_shield.png',
};

const SVG_MAP: Record<string, () => React.ReactNode> = {
  '❤️': () => (
    <svg className="custom-svg-icon" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  '💖': () => (
    <svg className="custom-svg-icon" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  '🤍': () => (
    <svg className="custom-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ),
  '💬': () => (
    <svg className="custom-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  '✈️': () => (
    <svg className="custom-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  ),
  '👥': () => (
    <svg className="custom-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  '🔄': () => (
    <svg className="custom-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
    </svg>
  ),
  '🌟': () => (
    <svg className="custom-svg-icon" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
};

export function hasMappedIcon(emoji: string): boolean {
  return !!(SVG_MAP[emoji] || SVG_MAP[emoji + '\uFE0F'] || EMOJI_MAP[emoji] || EMOJI_MAP[emoji + '\uFE0F']);
}

// \u2500\u2500 Twemoji \uD3F4\uBC31 \u2014 \uB9E4\uD551\uC5D0 \uC5C6\uB294 \uC774\uBAA8\uC9C0\uB3C4 OS \uAE30\uBCF8 \uB300\uC2E0 \uC77C\uAD00\uB41C \uCEE4\uC2A4\uD140 \uB8E9\uC73C\uB85C \u2500\u2500\u2500\u2500\u2500\u2500
// jsdelivr CDN (\uD3F0\uD2B8 import\uC640 \uB3D9\uC77C \uCD9C\uCC98). \uB85C\uB4DC \uC2E4\uD328 \uC2DC OS \uC774\uBAA8\uC9C0\uB85C \uC790\uB3D9 \uBCF5\uADC0.
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/';

function toCodePoint(str: string): string {
  const r: string[] = [];
  let p = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (p) {
      r.push((0x10000 + ((p - 0xd800) << 10) + (c - 0xdc00)).toString(16));
      p = 0;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      p = c;
    } else {
      r.push(c.toString(16));
    }
  }
  return r.join('-');
}

function twemojiUrl(emoji: string): string {
  // twemoji \uD30C\uC77C\uBA85 \uADDC\uCE59: ZWJ(U+200D) \uC2DC\uD000\uC2A4\uAC00 \uC544\uB2C8\uBA74 \uBCC0\uC774 \uC120\uD0DD\uC790(U+FE0F) \uC81C\uAC70
  const cleaned = emoji.indexOf('\u200D') < 0 ? emoji.replace(/\uFE0F/g, '') : emoji;
  return `${TWEMOJI_BASE}${toCodePoint(cleaned)}.png`;
}

function TwemojiIcon({ emoji, className = '' }: { emoji: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <span className={className}>{emoji}</span>;
  return (
    <img
      src={twemojiUrl(emoji)}
      alt={emoji}
      className={`twemoji ${className}`}
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export default function CustomIcon({ emoji, className = '' }: { emoji: string; className?: string }) {
  const renderSvg = SVG_MAP[emoji] || SVG_MAP[emoji + '\uFE0F'];
  if (renderSvg) {
    return <span className={`custom-svg-wrap ${className}`}>{renderSvg()}</span>;
  }

  const imageSrc = EMOJI_MAP[emoji] || EMOJI_MAP[emoji + '\uFE0F'];

  if (imageSrc) {
    return <img src={imageSrc} alt={emoji} className={`inline-icon ${className}`} />;
  }

  return <TwemojiIcon emoji={emoji} className={className} />;
}

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

// \uCEE4\uC2A4\uD140 \uB9E4\uD551\uC774 \uC5C6\uC5B4\uB3C4 \uC774\uBAA8\uC9C0 \uBB38\uC790\uBA74 \uC804\uBD80 CustomIcon(\u2192Twemoji)\uC73C\uB85C \uB80C\uB354
const EMOJI_SEGMENT_RE = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;

export function renderTextWithEmoji(text: string) {
  if (!text) return <></>;
  const result: React.ReactNode[] = [];
  let buffer = '';
  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (hasMappedIcon(segment) || EMOJI_SEGMENT_RE.test(segment)) {
      if (buffer) { result.push(buffer); buffer = ''; }
      result.push(<CustomIcon key={result.length} emoji={segment} />);
    } else {
      buffer += segment;
    }
  }
  if (buffer) result.push(buffer);
  return <>{result}</>;
}
