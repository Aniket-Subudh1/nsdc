import { createPrefixedId } from "@/lib/server/ids";
import { AuditLogModel } from "@/lib/server/models/audit-log";

type WriteAuditLogInput = {
  action: string;
  actorUserId?: string | null;
  entityId?: string | null;
  entityType: string;
  ipAddress?: string | null;
  metadata?: Record<string, unknown>;
  requestId?: string | null;
};

export async function writeAuditLog(input: WriteAuditLogInput) {
  await AuditLogModel.create({
    auditLogId: createPrefixedId("audit"),
    action: input.action,
    actorUserId: input.actorUserId ?? null,
    entityId: input.entityId ?? null,
    entityType: input.entityType,
    ipAddress: input.ipAddress ?? null,
    metadata: input.metadata ?? {},
    requestId: input.requestId ?? null,
  });
}