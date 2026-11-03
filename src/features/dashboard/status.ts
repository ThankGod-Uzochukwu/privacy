import type {Capabilities, Support} from '@/core/native/types';
import type {Settings} from '@/core/store/settings';

export type ProtectionState = 'active' | 'partial' | 'off' | 'unsupported';

export type Protection = {
  key: 'capture' | 'shortcuts' | 'screenshots' | 'covers' | 'overlay';
  title: string;
  state: ProtectionState;
  detail: string;
};

function fromSupport(enabled: boolean, support: Support): ProtectionState {
  if (support === 'none') {
    return 'unsupported';
  }
  if (!enabled) {
    return 'off';
  }
  return support === 'full' ? 'active' : 'partial';
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function overlayProtection(settings: Settings, caps: Capabilities): Protection {
  const parts = [
    settings.alwaysOnTop ? 'Stays above other apps' : null,
    settings.windowOpacity < 1 ? `${Math.round(settings.windowOpacity * 100)}% opacity` : null,
  ].filter(Boolean);
  const available = caps.alwaysOnTop || caps.windowOpacity;
  const on = parts.length > 0;
  return {
    key: 'overlay',
    title: 'Floating window',
    state: !available ? 'unsupported' : on ? 'active' : 'off',
    detail: !available
      ? 'Not available on this platform.'
      : on
      ? parts.join(' · ')
      : 'Normal window behaviour.',
  };
}

/**
 * Derives what the user is *actually* protected by right now, given the mode,
 * what they switched on and what this platform can enforce. The UI never
 * claims more than the OS can deliver.
 */
export function computeProtections(settings: Settings, caps: Capabilities | null): Protection[] {
  if (!caps) {
    return [];
  }

  if (settings.mode === 'shield') {
    const capture = fromSupport(
      settings.shield && settings.hideFromCapture,
      caps.captureProtection,
    );
    const shortcuts = fromSupport(
      settings.shield && settings.blockShortcuts,
      caps.shortcutBlocking,
    );
    return [
      {
        key: 'capture',
        title: 'Hidden from capture',
        state: capture,
        detail:
          capture === 'active'
            ? 'Screenshots and recordings made by other apps do not include this window.'
            : capture === 'partial'
            ? 'Requested, but the OS only partly honours it. See Settings.'
            : capture === 'off'
            ? 'This window can be captured.'
            : 'Not available on this platform.',
      },
      {
        key: 'shortcuts',
        title: 'Capture shortcuts blocked',
        state: shortcuts,
        detail:
          shortcuts === 'active'
            ? 'Print Screen, snipping and recording hotkeys are swallowed while Veil is focused.'
            : shortcuts === 'partial'
            ? 'Only some hotkeys can be intercepted on this platform.'
            : shortcuts === 'off'
            ? 'Capture hotkeys work normally.'
            : 'Not available on this platform.',
      },
      overlayProtection(settings, caps),
    ];
  }

  // Cover mode
  const n = settings.masks.length;
  const covering = settings.peekProof && n > 0;
  const panel = fromSupport(settings.hidePanelInCover, caps.captureProtection);
  const covers: ProtectionState = !caps.maskWindows
    ? 'unsupported'
    : !settings.peekProof || n === 0
    ? 'off'
    : 'active';

  return [
    {
      key: 'covers',
      title: 'Covers',
      state: covers,
      detail:
        covers === 'active'
          ? `${plural(n, 'cover')} floating over your apps — they show up black in any screenshot.`
          : covers === 'unsupported'
          ? 'Not available on this platform.'
          : !settings.peekProof
          ? 'Covers are switched off.'
          : 'Add a cover and drag it over what you want hidden.',
    },
    {
      key: 'screenshots',
      title: 'Screenshots allowed',
      state: 'active',
      detail: covering
        ? 'Take screenshots as usual — covered areas are hidden in the result.'
        : 'Capture shortcuts work normally. Switch covers on first to hide sensitive areas.',
    },
    {
      key: 'capture',
      title: 'Control panel hidden',
      state: fromSupport(settings.hidePanelInCover, caps.captureProtection),
      detail:
        panel === 'active'
          ? 'This window stays out of your screenshots.'
          : panel === 'off'
          ? 'This window will appear in screenshots.'
          : panel === 'partial'
          ? 'Only partly honoured by this OS.'
          : 'Not available on this platform.',
    },
    overlayProtection(settings, caps),
  ];
}

export type Headline =
  | 'secure'
  | 'partial'
  | 'exposed'
  | 'covering'
  | 'ready'
  | 'unsupported'
  | 'unknown';

/** Overall headline for the hero card. */
export function headline(settings: Settings, caps: Capabilities | null): Headline {
  if (!caps) {
    return 'unknown';
  }

  if (settings.mode === 'cover') {
    if (!caps.maskWindows) {
      return 'unsupported';
    }
    return settings.peekProof && settings.masks.length > 0 ? 'covering' : 'ready';
  }

  const core = computeProtections(settings, caps).filter(
    p => p.key === 'capture' || p.key === 'shortcuts',
  );
  const usable = core.filter(p => p.state !== 'unsupported');
  if (usable.length === 0) {
    return 'exposed';
  }
  const live = usable.filter(p => p.state === 'active').length;
  if (live === usable.length) {
    return 'secure';
  }
  return live > 0 || usable.some(p => p.state === 'partial') ? 'partial' : 'exposed';
}
