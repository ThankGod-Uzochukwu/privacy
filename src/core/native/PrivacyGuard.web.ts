import {unsupportedCapabilities} from './fallback';
import type {
  Capabilities,
  GuardEvent,
  GuardListener,
  MaskOptions,
  MaskSpec,
  PrivacyGuardApi,
  Rect,
} from './types';

/**
 * Web binding. Inside the Electron shell (Linux, and optionally Windows/macOS
 * for development) the preload script exposes `window.veil`. In a plain
 * browser there is no bridge, so the app still renders but enforces nothing.
 */
type Bridge = {
  invoke(channel: string, payload?: unknown): Promise<any>;
  on(channel: string, cb: (payload: any) => void): () => void;
};

// The RN tsconfig deliberately has no DOM lib, so reach the browser through globalThis.
const g = globalThis as any;
const bridge: Bridge | undefined = g.veil;

const STORAGE_KEY = 'veil.settings.v1';

function applyCssOpacity(value: number) {
  const root = g.document?.getElementById('root');
  if (root) {
    root.style.opacity = String(value);
  }
}

let cssOpacity = false;

const api: PrivacyGuardApi = {
  async getCapabilities() {
    if (!bridge) {
      return unsupportedCapabilities('web');
    }
    const caps = (await bridge.invoke('capabilities')) as Capabilities;
    cssOpacity = caps.windowOpacityMode === 'css';
    return caps;
  },
  async setCaptureProtection(enabled) {
    return bridge ? Boolean(await bridge.invoke('capture-protection', enabled)) : false;
  },
  async setShortcutBlocking(enabled) {
    return bridge ? Boolean(await bridge.invoke('shortcut-blocking', enabled)) : false;
  },
  async setAlwaysOnTop(enabled) {
    return bridge ? Boolean(await bridge.invoke('always-on-top', enabled)) : false;
  },
  async setWindowOpacity(opacity) {
    if (!bridge) {
      return false;
    }
    if (cssOpacity) {
      applyCssOpacity(opacity);
      return true;
    }
    return Boolean(await bridge.invoke('window-opacity', opacity));
  },
  async getDisplayBounds(): Promise<Rect> {
    if (!bridge) {
      return {x: 0, y: 0, width: g.screen?.width ?? 1920, height: g.screen?.height ?? 1080};
    }
    return bridge.invoke('display-bounds');
  },
  async syncMasks(masks: MaskSpec[], options: MaskOptions) {
    await bridge?.invoke('sync-masks', {masks, ...options});
  },
  async setAutoBlackout(enabled, durationMs) {
    return bridge ? Boolean(await bridge.invoke('auto-blackout', {enabled, durationMs})) : false;
  },
  async loadSettings() {
    if (bridge) {
      return (await bridge.invoke('load-settings')) ?? null;
    }
    try {
      return g.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  async saveSettings(json) {
    if (bridge) {
      await bridge.invoke('save-settings', json);
      return;
    }
    try {
      g.localStorage.setItem(STORAGE_KEY, json);
    } catch {
      /* storage can be blocked – settings simply won't persist */
    }
  },
  async windowControl(action) {
    await bridge?.invoke('window-control', action);
  },
  subscribe(listener: GuardListener) {
    if (!bridge) {
      return () => {};
    }
    const off = [
      bridge.on('blocked', e =>
        listener({type: 'blocked', combo: e.combo, at: e.at} as GuardEvent),
      ),
      bridge.on('capture-attempt', e =>
        listener({type: 'capture-attempt', combo: e.combo, at: e.at} as GuardEvent),
      ),
      bridge.on('hotkey', () => listener({type: 'hotkey', action: 'toggle-covers'} as GuardEvent)),
      bridge.on('mask-moved', e =>
        listener({type: 'mask-moved', id: e.id, rect: e.rect} as GuardEvent),
      ),
    ];
    return () => off.forEach(fn => fn());
  },
};

export default api;
