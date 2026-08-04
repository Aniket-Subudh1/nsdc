const BACKOFF_STEPS_MS = [5_000, 15_000, 60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

export function calculateBackoffDelayMs(attemptNumber: number): number {
  const index = Math.min(Math.max(attemptNumber - 1, 0), BACKOFF_STEPS_MS.length - 1);
  const base = BACKOFF_STEPS_MS[index] ?? BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1]!;
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(1_000, Math.round(base + jitter));
}

export function calculateNextRunAt(attemptNumber: number, now: Date): Date {
  return new Date(now.getTime() + calculateBackoffDelayMs(attemptNumber));
}
