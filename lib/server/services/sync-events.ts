import { createPrefixedId } from "@/lib/server/ids";
import { SyncEventModel } from "@/lib/server/models/sync-event";

export type SyncEventType =
  | "queued"
  | "claimed"
  | "attempt_started"
  | "attempt_failed"
  | "succeeded"
  | "dead_lettered"
  | "requeued"
  | "replayed";

export type WriteSyncEventInput = {
  entityId: string;
  entityType: "candidate" | "batch" | "enrollment";
  eventType: SyncEventType;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
  syncJobId?: string | null;
};

export async function writeSyncEvent(input: WriteSyncEventInput) {
  try {
    await SyncEventModel.create({
      entityId: input.entityId,
      entityType: input.entityType,
      eventType: input.eventType,
      metadata: input.metadata ?? {},
      requestId: input.requestId ?? null,
      syncEventId: createPrefixedId("synevt"),
      syncJobId: input.syncJobId ?? null,
    });
  } catch (error) {
    console.error("[sync-event] failed to write event", error);
  }
}
