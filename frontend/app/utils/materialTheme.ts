// Material 3 / Material You Dynamic Theme Engine
// Provides full M3 tonal palettes, dominant color extraction, and CSS variable injection.

export interface ThemeColors {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  
  outline: string;
  outlineVariant: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  
  // Custom YouTube/Media specifics
  brandRed: string;
  ambientGlow: string;
  scrim: string;
}

export type ThemeMode = 'dark' | 'light' | 'amoled';

export interface ThemePreset {
  id: string;
  name: string;
  seedColor: string;
  type: 'dynamic' | 'preset';
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'dynamic', name: 'Material You (Dynamic)', seedColor: '#3880ff', type: 'dynamic' },
  { id: 'youtube-red', name: 'YouTube Crimson', seedColor: '#ff0033', type: 'preset' },
  { id: 'sapphire-blue', name: 'Sapphire Blue', seedColor: '#2979ff', type: 'preset' },
  { id: 'emerald-green', name: 'Emerald Wave', seedColor: '#00c853', type: 'preset' },
  { id: 'amethyst-purple', name: 'Amethyst Glow', seedColor: '#9c27b0', type: 'preset' },
  { id: 'amber-sunset', name: 'Sunset Amber', seedColor: '#ff9100', type: 'preset' },
  { id: 'catppuccin', name: 'Catppuccin Mocha', seedColor: '#cba6f7', type: 'preset' },
  { id: 'nord', name: 'Nordic Frost', seedColor: '#88c0d0', type: 'preset' },
  { id: 'cyberpunk', name: 'Cyber Neon', seedColor: '#f72585', type: 'preset' },
];

// Helper: Hex to RGB
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map(x => x + x).join('');
  }
  const num = parseInt(c, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

// Helper: RGB to Hex
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Helper: RGB to HSL
export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

// Helper: HSL to RGB
export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  h /= 360;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
}

