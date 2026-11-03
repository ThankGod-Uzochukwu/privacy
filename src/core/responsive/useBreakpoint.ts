import {useWindowDimensions} from 'react-native';

export type SizeClass = 'compact' | 'medium' | 'expanded';

export const BREAKPOINTS = {hud: 440, medium: 620, expanded: 960} as const;

export function sizeClassFor(width: number): SizeClass {
  if (width >= BREAKPOINTS.expanded) {
    return 'expanded';
  }
  if (width >= BREAKPOINTS.medium) {
    return 'medium';
  }
  return 'compact';
}

/**
 * Window-size classes, not device classes. This is a desktop app whose window
 * the user can freely resize (or shrink into a floating HUD), so layout
 * follows the window, never the screen.
 *
 *   hud      <  440  – floating-bar layout: just the essential controls
 *   compact  <  620  – single column, bottom tab bar
 *   medium   <  960  – single column, side rail
 *   expanded >= 960  – two columns, full sidebar
 */
export function useBreakpoint() {
  const {width, height} = useWindowDimensions();
  const size = sizeClassFor(width);
  return {
    width,
    height,
    size,
    isHud: width < BREAKPOINTS.hud,
    isCompact: size === 'compact',
    isExpanded: size === 'expanded',
    /** How many equal columns a card grid should use. */
    columns: size === 'expanded' ? 2 : 1,
  };
}
