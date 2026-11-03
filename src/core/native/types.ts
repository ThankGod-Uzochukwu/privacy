/**
 * The contract between the shared React Native UI and the platform layer.
 *
 *  - Windows : C++/WinRT module   (windows/Veil/PrivacyGuard.cpp)
 *  - macOS   : Objective-C module (macos/VeilPrivacyGuard/VeilPrivacyGuard.m)
 *  - Linux   : Electron main process behind a preload bridge (electron/)
 *
 * Every platform implements the same surface, so the UI never branches on OS.
 * Anything a platform cannot do is reported through `Capabilities` and the UI
 * adapts instead of pretending.
 */

export type Rect = {x: number; y: number; width: number; height: number};

export type PlatformId = 'windows' | 'macos' | 'linux' | 'web' | 'unknown';

/** How strongly a protection is enforced on the current platform. */
export type Support = 'full' | 'partial' | 'none';

export type Capabilities = {
  platform: PlatformId;
  /** Window is excluded from screenshots / recordings made by other apps. */
  captureProtection: Support;
  /** Screenshot / recording shortcuts are swallowed while the app is focused. */
  shortcutBlocking: Support;
  /** Native always-on-top blackout windows can be created. */
  maskWindows: boolean;
  /** Masks can flash to solid black the moment a capture hotkey is seen. */
  autoBlackout: boolean;
  windowOpacity: boolean;
  /**
   * 'native' → the OS composites the window at the requested alpha.
   * 'css'    → the host window is transparent and the web layer fades itself
   *            (used where the OS has no window-opacity API, e.g. Linux).
   */
  windowOpacityMode?: 'native' | 'css';
  alwaysOnTop: boolean;
  /** The host has no title bar of its own, so the UI must draw one. */
  customChrome: boolean;
  /** A global hotkey can toggle the covers while another app is focused. */
  globalHotkey: boolean;
  /** Human readable, platform specific caveats shown in Settings. */
  notes: string[];
};

export type MaskSpec = Rect & {id: string};

export type MaskOptions = {
  /** 0..1 – how opaque masks are while idle. */
  opacity: number;
  /** Locked masks are click-through and cannot be dragged. */
  locked: boolean;
};

export type GuardEvent =
  | {type: 'blocked'; combo: string; at: number}
  | {type: 'capture-attempt'; combo: string; at: number}
  | {type: 'mask-moved'; id: string; rect: Rect}
  /** A global hotkey registered by the native layer fired (works while another app is focused). */
  | {type: 'hotkey'; action: 'toggle-covers'};

/**
 * 'hud'     – shrink into a small always-on-top floating bar
 * 'restore' – back to the size/position/z-order the window had before 'hud'
 */
export type WindowAction = 'minimize' | 'maximize' | 'close' | 'hud' | 'restore';

export type GuardListener = (event: GuardEvent) => void;

export interface PrivacyGuardApi {
  getCapabilities(): Promise<Capabilities>;
  /** Returns true when the OS accepted the request. */
  setCaptureProtection(enabled: boolean): Promise<boolean>;
  setShortcutBlocking(enabled: boolean): Promise<boolean>;
  setAlwaysOnTop(enabled: boolean): Promise<boolean>;
  setWindowOpacity(opacity: number): Promise<boolean>;
  /** Bounding box of every monitor, in the same units masks use. */
  getDisplayBounds(): Promise<Rect>;
  /** Declarative: native diffs this list against the windows it owns. */
  syncMasks(masks: MaskSpec[], options: MaskOptions): Promise<void>;
  setAutoBlackout(enabled: boolean, durationMs: number): Promise<boolean>;
  loadSettings(): Promise<string | null>;
  saveSettings(json: string): Promise<void>;
  /** Window chrome for hosts that report `customChrome`. */
  windowControl(action: WindowAction): Promise<void>;
  subscribe(listener: GuardListener): () => void;
}
