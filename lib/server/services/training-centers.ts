import { ApiError } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { connectToDatabase } from "@/lib/server/mongodb";
import { ProgramModel } from "@/lib/server/models/program";
import { TrainingCenterModel } from "@/lib/server/models/training-center";
import { TrainingCenterProgramModel } from "@/lib/server/models/training-center-program";
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

type UpdateTrainingCenterInput = {
  centerCode?: string;
  centerName?: string;
  district?: string;
  programIds?: string[];
  requestId?: string;
  sidhTcId?: string;
  state?: string;
  status?: "active" | "inactive";
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

function normalizeProgramIds(programIds: string[]) {
  return [...new Set(programIds.map((programId) => programId.trim()).filter(Boolean))];
}

async function ensureActiveProgramsExist(programIds: string[]) {
  const normalizedProgramIds = normalizeProgramIds(programIds);

  if (normalizedProgramIds.length === 0) {
    throw new ApiError(400, "PROGRAM_REQUIRED", "Training center must be linked to at least one active program");
  }

  const programs = await ProgramModel.find({
    programId: { $in: normalizedProgramIds },
    status: "active",
  }).select("programId");

  if (programs.length !== normalizedProgramIds.length) {
    throw new ApiError(400, "PROGRAM_NOT_FOUND", "Training center programs must reference active programs");
  }

  return normalizedProgramIds;
}

async function syncTrainingCenterPrograms(centerId: string, programIds: string[], actorUserId: string) {
  await TrainingCenterProgramModel.deleteMany({ centerId });

  if (programIds.length === 0) {
    return;
  }

  await TrainingCenterProgramModel.insertMany(
    programIds.map((programId) => ({
      centerProgramId: createPrefixedId("tcp"),
      centerId,
      programId,
      assignedByUserId: actorUserId,
    })),
  );
}

async function getScopedCenter(actor: AuthSession, centerId: string) {
  const center = await TrainingCenterModel.findOne({ centerId, ...getScopedCenterFilter(actor) });

  if (!center) {
    throw new ApiError(404, "CENTER_NOT_FOUND", "Training center not found");
  }

  return center;
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
  const normalizedProgramIds = await ensureActiveProgramsExist(input.programIds);

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
    programIds: normalizedProgramIds,
    status: input.status,
    createdByUserId: actor.user.id,
  });

  await syncTrainingCenterPrograms(center.centerId, normalizedProgramIds, actor.user.id);

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

export async function updateTrainingCenter(
  actor: AuthSession,
  centerId: string,
  input: UpdateTrainingCenterInput,
) {
  await connectToDatabase();
  ensureCanWriteCenters(actor);

  const center = await getScopedCenter(actor, centerId);

  if (input.centerCode && input.centerCode.trim() !== center.centerCode) {
    const duplicateCenter = await TrainingCenterModel.findOne({ centerCode: input.centerCode.trim() });
    if (duplicateCenter) {
      throw new ApiError(409, "CENTER_EXISTS", "A training center with this code already exists");
    }
  }

  if (input.centerName && input.centerName.trim() !== center.centerName) {
    const duplicateCenter = await TrainingCenterModel.findOne({ centerName: input.centerName.trim() });
    if (duplicateCenter) {
      throw new ApiError(409, "CENTER_EXISTS", "A training center with this name already exists");
    }
  }

  const nextProgramIds = input.programIds
    ? await ensureActiveProgramsExist(input.programIds)
    : normalizeProgramIds(center.programIds ?? []);

  if (input.centerName !== undefined) {
    center.centerName = input.centerName.trim();
  }
  if (input.centerCode !== undefined) {
    center.centerCode = input.centerCode.trim();
  }
  if (input.sidhTcId !== undefined) {
    center.sidhTcId = input.sidhTcId.trim() || null;
  }
  if (input.district !== undefined) {
    center.district = input.district.trim();
  }
  if (input.state !== undefined) {
    center.state = input.state.trim();
  }
  if (input.status !== undefined) {
    center.status = input.status;
  }

  center.programIds = nextProgramIds;
  await center.save();
  await syncTrainingCenterPrograms(center.centerId, nextProgramIds, actor.user.id);

  await writeAuditLog({
    action: "masters.training_center.updated",
    actorUserId: actor.user.id,
    entityId: center.centerId,
    entityType: "training_center",
    metadata: input,
    requestId: input.requestId,
  });

  return serializeTrainingCenter(center);
}