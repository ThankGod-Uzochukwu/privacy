import {actions, appStore} from '../src/core/store/appStore';
import {DEFAULT_SETTINGS} from '../src/core/store/settings';
import {clampMove, clampResize, mapScale} from '../src/features/peekproof/geometry';
import {computeProtections, headline} from '../src/features/dashboard/status';
import type {Capabilities} from '../src/core/native/types';

const bounds = {x: 0, y: 0, width: 1920, height: 1080};

const full: Capabilities = {
  platform: 'windows',
  captureProtection: 'full',
  shortcutBlocking: 'full',
  maskWindows: true,
  autoBlackout: true,
  windowOpacity: true,
  alwaysOnTop: true,
  customChrome: false,
  globalHotkey: true,
  notes: [],
};

beforeEach(() => {
  appStore.set(s => ({
    ...s,
    settings: DEFAULT_SETTINGS,
    bounds,
    log: [],
    blockedCount: 0,
    attemptCount: 0,
  }));
});

describe('mask actions', () => {
  it('adds cascading masks inside the screen', () => {
    actions.addMask();
    actions.addMask();
    const {masks} = appStore.get().settings;
    expect(masks).toHaveLength(2);
    expect(masks[0].id).not.toBe(masks[1].id);
    expect(masks[1].x).toBeGreaterThan(masks[0].x);
    for (const m of masks) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width).toBeLessThanOrEqual(bounds.width);
      expect(m.y + m.height).toBeLessThanOrEqual(bounds.height);
    }
  });

  it('ignores a non-string label (a press event must never become the label)', () => {
    actions.addMask({nativeEvent: {}} as unknown);
    expect(appStore.get().settings.masks[0].label).toBe('Region 1');
  });

  it('updateMask enforces the minimum size and is a no-op for identical rects', () => {
    actions.addMask();
    const m = appStore.get().settings.masks[0];
    actions.updateMask(m.id, {width: 1, height: 1});
    const after = appStore.get().settings.masks[0];
    expect(after.width).toBe(40);

    const before = appStore.get();
    actions.updateMask(m.id, {x: after.x}); // unchanged
    expect(appStore.get()).toBe(before);
  });

  it('removeMask / clearMasks', () => {
    actions.addMask();
    actions.addMask();
    const [a] = appStore.get().settings.masks;
    actions.removeMask(a.id);
    expect(appStore.get().settings.masks).toHaveLength(1);
    actions.clearMasks();
    expect(appStore.get().settings.masks).toHaveLength(0);
  });
});

describe('mode actions', () => {
  it('toggleCovers from Shield jumps into Cover mode with covers on', () => {
    actions.toggleCovers();
    const s = appStore.get().settings;
    expect(s.mode).toBe('cover');
    expect(s.peekProof).toBe(true);
  });

  it('toggleCovers inside Cover mode flips covers on/off', () => {
    actions.setMode('cover');
    actions.patch({peekProof: true});
    actions.toggleCovers();
    expect(appStore.get().settings.peekProof).toBe(false);
    actions.toggleCovers();
    expect(appStore.get().settings.peekProof).toBe(true);
  });
});

describe('activity log', () => {
  it('counts blocked vs detected and caps the history', () => {
    for (let i = 0; i < 60; i++) {
      actions.record('blocked', 'PrintScreen', i);
    }
    actions.record('capture-attempt', 'Win+Shift+S', 100);
    const s = appStore.get();
    expect(s.blockedCount).toBe(60);
    expect(s.attemptCount).toBe(1);
    expect(s.log).toHaveLength(50);
    expect(s.log[0].combo).toBe('Win+Shift+S');
  });
});

describe('screen-map geometry', () => {
  it('scales to fit the container and the max height', () => {
    expect(mapScale(960, bounds)).toBeCloseTo(0.5);
    expect(mapScale(960, bounds, 270)).toBeCloseTo(0.25);
    expect(mapScale(0, bounds)).toBe(0);
  });

  it('clampMove keeps the rect on screen', () => {
    const r = {x: 0, y: 0, width: 400, height: 300};
    expect(clampMove({...r, x: -50, y: -9}, bounds)).toMatchObject({x: 0, y: 0});
    expect(clampMove({...r, x: 5000, y: 5000}, bounds)).toMatchObject({x: 1520, y: 780});
  });

  it('clampResize respects the minimum and the screen edge', () => {
    const r = {x: 1800, y: 1000, width: 100, height: 60};
    expect(clampResize(r, 500, 500, bounds)).toMatchObject({width: 120, height: 80});
    expect(clampResize(r, -500, -500, bounds)).toMatchObject({width: 40, height: 40});
  });
});

describe('status / headline', () => {
  it('Shield mode with everything on is secure', () => {
    expect(headline(DEFAULT_SETTINGS, full)).toBe('secure');
  });

  it('Shield mode off is exposed; one feature missing is partial', () => {
    expect(headline({...DEFAULT_SETTINGS, shield: false}, full)).toBe('exposed');
    expect(headline(DEFAULT_SETTINGS, {...full, shortcutBlocking: 'none'})).toBe('secure');
    expect(headline({...DEFAULT_SETTINGS, blockShortcuts: false}, full)).toBe('partial');
  });

  it('platform that can do nothing is never reported as protected', () => {
    const none: Capabilities = {...full, captureProtection: 'none', shortcutBlocking: 'none'};
    expect(headline(DEFAULT_SETTINGS, none)).toBe('exposed');
  });

  it('partial OS support is reported as partial, not secure', () => {
    expect(headline(DEFAULT_SETTINGS, {...full, captureProtection: 'partial'})).toBe('partial');
  });

  it('Cover mode: ready until a cover exists and is switched on', () => {
    const cover = {...DEFAULT_SETTINGS, mode: 'cover' as const};
    expect(headline(cover, full)).toBe('ready');
    const m = {id: 'a', label: 'a', x: 0, y: 0, width: 100, height: 100};
    expect(headline({...cover, masks: [m], peekProof: false}, full)).toBe('ready');
    expect(headline({...cover, masks: [m], peekProof: true}, full)).toBe('covering');
    expect(headline(cover, {...full, maskWindows: false})).toBe('unsupported');
  });

  it('Cover mode lists screenshots as allowed', () => {
    const rows = computeProtections({...DEFAULT_SETTINGS, mode: 'cover'}, full);
    expect(rows.find(r => r.key === 'screenshots')?.state).toBe('active');
    expect(rows.find(r => r.key === 'shortcuts')).toBeUndefined();
  });
});
