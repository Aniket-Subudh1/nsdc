export async function runConcurrentPool<T>(count: number, concurrency: number, worker: () => Promise<T | null>): Promise<T[]> {
  const results: T[] = [];

  if (count <= 0) {
    return results;
  }

  let remaining = count;
  let stopped = false;

  async function runOne() {
    while (!stopped && remaining > 0) {
      remaining -= 1;
      const result = await worker();

      if (result === null) {
        stopped = true;
        return;
      }

      results.push(result);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, count));
  await Promise.all(Array.from({ length: workerCount }, () => runOne()));

  return results;
}
