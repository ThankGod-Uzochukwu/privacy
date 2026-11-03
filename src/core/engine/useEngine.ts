import {useEffect, useMemo} from 'react';
import PrivacyGuard from '../native';
import {actions, appStore, useApp} from '../store/appStore';
import {parseSettings, serializeSettings} from '../store/settings';
import {effectiveGuard} from './effective';
import {debounce, latestOnly} from './coalesce';

/**
 * Bridges the store and the native layer:
 *   boot      → read capabilities + persisted settings
 *   settings  → push every change to the OS (coalesced)
 *   events    → feed blocked shortcuts / moved masks back into the store
 *
 * Mount once, at the root.
 */
export function useEngine() {
  const ready = useApp(s => s.ready);
  const s = useApp(st => st.settings);

  // Per-setting senders: each keeps at most one native call in flight.
  const send = useMemo(
    () => ({
      protect: latestOnly((v: boolean) => PrivacyGuard.setCaptureProtection(v)),
      shortcuts: latestOnly((v: boolean) => PrivacyGuard.setShortcutBlocking(v)),
      onTop: latestOnly((v: boolean) => PrivacyGuard.setAlwaysOnTop(v)),
      opacity: latestOnly((v: number) => PrivacyGuard.setWindowOpacity(v)),
      masks: latestOnly((v: Parameters<typeof PrivacyGuard.syncMasks>) =>
        PrivacyGuard.syncMasks(...v),
      ),
      blackout: latestOnly((v: {enabled: boolean; ms: number}) =>
        PrivacyGuard.setAutoBlackout(v.enabled, v.ms),
      ),
    }),
    [],
  );

  const persist = useMemo(
    () =>
      debounce((json: string) => {
        PrivacyGuard.saveSettings(json).catch(e => console.warn('[veil] save failed', e));
      }, 400),
    [],
  );

  // ---- boot ----
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [caps, bounds, stored] = await Promise.all([
          PrivacyGuard.getCapabilities(),
          PrivacyGuard.getDisplayBounds(),
          PrivacyGuard.loadSettings(),
        ]);
        if (!alive) {
          return;
        }
        actions.setCapabilities(caps);
        actions.setBounds(bounds);
        actions.hydrate(parseSettings(stored));
      } catch (e) {
        console.warn('[veil] boot failed', e);
        actions.hydrate(parseSettings(null));
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- native → store ----
  useEffect(
    () =>
      PrivacyGuard.subscribe(e => {
        if (e.type === 'mask-moved') {
          actions.updateMask(e.id, e.rect);
        } else if (e.type === 'hotkey') {
          actions.toggleCovers();
        } else {
          actions.record(e.type, e.combo, e.at);
        }
      }),
    [],
  );

  // ---- store → native ----
  // Everything the OS must do is derived in one place (effective.ts), so the
  // two modes can never disagree with each other.
  const eff = useMemo(() => effectiveGuard(s), [s]);

  useEffect(() => {
    if (ready) {
      send.protect(eff.captureProtection);
    }
  }, [ready, eff.captureProtection, send]);

  useEffect(() => {
    if (ready) {
      send.shortcuts(eff.shortcutBlocking);
    }
  }, [ready, eff.shortcutBlocking, send]);

  useEffect(() => {
    if (ready) {
      send.onTop(s.alwaysOnTop);
    }
  }, [ready, s.alwaysOnTop, send]);

  useEffect(() => {
    if (ready) {
      send.opacity(s.windowOpacity);
    }
  }, [ready, s.windowOpacity, send]);

  useEffect(() => {
    if (ready) {
      send.masks([eff.masks, {opacity: eff.masksOpacity, locked: eff.masksLocked}]);
    }
  }, [ready, eff.masks, eff.masksOpacity, eff.masksLocked, send]);

  useEffect(() => {
    if (ready) {
      send.blackout({enabled: eff.autoBlackout, ms: eff.blackoutMs});
    }
  }, [ready, eff.autoBlackout, eff.blackoutMs, send]);

  // ---- persistence ----
  useEffect(() => {
    if (ready) {
      persist(serializeSettings(appStore.get().settings));
    }
  }, [ready, s, persist]);
}
