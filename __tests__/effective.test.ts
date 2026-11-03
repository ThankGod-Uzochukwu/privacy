import {effectiveGuard} from '../src/core/engine/effective';
import {DEFAULT_SETTINGS, type Settings} from '../src/core/store/settings';

const mask = {id: 'm', label: 'm', x: 0, y: 0, width: 100, height: 100};
const make = (p: Partial<Settings>): Settings => ({...DEFAULT_SETTINGS, ...p});

describe('effectiveGuard – the two-in-one behaviour', () => {
  it('Shield mode: blocks capture and shortcuts, shows no covers', () => {
    const e = effectiveGuard(make({mode: 'shield', masks: [mask], peekProof: true}));
    expect(e.captureProtection).toBe(true);
    expect(e.shortcutBlocking).toBe(true);
    expect(e.masks).toEqual([]);
    expect(e.autoBlackout).toBe(false);
  });

  it('Shield mode honours the master switch and the individual toggles', () => {
    expect(effectiveGuard(make({shield: false})).captureProtection).toBe(false);
    expect(effectiveGuard(make({shield: false})).shortcutBlocking).toBe(false);
    expect(effectiveGuard(make({hideFromCapture: false})).captureProtection).toBe(false);
    expect(effectiveGuard(make({blockShortcuts: false})).shortcutBlocking).toBe(false);
  });

  it('Cover mode: screenshots are NEVER blocked, whatever else is set', () => {
    const e = effectiveGuard(make({mode: 'cover', blockShortcuts: true, shield: true}));
    expect(e.shortcutBlocking).toBe(false);
  });

  it('Cover mode: shows covers only when activated', () => {
    expect(effectiveGuard(make({mode: 'cover', masks: [mask], peekProof: false})).masks).toEqual(
      [],
    );
    expect(effectiveGuard(make({mode: 'cover', masks: [mask], peekProof: true})).masks).toEqual([
      mask,
    ]);
  });

  it('Cover mode: control panel is hidden from the screenshot by default', () => {
    expect(effectiveGuard(make({mode: 'cover'})).captureProtection).toBe(true);
    expect(effectiveGuard(make({mode: 'cover', hidePanelInCover: false})).captureProtection).toBe(
      false,
    );
  });

  it('Cover mode: auto-blackout only while covers are on', () => {
    expect(
      effectiveGuard(make({mode: 'cover', peekProof: true, autoBlackout: true})).autoBlackout,
    ).toBe(true);
    expect(
      effectiveGuard(make({mode: 'cover', peekProof: false, autoBlackout: true})).autoBlackout,
    ).toBe(false);
  });

  it('returns a stable empty list so React effects do not re-fire', () => {
    const a = effectiveGuard(make({mode: 'shield'})).masks;
    const b = effectiveGuard(make({mode: 'shield', windowOpacity: 0.5})).masks;
    expect(a).toBe(b);
  });
});
