import type {Capabilities, Rect} from '../native/types';
import {createStore, useStore} from './store';
import {DEFAULT_SETTINGS, MIN_MASK_SIZE, type Mask, type Mode, type Settings} from './settings';

export type LogEntry = {
  id: string;
  kind: 'blocked' | 'capture-attempt';
  combo: string;
  at: number;
};

export type AppState = {
  /** false until persisted settings have been read – prevents a flash of defaults. */
  ready: boolean;
  settings: Settings;
  capabilities: Capabilities | null;
  bounds: Rect;
  log: LogEntry[];
  /** Lifetime-of-session counters shown on the dashboard. */
  blockedCount: number;
  attemptCount: number;
};

const MAX_LOG = 50;

export const appStore = createStore<AppState>({
  ready: false,
  settings: DEFAULT_SETTINGS,
  capabilities: null,
  bounds: {x: 0, y: 0, width: 1920, height: 1080},
  log: [],
  blockedCount: 0,
  attemptCount: 0,
});

export function useApp<S>(selector: (s: AppState) => S): S {
  return useStore(appStore, selector);
}

/* ---------------------------------- actions --------------------------------- */

export const actions = {
  hydrate(settings: Settings) {
    appStore.set(s => ({...s, settings, ready: true}));
  },

  setCapabilities(capabilities: Capabilities) {
    appStore.set(s => ({...s, capabilities}));
  },

  setBounds(bounds: Rect) {
    appStore.set(s => ({...s, bounds}));
  },

  patch(patch: Partial<Settings>) {
    appStore.set(s => ({...s, settings: {...s.settings, ...patch}}));
  },

  setMode(mode: Mode) {
    appStore.set(s => (s.settings.mode === mode ? s : {...s, settings: {...s.settings, mode}}));
  },

  /**
   * Global hotkey / quick action: from Shield mode it jumps straight into
   * Cover mode with the covers on; inside Cover mode it flips them on/off.
   */
  toggleCovers() {
    appStore.set(s => {
      const cur = s.settings;
      const next =
        cur.mode === 'cover'
          ? {...cur, peekProof: !cur.peekProof}
          : {...cur, mode: 'cover' as Mode, peekProof: true};
      return {...s, settings: next};
    });
  },

  addMask(label?: unknown) {
    appStore.set(s => {
      const {bounds, settings} = s;
      const width = Math.round(Math.min(480, bounds.width * 0.3));
      const height = Math.round(Math.min(280, bounds.height * 0.25));
      // Cascade new masks so they never stack exactly on top of each other.
      const n = settings.masks.length;
      const mask: Mask = {
        id: `mask-${Date.now().toString(36)}-${n}`,
        label: typeof label === 'string' && label ? label : `Region ${n + 1}`,
        x: Math.round(bounds.x + (bounds.width - width) / 2 + (n % 6) * 36),
        y: Math.round(bounds.y + (bounds.height - height) / 2 + (n % 6) * 36),
        width,
        height,
      };
      return {...s, settings: {...settings, peekProof: true, masks: [...settings.masks, mask]}};
    });
  },

  updateMask(id: string, rect: Partial<Rect>) {
    appStore.set(s => {
      let changed = false;
      const masks = s.settings.masks.map(m => {
        if (m.id !== id) {
          return m;
        }
        const next = {...m, ...rect};
        next.width = Math.max(MIN_MASK_SIZE, next.width);
        next.height = Math.max(MIN_MASK_SIZE, next.height);
        if (
          next.x === m.x &&
          next.y === m.y &&
          next.width === m.width &&
          next.height === m.height
        ) {
          return m;
        }
        changed = true;
        return next;
      });
      return changed ? {...s, settings: {...s.settings, masks}} : s;
    });
  },

  removeMask(id: string) {
    appStore.set(s => ({
      ...s,
      settings: {...s.settings, masks: s.settings.masks.filter(m => m.id !== id)},
    }));
  },

  clearMasks() {
    appStore.set(s => ({...s, settings: {...s.settings, masks: []}}));
  },

  record(kind: LogEntry['kind'], combo: string, at: number) {
    appStore.set(s => {
      const entry: LogEntry = {id: `${at}-${s.log.length}-${combo}`, kind, combo, at};
      return {
        ...s,
        log: [entry, ...s.log].slice(0, MAX_LOG),
        blockedCount: s.blockedCount + (kind === 'blocked' ? 1 : 0),
        attemptCount: s.attemptCount + (kind === 'capture-attempt' ? 1 : 0),
      };
    });
  },

  clearLog() {
    appStore.set(s => ({...s, log: [], blockedCount: 0, attemptCount: 0}));
  },
};
