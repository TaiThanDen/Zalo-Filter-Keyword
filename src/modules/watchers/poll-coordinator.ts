export type WatcherPollRequestReason = 'mutation' | 'safety';

export type WatcherPollCoordinatorMetrics = {
  requests: number;
  mutationRequests: number;
  safetyRequests: number;
  timerSchedules: number;
  timerReschedules: number;
  coalescedRequests: number;
  inFlightCoalescedRequests: number;
  runsStarted: number;
  runsCompleted: number;
  runsFailed: number;
  maxQueueDelayMs: number;
  lastRunStartedAtMs: number | null;
};

type TimerHandle = ReturnType<typeof setTimeout>;

type WatcherPollCoordinatorOptions = {
  minimumIntervalMs: number;
  trailingDebounceMs: number;
  trailingMaxWaitMs: number;
  run: () => Promise<void>;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
};

export class WatcherPollCoordinator {
  private readonly minimumIntervalMs: number;
  private readonly trailingDebounceMs: number;
  private readonly trailingMaxWaitMs: number;
  private readonly run: () => Promise<void>;
  private readonly now: () => number;
  private readonly setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  private readonly clearTimer: (timer: TimerHandle) => void;
  private timer: TimerHandle | null = null;
  private timerDueAtMs: number | null = null;
  private mutationFirstRequestedAtMs: number | null = null;
  private mutationLastRequestedAtMs: number | null = null;
  private safetyDueAtMs: number | null = null;
  private oldestPendingRequestAtMs: number | null = null;
  private inFlight = false;
  private cancelled = false;
  private metrics: WatcherPollCoordinatorMetrics = {
    requests: 0,
    mutationRequests: 0,
    safetyRequests: 0,
    timerSchedules: 0,
    timerReschedules: 0,
    coalescedRequests: 0,
    inFlightCoalescedRequests: 0,
    runsStarted: 0,
    runsCompleted: 0,
    runsFailed: 0,
    maxQueueDelayMs: 0,
    lastRunStartedAtMs: null,
  };

  constructor(options: WatcherPollCoordinatorOptions) {
    if (options.trailingMaxWaitMs < options.minimumIntervalMs) {
      throw new Error('watcher_poll_trailing_max_wait_must_cover_minimum_interval');
    }

    if (options.trailingMaxWaitMs < options.trailingDebounceMs) {
      throw new Error('watcher_poll_trailing_max_wait_must_cover_debounce');
    }

    this.minimumIntervalMs = options.minimumIntervalMs;
    this.trailingDebounceMs = options.trailingDebounceMs;
    this.trailingMaxWaitMs = options.trailingMaxWaitMs;
    this.run = options.run;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  request(reason: WatcherPollRequestReason, delayMs: number) {
    if (this.cancelled) {
      return;
    }

    const now = this.now();
    this.metrics.requests += 1;
    this.oldestPendingRequestAtMs = Math.min(this.oldestPendingRequestAtMs ?? now, now);

    if (reason === 'mutation') {
      this.metrics.mutationRequests += 1;
      if (this.mutationFirstRequestedAtMs !== null) {
        this.metrics.coalescedRequests += 1;
      }
      this.mutationFirstRequestedAtMs ??= now;
      this.mutationLastRequestedAtMs = now;
    } else {
      this.metrics.safetyRequests += 1;
      const requestedDueAtMs = now + Math.max(0, delayMs);
      if (this.safetyDueAtMs !== null) {
        this.metrics.coalescedRequests += 1;
      }
      this.safetyDueAtMs = Math.min(this.safetyDueAtMs ?? requestedDueAtMs, requestedDueAtMs);
    }

    if (this.inFlight) {
      this.metrics.inFlightCoalescedRequests += 1;
      return;
    }

    this.schedulePending();
  }

  cancel() {
    this.cancelled = true;
    if (this.timer) {
      this.clearTimer(this.timer);
    }
    this.timer = null;
    this.timerDueAtMs = null;
    this.clearPendingRequests();
  }

  getMetrics(): WatcherPollCoordinatorMetrics {
    return { ...this.metrics };
  }

  private resolveMutationDueAtMs() {
    if (this.mutationFirstRequestedAtMs === null || this.mutationLastRequestedAtMs === null) {
      return null;
    }

    const minimumDueAtMs = (this.metrics.lastRunStartedAtMs ?? Number.NEGATIVE_INFINITY) + this.minimumIntervalMs;
    const debouncedDueAtMs = this.mutationLastRequestedAtMs + this.trailingDebounceMs;
    const maximumDueAtMs = this.mutationFirstRequestedAtMs + this.trailingMaxWaitMs;
    return Math.min(Math.max(minimumDueAtMs, debouncedDueAtMs), maximumDueAtMs);
  }

  private schedulePending() {
    const mutationDueAtMs = this.resolveMutationDueAtMs();
    const candidates = [mutationDueAtMs, this.safetyDueAtMs].filter((value): value is number => value !== null);
    if (candidates.length === 0) {
      return;
    }

    const dueAtMs = Math.min(...candidates);
    if (this.timer && this.timerDueAtMs === dueAtMs) {
      return;
    }

    if (this.timer) {
      this.clearTimer(this.timer);
      this.metrics.timerReschedules += 1;
    }

    this.timerDueAtMs = dueAtMs;
    this.metrics.timerSchedules += 1;
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.timerDueAtMs = null;
      void this.executePending();
    }, Math.max(0, dueAtMs - this.now()));
  }

  private async executePending() {
    if (this.cancelled || this.inFlight) {
      return;
    }

    const startedAtMs = this.now();
    const oldestPendingRequestAtMs = this.oldestPendingRequestAtMs;
    this.clearPendingRequests();
    this.inFlight = true;
    this.metrics.runsStarted += 1;
    this.metrics.lastRunStartedAtMs = startedAtMs;
    if (oldestPendingRequestAtMs !== null) {
      this.metrics.maxQueueDelayMs = Math.max(this.metrics.maxQueueDelayMs, startedAtMs - oldestPendingRequestAtMs);
    }

    try {
      await this.run();
      this.metrics.runsCompleted += 1;
    } catch {
      this.metrics.runsFailed += 1;
    } finally {
      this.inFlight = false;
      if (!this.cancelled) {
        this.schedulePending();
      }
    }
  }

  private clearPendingRequests() {
    this.mutationFirstRequestedAtMs = null;
    this.mutationLastRequestedAtMs = null;
    this.safetyDueAtMs = null;
    this.oldestPendingRequestAtMs = null;
  }
}
