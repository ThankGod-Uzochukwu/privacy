import {snapValue} from '../src/components/DragSlider';
import {debounce, latestOnly} from '../src/core/engine/coalesce';

describe('snapValue (slider maths)', () => {
  it('clamps to the range', () => {
    expect(snapValue(-1, 0, 1, 0.01)).toBe(0);
    expect(snapValue(5, 0, 1, 0.01)).toBe(1);
    expect(snapValue(0.1, 0.25, 1, 0.01)).toBe(0.25);
  });

  it('snaps to the step grid anchored at min, without float noise', () => {
    expect(snapValue(0.304, 0, 1, 0.01)).toBe(0.3);
    expect(snapValue(0.3049999, 0, 1, 0.01)).toBe(0.3);
    expect(snapValue(0.26, 0.25, 1, 0.05)).toBe(0.25);
    expect(snapValue(0.28, 0.25, 1, 0.05)).toBe(0.3);
  });

  it('works with a zero step (free)', () => {
    expect(snapValue(0.123456789, 0, 1, 0)).toBe(0.123457);
  });
});

describe('latestOnly – keeps drags from flooding native calls', () => {
  it('runs one call at a time and finishes on the most recent value', async () => {
    const seen: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const send = latestOnly(async (v: number) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 5));
      seen.push(v);
      inFlight--;
    });

    // 50 rapid updates, like dragging a slider.
    const all = Array.from({length: 50}, (_, i) => send(i / 50));
    await Promise.all(all);
    await new Promise(r => setTimeout(r, 30));

    expect(maxInFlight).toBe(1);
    expect(seen[seen.length - 1]).toBeCloseTo(49 / 50);
    expect(seen.length).toBeLessThan(10); // stale intermediates were dropped
  });

  it('survives a failing call and keeps serving later values', async () => {
    const errors: unknown[] = [];
    const seen: number[] = [];
    const send = latestOnly(
      async (v: number) => {
        if (v === 1) {
          throw new Error('boom');
        }
        seen.push(v);
      },
      e => errors.push(e),
    );
    await send(1);
    await send(2);
    expect(errors).toHaveLength(1);
    expect(seen).toEqual([2]);
  });
});

describe('debounce', () => {
  it('fires once with the last arguments', async () => {
    const calls: string[] = [];
    const d = debounce((s: string) => calls.push(s), 10);
    d('a');
    d('b');
    d('c');
    await new Promise(r => setTimeout(r, 30));
    expect(calls).toEqual(['c']);
  });

  it('can be cancelled', async () => {
    const fn = jest.fn();
    const d = debounce(fn, 10);
    d();
    d.cancel();
    await new Promise(r => setTimeout(r, 30));
    expect(fn).not.toHaveBeenCalled();
  });
});