// Generate M3 Tonal Palettes from a seed color
export function generateMaterial3Theme(seedHex: string, mode: ThemeMode = 'dark'): ThemeColors {
  const rgb = hexToRgb(seedHex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hue = hsl.h;
  const sat = Math.max(0.3, Math.min(hsl.s, 0.85));

  // Tones helper: generates color with fixed tone (lightness %)
  const tone = (h: number, s: number, lightnessPct: number) => {
    const { r, g, b } = hslToRgb(h, s, lightnessPct / 100);
    return rgbToHex(r, g, b);
  };

  const isDark = mode === 'dark' || mode === 'amoled';
  const isAmoled = mode === 'amoled';

  if (isDark) {
    const bgBase = isAmoled ? '#000000' : tone(hue, 0.08, 6);
    const surfaceBase = isAmoled ? '#080808' : tone(hue, 0.10, 9);
    
    return {
      primary: tone(hue, sat, 80),
      onPrimary: tone(hue, sat, 20),
      primaryContainer: tone(hue, sat * 0.9, 30),
      onPrimaryContainer: tone(hue, sat, 90),

      secondary: tone((hue + 25) % 360, sat * 0.6, 75),
      onSecondary: tone((hue + 25) % 360, sat * 0.6, 20),
      secondaryContainer: tone((hue + 25) % 360, sat * 0.5, 28),
      onSecondaryContainer: tone((hue + 25) % 360, sat * 0.6, 88),

      tertiary: tone((hue + 60) % 360, sat * 0.7, 78),
      onTertiary: tone((hue + 60) % 360, sat * 0.7, 20),
      tertiaryContainer: tone((hue + 60) % 360, sat * 0.6, 26),
      onTertiaryContainer: tone((hue + 60) % 360, sat * 0.7, 88),

      surface: surfaceBase,
      onSurface: '#e6e1e5',
      surfaceVariant: isAmoled ? '#121212' : tone(hue, 0.12, 16),
      onSurfaceVariant: '#cac4d0',

      surfaceContainerLowest: isAmoled ? '#000000' : tone(hue, 0.08, 4),
      surfaceContainerLow: isAmoled ? '#050505' : tone(hue, 0.09, 8),
      surfaceContainer: isAmoled ? '#0c0c0c' : tone(hue, 0.10, 12),
      surfaceContainerHigh: isAmoled ? '#141414' : tone(hue, 0.12, 16),
      surfaceContainerHighest: isAmoled ? '#1c1c1c' : tone(hue, 0.14, 21),

      outline: tone(hue, 0.12, 45),
      outlineVariant: isAmoled ? '#242424' : tone(hue, 0.10, 24),
      inverseSurface: '#e6e1e5',
      inverseOnSurface: '#313033',
      inversePrimary: tone(hue, sat, 40),

      brandRed: '#ff334b',
      ambientGlow: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.28)`,
      scrim: 'rgba(0, 0, 0, 0.85)',
    };
  } else {
    // Light Mode
    return {
      primary: tone(hue, sat, 40),
      onPrimary: '#ffffff',
      primaryContainer: tone(hue, sat * 0.7, 90),
      onPrimaryContainer: tone(hue, sat, 10),

      secondary: tone((hue + 25) % 360, sat * 0.5, 42),
      onSecondary: '#ffffff',
      secondaryContainer: tone((hue + 25) % 360, sat * 0.4, 90),
      onSecondaryContainer: tone((hue + 25) % 360, sat * 0.5, 12),

      tertiary: tone((hue + 60) % 360, sat * 0.6, 38),
      onTertiary: '#ffffff',
      tertiaryContainer: tone((hue + 60) % 360, sat * 0.5, 88),
      onTertiaryContainer: tone((hue + 60) % 360, sat * 0.6, 10),

      surface: '#fef7ff',
      onSurface: '#1d1b20',
      surfaceVariant: '#e7e0ec',
      onSurfaceVariant: '#49454f',

      surfaceContainerLowest: '#ffffff',
      surfaceContainerLow: '#f7f2fa',
      surfaceContainer: '#f3edf7',
      surfaceContainerHigh: '#ece6f0',
      surfaceContainerHighest: '#e6e0e9',

      outline: '#79747e',
      outlineVariant: '#cac4d0',
      inverseSurface: '#313033',
      inverseOnSurface: '#f4eff4',
      inversePrimary: tone(hue, sat, 80),

      brandRed: '#d91b2b',
      ambientGlow: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
      scrim: 'rgba(0, 0, 0, 0.4)',
    };
  }
}

// Apply CSS variables to root
export function applyMaterial3Theme(colors: ThemeColors, mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Set M3 Design Tokens
  root.style.setProperty('--md-sys-color-primary', colors.primary);
  root.style.setProperty('--md-sys-color-on-primary', colors.onPrimary);
  root.style.setProperty('--md-sys-color-primary-container', colors.primaryContainer);
  root.style.setProperty('--md-sys-color-on-primary-container', colors.onPrimaryContainer);

  root.style.setProperty('--md-sys-color-secondary', colors.secondary);
  root.style.setProperty('--md-sys-color-on-secondary', colors.onSecondary);
  root.style.setProperty('--md-sys-color-secondary-container', colors.secondaryContainer);
  root.style.setProperty('--md-sys-color-on-secondary-container', colors.onSecondaryContainer);

  root.style.setProperty('--md-sys-color-tertiary', colors.tertiary);
  root.style.setProperty('--md-sys-color-on-tertiary', colors.onTertiary);
  root.style.setProperty('--md-sys-color-tertiary-container', colors.tertiaryContainer);
  root.style.setProperty('--md-sys-color-on-tertiary-container', colors.onTertiaryContainer);

  root.style.setProperty('--md-sys-color-surface', colors.surface);
  root.style.setProperty('--md-sys-color-on-surface', colors.onSurface);
  root.style.setProperty('--md-sys-color-surface-variant', colors.surfaceVariant);
  root.style.setProperty('--md-sys-color-on-surface-variant', colors.onSurfaceVariant);

  root.style.setProperty('--md-sys-color-surface-container-lowest', colors.surfaceContainerLowest);
  root.style.setProperty('--md-sys-color-surface-container-low', colors.surfaceContainerLow);
  root.style.setProperty('--md-sys-color-surface-container', colors.surfaceContainer);
  root.style.setProperty('--md-sys-color-surface-container-high', colors.surfaceContainerHigh);
  root.style.setProperty('--md-sys-color-surface-container-highest', colors.surfaceContainerHighest);

  root.style.setProperty('--md-sys-color-outline', colors.outline);
  root.style.setProperty('--md-sys-color-outline-variant', colors.outlineVariant);
  root.style.setProperty('--md-sys-color-inverse-surface', colors.inverseSurface);
  root.style.setProperty('--md-sys-color-inverse-on-surface', colors.inverseOnSurface);
  root.style.setProperty('--md-sys-color-inverse-primary', colors.inversePrimary);

  // Core background & text mapping
  root.style.setProperty('--yt-background', colors.surfaceContainerLowest);
  root.style.setProperty('--yt-surface', colors.surfaceContainer);
  root.style.setProperty('--yt-hover', colors.surfaceContainerHigh);
  root.style.setProperty('--yt-active', colors.surfaceContainerHighest);
  root.style.setProperty('--yt-border', colors.outlineVariant);
  root.style.setProperty('--yt-text-primary', colors.onSurface);
  root.style.setProperty('--yt-text-secondary', colors.onSurfaceVariant);
  root.style.setProperty('--yt-brand-red', colors.brandRed);
  root.style.setProperty('--yt-blue', colors.primary);
  root.style.setProperty('--ambient-glow', colors.ambientGlow);

  root.setAttribute('data-theme', mode);
}

// Extract dominant color from image URL using offscreen canvas
export async function extractDominantColor(imageUrl: string): Promise<string> {
  if (typeof window === 'undefined') return '#3880ff';

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.referrerPolicy = 'no-referrer';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('#3880ff');
          return;
        }

        canvas.width = 32;
        canvas.height = 32;
        ctx.drawImage(img, 0, 0, 32, 32);

        const data = ctx.getImageData(0, 0, 32, 32).data;
        let rTotal = 0, gTotal = 0, bTotal = 0, count = 0;

        for (let i = 0; i < data.length; i += 16) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a < 128) continue;
          const brightness = (r * 299 + g * 587 + b * 114) / 1000;
          if (brightness < 30 || brightness > 230) continue;

          rTotal += r;
          gTotal += g;
          bTotal += b;
          count++;
        }

        if (count > 0) {
          resolve(rgbToHex(rTotal / count, gTotal / count, bTotal / count));
        } else {
          resolve('#3880ff');
        }
      } catch (e) {
        resolve('#3880ff');
      }
    };

    img.onerror = () => {
      resolve('#3880ff');
    };

    img.src = imageUrl;
  });
}
