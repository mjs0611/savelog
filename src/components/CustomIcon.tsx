
const EMOJI_MAP: Record<string, string> = {
  // Categories
  '🍚': '/images/icon_food.png',
  '🛵': '/images/icon_food.png',
  '🍔': '/images/icon_food.png',
  '🍻': '/images/icon_food.png',
  '🍕': '/images/icon_food.png',
  
  '☕': '/images/icon_cafe.png',
  
  '🚇': '/images/icon_bus.png',
  '🚌': '/images/icon_bus.png',
  '🚶': '/images/icon_bus.png',
  
  '🏠': '/images/icon_cart.png',
  '💊': '/images/icon_cart.png',
  '🛒': '/images/icon_cart.png',
  
  '🛍️': '/images/icon_shopping.png',
  '💎': '/images/icon_shopping.png',
  '💻': '/images/icon_shopping.png',
  '🧥': '/images/icon_shopping.png',
  
  '🎮': '/images/icon_other.png',
  '📦': '/images/icon_other.png',
  '🎁': '/images/icon_other.png',
  '🤝': '/images/icon_other.png',
  '💰': '/images/icon_other.png',
  '💬': '/images/icon_other.png',
  '🎉': '/images/icon_other.png',
  '🔄': '/images/icon_other.png',
  
  // UI Tabs & Badges
  '📋': '/images/icon_records.png',
  '🖼️': '/images/icon_gallery.png',
  '📸': '/images/icon_gallery.png',
  '📷': '/images/icon_gallery.png',
  '📊': '/images/icon_stats.png',
  '✉️': '/images/icon_mail.png',
  '✨': '/images/icon_zero_spend.png',
  '💡': '/images/icon_bulb.png',
  '🌡️': '/images/icon_temp.png',
  '🔥': '/images/icon_flame.png', // Or other if specified
  '🏆': '/images/icon_medal.png',
  '👑': '/images/icon_medal.png',
  '🥇': '/images/icon_medal.png',
  '🥈': '/images/icon_medal.png',
  '🥉': '/images/icon_medal.png',
  '👥': '/images/icon_friends.svg',
  '⚙️': '/images/icon_settings.svg',
  '⚡': '/images/icon_thunder.svg',
  '👏': '/images/icon_clap.svg',
  '🛡️': '/images/icon_shield.svg',
  '🐷': '/images/icon_pig.svg',
  '🚫': '/images/icon_zero_spend.png',
  '🌿': '/images/icon_zero_spend.png',
  '⚖️': '/images/icon_target.png',
  '📝': '/images/icon_records.png',
  '💸': '/images/icon_shopping.png',
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
  '🏪': '/images/icon_cart.png',
  '🍳': '/images/icon_food.png',
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
};

export function hasMappedIcon(emoji: string): boolean {
  return !!(SVG_MAP[emoji] || SVG_MAP[emoji + '\uFE0F'] || EMOJI_MAP[emoji] || EMOJI_MAP[emoji + '\uFE0F']);
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
  
  return <span className={className}>{emoji}</span>;
}
