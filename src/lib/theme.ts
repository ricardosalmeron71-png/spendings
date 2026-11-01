import { useColorScheme } from 'react-native';

const palette = {
  primary: '#6C5CE7',
  primaryDark: '#5A4BD1',
  accent: '#00C2A8',
  income: '#1DB173',
  expense: '#F0506E',
  warning: '#FFA928',
  info: '#2E90FA',
};

export const lightColors = {
  ...palette,
  bg: '#F5F6FB',
  card: '#FFFFFF',
  cardAlt: '#F0F1F8',
  text: '#121428',
  textMuted: '#6B6F86',
  border: '#E4E6F0',
  tabBar: '#FFFFFF',
  inputBg: '#F0F1F8',
  overlay: 'rgba(18,20,40,0.45)',
  gradient: ['#7B6CF6', '#5A4BD1'] as readonly [string, string],
};

export const darkColors: typeof lightColors = {
  ...palette,
  primary: '#8A7DFF',
  bg: '#0D0F1A',
  card: '#171A2B',
  cardAlt: '#1F2338',
  text: '#F2F3FA',
  textMuted: '#9599B3',
  border: '#272B44',
  tabBar: '#131627',
  inputBg: '#1F2338',
  overlay: 'rgba(0,0,0,0.6)',
  gradient: ['#6C5CE7', '#3B2FA8'] as readonly [string, string],
};

export type Colors = typeof lightColors;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}

export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const AVATAR_COLORS = ['#6C5CE7', '#00C2A8', '#F0506E', '#FFA928', '#2E90FA', '#1DB173', '#E056FD', '#FF7675', '#0984E3', '#2D3436'];
export const AVATAR_EMOJIS = ['😀', '😎', '🤓', '🦊', '🐼', '🐯', '🦁', '🐸', '🐵', '🦄', '🐻', '🐨', '👩', '👨', '👧', '👦', '👶', '🧔', '👩‍🦰', '👱‍♀️', '🧑‍💻', '🦸', '🧙', '🚀'];
export const CATEGORY_COLORS = ['#6C5CE7', '#00C2A8', '#F0506E', '#FFA928', '#2E90FA', '#1DB173', '#E056FD', '#FF7675', '#5AC8FA', '#A2845E', '#8E8E93', '#FFD60A'];
export const CATEGORY_ICONS = [
  'home', 'flash', 'water', 'flame', 'wifi', 'phone-portrait', 'car', 'car-sport', 'bus', 'airplane', 'cart', 'restaurant',
  'fast-food', 'cafe', 'beer', 'pizza', 'tv', 'film', 'musical-notes', 'game-controller', 'medkit', 'fitness', 'heart',
  'shirt', 'gift', 'school', 'book', 'paw', 'balloon', 'happy', 'construct', 'hammer', 'card', 'cash', 'wallet', 'briefcase',
  'trending-up', 'receipt', 'cut', 'bag-handle', 'pricetag', 'globe', 'build', 'leaf', 'umbrella', 'ellipsis-horizontal',
] as const;
