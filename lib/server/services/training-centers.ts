import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { UserModel } from "@/lib/server/models/user";
import {
  canManageTrainingCenters,
  getPermissionsForRoles,
} from "@/lib/server/rbac";
import { writeAuditLog } from "@/lib/server/services/audit";
import { type AuthSession } from "@/lib/server/services/session";

type CreateTrainingCenterInput = {
  centerCode: string;
  centerName: string;
  district: string;
  programIds: string[];
  requestId?: string;
  sidhTcId?: string;
  state: string;
  status: "active" | "inactive";
};

function serializeTrainingCenter(center: {
  centerCode: string;
  centerId: string;
  centerName: string;
  createdAt?: Date;
  district: string;
  programIds?: string[];
  sidhTcId?: string | null;
  state: string;
  status: "active" | "inactive";
  updatedAt?: Date;
}) {
  return {
    id: center.centerId,
    centerId: center.centerId,
    centerName: center.centerName,
    centerCode: center.centerCode,
    sidhTcId: center.sidhTcId ?? null,
    district: center.district,
    state: center.state,
    programIds: center.programIds ?? [],
    status: center.status,
    createdAt: center.createdAt?.toISOString() ?? null,
    updatedAt: center.updatedAt?.toISOString() ?? null,
  };
}

function ensureCanReadCenters(actor: AuthSession) {
  if (!getPermissionsForRoles(actor.user.roles).includes("centers:read")) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to training centers");
  }
}

function ensureCanWriteCenters(actor: AuthSession) {
  if (!canManageTrainingCenters(actor.user.roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have access to manage training centers");
  }
}

function getScopedCenterFilter(actor: AuthSession) {
  if (actor.user.roles.includes("platform_admin")) {
    return {};
  }

  return { centerId: { $in: actor.user.centerIds } };
}

export async function listTrainingCenters(actor: AuthSession, page: number, pageSize: number) {
  await connectToDatabase();
  ensureCanReadCenters(actor);

  const filter = getScopedCenterFilter(actor);
  const [items, total] = await Promise.all([
    TrainingCenterModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize),
    TrainingCenterModel.countDocuments(filter),
  ]);

  return {
    items: items.map((item) => serializeTrainingCenter(item)),
    total,
    page,
    pageSize,
  };
}

export async function createTrainingCenter(actor: AuthSession, input: CreateTrainingCenterInput) {
  await connectToDatabase();
  ensureCanWriteCenters(actor);

  const existingCenter = await TrainingCenterModel.findOne({
    $or: [{ centerCode: input.centerCode.trim() }, { centerName: input.centerName.trim() }],
  });

  if (existingCenter) {
    throw new ApiError(409, "CENTER_EXISTS", "A training center with this code or name already exists");
  }

  const center = await TrainingCenterModel.create({
    centerId: createPrefixedId("tc"),
    centerName: input.centerName.trim(),
    centerCode: input.centerCode.trim(),
    sidhTcId: input.sidhTcId?.trim() || null,
    district: input.district.trim(),
    state: input.state.trim(),
    programIds: input.programIds,
    status: input.status,
    createdByUserId: actor.user.id,
  });

  if (!actor.user.roles.includes("platform_admin")) {
    await UserModel.updateOne(
      { userId: actor.user.id },
      { $addToSet: { centerIds: center.centerId } },
    );
  }

  await writeAuditLog({
    action: "masters.training_center.created",
    actorUserId: actor.user.id,
    entityId: center.centerId,
    entityType: "training_center",
    metadata: { centerCode: center.centerCode },
    requestId: input.requestId,
  });

  return serializeTrainingCenter(center);
}