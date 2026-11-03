import {MIN_WINDOW_OPACITY} from '../native/constants';
import type {Rect} from '../native/types';

export const MIN_MASK_SIZE = 40;

export type Mask = {id: string; label: string} & Rect;

export type Mode = 'shield' | 'cover';

export type Settings = {
  /**
   * shield – nobody can capture Veil (capture-excluded window, shortcuts blocked).
   * cover  – screenshots are allowed; draggable black covers float over every
   *          app so sensitive regions are hidden in whatever gets captured.
   */
  mode: Mode;
  /** Cover mode: keep the control panel itself out of screenshots. */
  hidePanelInCover: boolean;
  /** Master switch: capture exclusion + shortcut blocking. */
  shield: boolean;
  blockShortcuts: boolean;
  hideFromCapture: boolean;
  /** Keep the app above every other window, permanently. */
  alwaysOnTop: boolean;
  /** Opacity of the app window itself. */
  windowOpacity: number;
  /** Cover mode: the covers are switched on (visible over other apps). */
  peekProof: boolean;
  masks: Mask[];
  /** Idle opacity of the blackout regions. */
  maskOpacity: number;
  /** Locked masks are click-through and cannot be dragged. */
  masksLocked: boolean;
  /** Flash masks to solid black when a capture hotkey is detected. */
  autoBlackout: boolean;
  blackoutMs: number;
};

export const DEFAULT_SETTINGS: Settings = {
  mode: 'shield',
  hidePanelInCover: true,
  shield: true,
  blockShortcuts: true,
  hideFromCapture: true,
  alwaysOnTop: false,
  windowOpacity: 1,
  peekProof: false,
  masks: [],
  maskOpacity: 1,
  masksLocked: false,
  autoBlackout: true,
  blackoutMs: 3000,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

function sanitizeMask(m: any): Mask | null {
  if (!m || typeof m.id !== 'string') {
    return null;
  }
  if (![m.x, m.y, m.width, m.height].every(isNum)) {
    return null;
  }
  return {
    id: m.id,
    label: typeof m.label === 'string' ? m.label : 'Hidden region',
    x: m.x,
    y: m.y,
    width: Math.max(MIN_MASK_SIZE, m.width),
    height: Math.max(MIN_MASK_SIZE, m.height),
  };
}

/**
 * Turns whatever was persisted (possibly from an older/newer build, or
 * hand-edited) into a valid `Settings`. Never throws.
 */
export function parseSettings(json: string | null | undefined): Settings {
  if (!json) {
    return DEFAULT_SETTINGS;
  }
  let p: any;
  try {
    p = JSON.parse(json);
  } catch {
    return DEFAULT_SETTINGS;
  }
  if (!p || typeof p !== 'object') {
    return DEFAULT_SETTINGS;
  }
  const d = DEFAULT_SETTINGS;
  return {
    mode: p.mode === 'cover' || p.mode === 'shield' ? p.mode : d.mode,
    hidePanelInCover: bool(p.hidePanelInCover, d.hidePanelInCover),
    shield: bool(p.shield, d.shield),
    blockShortcuts: bool(p.blockShortcuts, d.blockShortcuts),
    hideFromCapture: bool(p.hideFromCapture, d.hideFromCapture),
    alwaysOnTop: bool(p.alwaysOnTop, d.alwaysOnTop),
    windowOpacity: isNum(p.windowOpacity)
      ? clamp(p.windowOpacity, MIN_WINDOW_OPACITY, 1)
      : d.windowOpacity,
    peekProof: bool(p.peekProof, d.peekProof),
    masks: Array.isArray(p.masks) ? (p.masks.map(sanitizeMask).filter(Boolean) as Mask[]) : d.masks,
    maskOpacity: isNum(p.maskOpacity) ? clamp(p.maskOpacity, 0, 1) : d.maskOpacity,
    masksLocked: bool(p.masksLocked, d.masksLocked),
    autoBlackout: bool(p.autoBlackout, d.autoBlackout),
    blackoutMs: isNum(p.blackoutMs) ? clamp(p.blackoutMs, 500, 30000) : d.blackoutMs,
  };
}

export function serializeSettings(s: Settings): string {
  return JSON.stringify(s);
}
