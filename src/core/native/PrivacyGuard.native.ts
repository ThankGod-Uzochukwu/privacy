import {DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {NATIVE_EVENTS, NATIVE_MODULE_NAME} from './constants';
import {unsupportedCapabilities} from './fallback';
import type {
  Capabilities,
  GuardEvent,
  GuardListener,
  MaskOptions,
  MaskSpec,
  PlatformId,
  PrivacyGuardApi,
  Rect,
  WindowAction,
} from './types';

/**
 * Windows + macOS binding. Both native modules export the exact same method
 * names (see types.ts), so this file is platform-agnostic.
 */
type Raw = {
  getCapabilities(): Promise<Capabilities>;
  setCaptureProtection(enabled: boolean): Promise<boolean>;
  setShortcutBlocking(enabled: boolean): Promise<boolean>;
  setAlwaysOnTop(enabled: boolean): Promise<boolean>;
  setWindowOpacity(opacity: number): Promise<boolean>;
  getDisplayBounds(): Promise<Rect>;
  syncMasks(masks: MaskSpec[], opacity: number, locked: boolean): Promise<void>;
  setAutoBlackout(enabled: boolean, durationMs: number): Promise<boolean>;
  loadSettings(): Promise<string | null>;
  saveSettings(json: string): Promise<void>;
  windowControl(action: WindowAction): Promise<void>;
};

const raw: Raw | undefined = NativeModules[NATIVE_MODULE_NAME];

const platform: PlatformId =
  (Platform.OS as string) === 'macos'
    ? 'macos'
    : (Platform.OS as string) === 'windows'
    ? 'windows'
    : 'unknown';

// RCTEventEmitter on macOS only delivers events to subscribed NativeEventEmitters;
// the Windows module emits straight onto RCTDeviceEventEmitter.
const emitter =
  raw && platform === 'macos' ? new NativeEventEmitter(raw as never) : DeviceEventEmitter;

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

function toRect(p: any): Rect {
  return {
    x: num(p?.x),
    y: num(p?.y),
    width: num(p?.width),
    height: num(p?.height),
  };
}

const api: PrivacyGuardApi = {
  async getCapabilities() {
    if (!raw) {
      return unsupportedCapabilities(platform);
    }
    return raw.getCapabilities();
  },
  async setCaptureProtection(enabled) {
    return raw ? raw.setCaptureProtection(enabled) : false;
  },
  async setShortcutBlocking(enabled) {
    return raw ? raw.setShortcutBlocking(enabled) : false;
  },
  async setAlwaysOnTop(enabled) {
    return raw ? raw.setAlwaysOnTop(enabled) : false;
  },
  async setWindowOpacity(opacity) {
    return raw ? raw.setWindowOpacity(opacity) : false;
  },
  async getDisplayBounds() {
    if (!raw) {
      return {x: 0, y: 0, width: 1920, height: 1080};
    }
    return toRect(await raw.getDisplayBounds());
  },
  async syncMasks(masks: MaskSpec[], options: MaskOptions) {
    await raw?.syncMasks(masks, options.opacity, options.locked);
  },
  async setAutoBlackout(enabled, durationMs) {
    return raw ? raw.setAutoBlackout(enabled, durationMs) : false;
  },
  async loadSettings() {
    return raw ? raw.loadSettings() : null;
  },
  async saveSettings(json) {
    await raw?.saveSettings(json);
  },
  async windowControl(action) {
    await raw?.windowControl(action);
  },
  subscribe(listener: GuardListener) {
    const subs = [
      emitter.addListener(NATIVE_EVENTS.blocked, (e: any) =>
        listener({
          type: 'blocked',
          combo: String(e?.combo ?? ''),
          at: num(e?.at, Date.now()),
        } as GuardEvent),
      ),
      emitter.addListener(NATIVE_EVENTS.captureAttempt, (e: any) =>
        listener({
          type: 'capture-attempt',
          combo: String(e?.combo ?? ''),
          at: num(e?.at, Date.now()),
        } as GuardEvent),
      ),
      emitter.addListener(NATIVE_EVENTS.hotkey, () =>
        listener({type: 'hotkey', action: 'toggle-covers'} as GuardEvent),
      ),
      emitter.addListener(NATIVE_EVENTS.maskMoved, (e: any) =>
        listener({
          type: 'mask-moved',
          id: String(e?.id ?? ''),
          rect: toRect(e),
        } as GuardEvent),
      ),
    ];
    return () => subs.forEach(s => s.remove());
  },
};

export default api;
