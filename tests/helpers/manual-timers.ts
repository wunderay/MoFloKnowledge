// Timeouts that the test fires by hand.
//
// The view guards a draft read (timing.reread) and a save's wait for a fresh view (timing.fresh) with real
// setTimeout calls. A test that shortens them to a few hundred milliseconds races its own driving time: on a
// loaded machine the timer fires before the test has finished setting the scene. `holdTimeouts` picks out the
// timers by their (otherwise unused) delay, keeps them from ever firing on their own, and lets the test fire each
// one at the exact point in the scene where it is meant to run out. Every other timer is untouched.
import { vi } from "vitest";

export interface HeldTimeout {
  readonly delay: number;
  /** True once the code under test cleared this timer (it settled before running out). */
  readonly cleared: boolean;
  /** Runs the timer's callback now, as if its delay had passed. Does nothing if it was cleared or already ran. */
  fire(): void;
}

export function holdTimeouts(delays: readonly number[]): { held: HeldTimeout[] } {
  const held: HeldTimeout[] = [];
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const byHandle = new Map<unknown, { cleared: boolean; ran: boolean }>();
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...args: unknown[]) => {
    if (ms === undefined || !delays.includes(ms)) {
      return realSet(fn, ms, ...args);
    }
    // A real timer that is never due, so that clearTimeout works on a real handle.
    const handle = realSet(() => {}, 2 ** 31 - 1);
    handle.unref?.();
    const state = { cleared: false, ran: false };
    byHandle.set(handle, state);
    held.push({
      delay: ms,
      get cleared() {
        return state.cleared;
      },
      fire() {
        if (state.cleared || state.ran) {
          return;
        }
        state.ran = true;
        fn(...(args as []));
      },
    });
    return handle;
  }) as unknown as typeof setTimeout);
  vi.spyOn(globalThis, "clearTimeout").mockImplementation(((handle?: Parameters<typeof clearTimeout>[0]) => {
    const state = byHandle.get(handle);
    if (state) {
      state.cleared = true;
    }
    realClear(handle);
  }) as typeof clearTimeout);
  return { held };
}
