export const NATIVE_MODULE_NAME = 'VeilPrivacyGuard';

/** Event names emitted by the native layers (kept identical on every OS). */
export const NATIVE_EVENTS = {
  blocked: 'veilBlocked',
  captureAttempt: 'veilCaptureAttempt',
  maskMoved: 'veilMaskMoved',
  hotkey: 'veilHotkey',
} as const;

/** Global hotkey that toggles the covers, as shown to the user. */
export const HOTKEY_LABEL = {
  windows: 'Ctrl + Alt + Shift + B',
  macos: '⌃ ⌥ ⌘ B',
  linux: 'Ctrl + Alt + Shift + B',
  web: 'Ctrl + Alt + Shift + B',
  unknown: 'Ctrl + Alt + Shift + B',
} as const;

export const MIN_WINDOW_OPACITY = 0.25;
export const DEFAULT_BLACKOUT_MS = 3000;
