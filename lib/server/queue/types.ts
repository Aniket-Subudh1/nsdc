
export type ClaimAndProcess = () => Promise<boolean>;

export interface QueueWorkerHandle {
  close(): Promise<void>;
}

export interface QueueWorkerOptions {
  concurrency: number;
  pollIntervalMs: number;
}

export interface QueueDriver {
  readonly kind: "redis" | "mongo";
  notify(queueName: string): Promise<void>;
  runWorker(queueName: string, claimAndProcess: ClaimAndProcess, options: QueueWorkerOptions): QueueWorkerHandle;
  close(): Promise<void>;
}
