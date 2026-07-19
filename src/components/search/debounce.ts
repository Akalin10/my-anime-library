type TimerHandle = ReturnType<typeof setTimeout>;

type DebounceTimers = {
  set: (callback: () => void, delayMs: number) => TimerHandle;
  clear: (handle: TimerHandle) => void;
};

const defaultTimers: DebounceTimers = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle),
};

export function createDebouncedCommitter<T>(
  commit: (value: T) => void,
  delayMs: number,
  timers: DebounceTimers = defaultTimers,
) {
  let timer: TimerHandle | undefined;

  return {
    push(value: T) {
      if (timer !== undefined) {
        timers.clear(timer);
      }
      timer = timers.set(() => {
        timer = undefined;
        commit(value);
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) {
        timers.clear(timer);
        timer = undefined;
      }
    },
  };
}
