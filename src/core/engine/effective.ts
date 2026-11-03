import type {MaskSpec} from '../native/types';
import type {Settings} from '../store/settings';

/**
 * What the OS layer should actually be doing, derived from the user's
 * settings. This is the single place that encodes the two-in-one behaviour:
 *
 *   shield – the app is un-capturable: window excluded from capture and
 *            capture shortcuts swallowed. No covers are shown.
 *   cover  – screenshots are *allowed* (shortcuts are never blocked) and the
 *            draggable covers float over every app, so they appear in the
 *            capture and hide what's underneath. Only the control panel is
 *            kept out of the picture.
 */
export type EffectiveGuard = {
  captureProtection: boolean;
  shortcutBlocking: boolean;
  masks: MaskSpec[];
  masksOpacity: number;
  masksLocked: boolean;
  autoBlackout: boolean;
  blackoutMs: number;
};

/** Stable reference so "no masks" never looks like a change to React effects. */
const NO_MASKS: MaskSpec[] = [];

export function effectiveGuard(s: Settings): EffectiveGuard {
  if (s.mode === 'shield') {
    return {
      captureProtection: s.shield && s.hideFromCapture,
      shortcutBlocking: s.shield && s.blockShortcuts,
      masks: NO_MASKS,
      masksOpacity: s.maskOpacity,
      masksLocked: s.masksLocked,
      autoBlackout: false,
      blackoutMs: s.blackoutMs,
    };
  }
  return {
    captureProtection: s.hidePanelInCover,
    shortcutBlocking: false,
    masks: s.peekProof ? s.masks : NO_MASKS,
    masksOpacity: s.maskOpacity,
    masksLocked: s.masksLocked,
    autoBlackout: s.peekProof && s.autoBlackout,
    blackoutMs: s.blackoutMs,
  };
}
