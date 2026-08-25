// Ported from config.py's PLACE_ICON_CHOICES. Stored icon values in the
// `places` table are "faName|colorHex" strings (e.g. "home|#3388ff") —
// same format the old Streamlit app wrote, so existing migrated rows
// display correctly here. We don't need actual Font Awesome in React
// (the Python side only used the fa name to look up an emoji anyway via
// _icon_emoji_for_key), so this just maps straight to emoji.
export const PLACE_ICON_CHOICES: { emoji: string; name: string }[] = [
  { emoji: "📍", name: "map-marker" },
  { emoji: "🏠", name: "home" },
  { emoji: "⭐", name: "star" },
  { emoji: "❤️", name: "heart" },
  { emoji: "☕", name: "coffee" },
  { emoji: "🌳", name: "tree" },
  { emoji: "🍽️", name: "cutlery" },
  { emoji: "🏨", name: "bed" },
  { emoji: "🎓", name: "graduation-cap" },
  { emoji: "🎁", name: "gift" },
  { emoji: "🚩", name: "flag" },
  { emoji: "🎵", name: "music" },
  { emoji: "🎉", name: "glass" },
  { emoji: "🛍️", name: "shopping-cart" },
  { emoji: "🎬", name: "film" },
  { emoji: "📷", name: "camera-retro" },
  { emoji: "🏛️", name: "university" },
  { emoji: "🚗", name: "car" },
  { emoji: "🌊", name: "tint" },
  { emoji: "🎡", name: "ticket" },
];

export const DEFAULT_ICON_NAME = "map-marker";
export const DEFAULT_COLOR = "#3388ff";

export function emojiForIconName(name: string): string {
  return PLACE_ICON_CHOICES.find((c) => c.name === name)?.emoji ?? "📍";
}

export function splitIcon(iconValue: string | null | undefined): { name: string; color: string } {
  if (iconValue && iconValue.includes("|")) {
    const [name, color] = iconValue.split("|");
    const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
    return { name, color: validColor };
  }
  return { name: DEFAULT_ICON_NAME, color: DEFAULT_COLOR };
}
