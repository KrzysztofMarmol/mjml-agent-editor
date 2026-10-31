/**
 * Passes the agent turn to a canvas that is ready only some time after it mounts.
 *
 * A turn can already be running by then: the chat re-attaches to one when the visitor comes
 * back mid-turn. Applied only on later changes, that turn left the canvas editable.
 */
export function createTurnFollower() {
  let running = false;
  let apply: ((on: boolean) => unknown) | null = null;
  return {
    turn(on: boolean) {
      if (on === running) return;
      running = on;
      apply?.(on);
    },
    /** A turn already under way is applied at once; none means nothing to apply. */
    ready(fn: (on: boolean) => unknown) {
      apply = fn;
      if (running) fn(true);
    },
  };
}
