// Small galaxy palette so each album card could get a distinct, on-theme
// cover gradient (used if/when the picker renders CardSwap-style covers)
// instead of every card looking the same.
export const PLAYLIST_GRADIENTS = [
  "linear-gradient(135deg, #8b6ff5, #22d3ee)",
  "linear-gradient(135deg, #e879f9, #8b6ff5)",
  "linear-gradient(135deg, #22d3ee, #60a5fa)",
  "linear-gradient(135deg, #f472b6, #8b6ff5)",
  "linear-gradient(135deg, #60a5fa, #22d3ee)",
];

export function gradientForIndex(i: number) {
  return PLAYLIST_GRADIENTS[i % PLAYLIST_GRADIENTS.length];
}
