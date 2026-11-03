/**
 * Serialises async calls and drops stale intermediate values.
 *
 * Dragging a slider fires dozens of updates per second. Native calls are
 * async, so naïvely awaiting each one would queue them up and the window
 * would lag behind the thumb. This keeps at most one call in flight and
 * always finishes on the most recent value.
 */
export function latestOnly<T>(
  fn: (value: T) => Promise<unknown>,
  onError: (error: unknown) => void = e => console.warn('[veil]', e),
): (value: T) => Promise<void> {
  let running = false;
  let pending: {value: T} | null = null;

  return async (value: T) => {
    pending = {value};
    if (running) {
      return;
    }
    running = true;
    try {
      while (pending) {
        const {value: next} = pending;
        pending = null;
        try {
          await fn(next);
        } catch (e) {
          onError(e);
        }
      }
    } finally {
      running = false;
    }
  };
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const run = (...args: A) => {
    if (t) {
      clearTimeout(t);
    }
    t = setTimeout(() => {
      t = undefined;
      fn(...args);
    }, ms);
  };
  run.cancel = () => {
    if (t) {
      clearTimeout(t);
      t = undefined;
    }
  };
  return run;
}
