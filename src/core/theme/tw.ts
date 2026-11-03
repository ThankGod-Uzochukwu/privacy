import {Platform} from 'react-native';
import {create} from 'twrnc';

/**
 * Veil's design tokens as a standard Tailwind config. Every component styles itself with real
 * Tailwind class names (`bg-veil-surface`, `rounded-2xl`, `text-heading`, …) resolved by twrnc into
 * style objects at runtime – no Babel plugin or Metro setup, so it behaves identically on React
 * Native Windows (Fabric), React Native macOS (legacy) and react-native-web (Linux/Electron).
 */
export const palette = {
  bg: '#07080D',
  surface: '#0D1017',
  raised: '#131824',
  hover: '#182030',
  border: '#1C2332',
  line: '#2A3450',
  text: '#EEF1F8',
  muted: '#98A2BA',
  faint: '#5E6880',
  accent: '#7C6CFF',
  'accent-hover': '#8E80FF',
  cyan: '#22D3EE',
  success: '#34D399',
  warn: '#FBBF24',
  danger: '#F87171',
  black: '#000000',
} as const;

// Native renderers take a single family name, not a CSS fallback list.
const sans = Platform.select({
  windows: 'Segoe UI',
  macos: 'System',
  default:
    'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}) as string;

const mono = Platform.select({
  windows: 'Consolas',
  macos: 'Menlo',
  default: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
}) as string;

export const tailwindConfig = {
  theme: {
    extend: {
      colors: {veil: palette},
      fontFamily: {sans: [sans], mono: [mono]},
      fontSize: {
        display: '30px',
        title: '20px',
        heading: '15px',
        body: '13.5px',
        small: '12px',
        overline: '10.5px',
      },
      borderRadius: {xxl: '22px'},
      minWidth: {0: '0px'},
      maxWidth: {content: '1120px'},
    },
  },
};

export const tw = create(tailwindConfig as never);
