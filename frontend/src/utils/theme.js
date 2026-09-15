// Generates a 50-900 Tailwind-style shade scale from a single brand color and
// exposes it as CSS custom properties, so `bg-primary-600` etc. (see
// tailwind.config.js) reflect whatever color branding.js/VITE_APP_PRIMARY_COLOR
// is set to - no rebuild required to re-theme, just an env var or a restart.

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function mix(from, to, weight) {
  return from.map((c, i) => Math.round(c + (to[i] - c) * weight));
}

// The brand color is treated as the "600" shade (the one used for primary
// buttons); lighter/darker shades are interpolated toward white/black.
function buildShades(hex) {
  const base = hexToRgb(hex);
  const white = [255, 255, 255];
  const black = [0, 0, 0];
  return {
    50: mix(base, white, 0.95),
    100: mix(base, white, 0.90),
    200: mix(base, white, 0.75),
    300: mix(base, white, 0.60),
    400: mix(base, white, 0.35),
    500: mix(base, white, 0.15),
    600: base,
    700: mix(base, black, 0.15),
    800: mix(base, black, 0.30),
    900: mix(base, black, 0.45),
  };
}

export function applyTheme(primaryHex) {
  if (!primaryHex) return;
  const shades = buildShades(primaryHex);
  const root = document.documentElement.style;
  for (const [shade, [r, g, b]] of Object.entries(shades)) {
    root.setProperty(`--color-primary-${shade}`, `${r} ${g} ${b}`);
  }
}
