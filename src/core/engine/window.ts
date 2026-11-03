import PrivacyGuard from '../native';

/** Shrinks the window into a small always-on-top floating bar. */
export const enterHud = () =>
  PrivacyGuard.windowControl('hud').catch(e => console.warn('[veil]', e));

/** Back to the size, position and z-order the window had before `enterHud`. */
export const exitHud = () =>
  PrivacyGuard.windowControl('restore').catch(e => console.warn('[veil]', e));
