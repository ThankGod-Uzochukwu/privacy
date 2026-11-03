import {DEFAULT_SETTINGS, parseSettings, serializeSettings} from '../src/core/store/settings';

describe('parseSettings', () => {
  it('returns defaults for empty / corrupt input', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{nope')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('null')).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips valid settings', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      mode: 'cover' as const,
      peekProof: true,
      windowOpacity: 0.6,
      masks: [{id: 'a', label: 'Chat', x: 10, y: 20, width: 300, height: 200}],
    };
    expect(parseSettings(serializeSettings(s))).toEqual(s);
  });

  it('clamps opacity so the window can never become invisible', () => {
    expect(parseSettings(JSON.stringify({windowOpacity: 0})).windowOpacity).toBe(0.25);
    expect(parseSettings(JSON.stringify({windowOpacity: 9})).windowOpacity).toBe(1);
    expect(parseSettings(JSON.stringify({maskOpacity: -3})).maskOpacity).toBe(0);
  });

  it('rejects unknown modes and wrong types field by field', () => {
    const p = parseSettings(JSON.stringify({mode: 'nuke', shield: 'yes', alwaysOnTop: true}));
    expect(p.mode).toBe('shield');
    expect(p.shield).toBe(DEFAULT_SETTINGS.shield);
    expect(p.alwaysOnTop).toBe(true);
  });

  it('drops malformed masks and enforces the minimum size', () => {
    const p = parseSettings(
      JSON.stringify({
        masks: [
          {id: 'ok', x: 0, y: 0, width: 5, height: 5},
          {id: 'bad', x: 'a', y: 0, width: 5, height: 5},
          null,
          {x: 1, y: 1, width: 100, height: 100},
        ],
      }),
    );
    expect(p.masks).toHaveLength(1);
    expect(p.masks[0].width).toBe(40);
    expect(p.masks[0].height).toBe(40);
  });
});
