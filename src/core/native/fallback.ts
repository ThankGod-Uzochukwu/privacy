import type {Capabilities, PlatformId} from './types';

/** Used when no native module is present (unit tests, plain browser preview). */
export function unsupportedCapabilities(platform: PlatformId): Capabilities {
  return {
    platform,
    captureProtection: 'none',
    shortcutBlocking: 'none',
    maskWindows: false,
    autoBlackout: false,
    windowOpacity: false,
    alwaysOnTop: false,
    customChrome: false,
    globalHotkey: false,
    notes: [
      'No native privacy module is available here, so nothing can be enforced. Run the desktop build to enable protection.',
    ],
  };
}
