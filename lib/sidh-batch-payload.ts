import { SIDH_BATCH_DEFAULTS } from "@/lib/server/sidh-defaults";
import { formatSidhInstant, formatSidhMidnight } from "@/lib/server/sidh-payload";
import {
  resolveSidhBatchFieldSelection,
  type SidhBatchFieldSelection,
  type SidhProgramBatchDefaults,
  type SidhSchemeBatchDefaults,
} from "@/lib/sidh-batch-field-options";

export type SidhBatchPayloadSource = {
  assessmentDate?: Date | string | null;
  batchName: string;
  batchSize: number;
  candidateCount?: number;
  configuredTpId?: string | null;
  course: {
    sidhCourseId: string;
    trainingPerDayHours?: number | null;
  };
  endDate: Date | string;
  endTime?: string | null;
  fee?: number | null;
  options?: Partial<SidhBatchFieldSelection> | null;
  program?: ({
    name?: string | null;
    skillingCategoryId?: number | null;
    skillingCategoryName?: string | null;
    skillingCategoryScheme?: string | null;
  } & SidhProgramBatchDefaults) | null;
  scheme: SidhSchemeBatchDefaults & {
    sidhSchemeId?: string | null;
    sidhSchemeReferenceId?: string | null;
    sidhSchemeType?: string | null;
  };
  startDate: Date | string;
  startTime?: string | null;
  tcId?: string | null;
};

export function calculateBatchEndDate(startDate: string, totalHours: number, trainingHoursPerDay: number) {
  const hoursPerDay = Math.max(1, trainingHoursPerDay);
  const trainingDays = Math.max(1, Math.ceil(Math.max(1, totalHours) / hoursPerDay));
  const start = new Date(`${startDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() + trainingDays - 1);
  return start.toISOString().slice(0, 10);
}

export function buildSidhBatchPayload(source: SidhBatchPayloadSource) {
  const assessmentDate = source.assessmentDate ?? source.endDate;
  const batchStartDate = formatSidhMidnight(source.startDate);
  const batchEndDate = formatSidhMidnight(source.endDate);
  const assessmentStartDate = formatSidhMidnight(assessmentDate);
  const assessmentEndDate = assessmentStartDate;
  const batchStartTime = formatSidhInstant(source.startDate, source.startTime, "09:00");
  const batchEndTime = formatSidhInstant(source.endDate, source.endTime, "17:00");
  const fields = resolveSidhBatchFieldSelection({
    batch: source.options,
    configuredTpId: source.configuredTpId,
    defaults: {
      assessmentMode: SIDH_BATCH_DEFAULTS.assessmentMode,
      batchType: SIDH_BATCH_DEFAULTS.batchType,
      categoryType: SIDH_BATCH_DEFAULTS.type,
      createdSource: SIDH_BATCH_DEFAULTS.createdSource,
      feePaidBy: SIDH_BATCH_DEFAULTS.feePaidBy,
    },
    program: source.program,
    scheme: source.scheme,
  });

  const skillingCategoryId = source.program?.skillingCategoryId ?? SIDH_BATCH_DEFAULTS.skillingCategoryId;
  const skillingCategoryName =
    source.program?.skillingCategoryName?.trim() ||
    source.program?.name?.trim() ||
    SIDH_BATCH_DEFAULTS.skillingCategoryName;
  const skillingCategoryScheme = source.program?.skillingCategoryScheme?.trim() || SIDH_BATCH_DEFAULTS.scheme;

  return {
    batchName: source.batchName,
    size: Math.min(source.batchSize, 80),
    batchStartDate,
    batchEndDate,
    courseId: source.course.sidhCourseId,
    trainingHoursPerDay: source.course.trainingPerDayHours ?? 8,
    batchStartTime,
    batchEndTime,
    batchFee: {
      totalFees: source.fee ?? 0,
    },
    feePaidBy: fields.feePaidBy,
    assessmentStartDate,
    assessmentEndDate,
    assessmentMode: fields.assessmentMode,
    batchType: fields.batchType,
    type: fields.categoryType,
    skillingcategory: {
      name: skillingCategoryName,
      id: skillingCategoryId,
      scheme: skillingCategoryScheme,
    },
    schemeId: source.scheme.sidhSchemeId ?? SIDH_BATCH_DEFAULTS.schemeId,
    schemeReferenceId: source.scheme.sidhSchemeReferenceId ?? SIDH_BATCH_DEFAULTS.schemeReferenceId,
    schemeType: source.scheme.sidhSchemeType ?? SIDH_BATCH_DEFAULTS.schemeType,
    tcId: source.tcId?.trim() ?? "",
    tpId: fields.tpId,
    createdSource: fields.createdSource,
  };
}

export function resolveBatchSchemeId(
  courseSchemeIds: string[],
  schemes: Array<{
    schemeId: string;
    sidhSchemeId?: string | null;
    sidhSchemeReferenceId?: string | null;
    syncEnabled?: boolean;
  }>,
) {
  const isSidhReadyScheme = (scheme: (typeof schemes)[number]) =>
    Boolean(scheme.syncEnabled && scheme.sidhSchemeId && scheme.sidhSchemeReferenceId);

  const linkedSchemeId = courseSchemeIds.find((schemeId) =>
    schemes.some((scheme) => scheme.schemeId === schemeId && isSidhReadyScheme(scheme)),
  );

  if (linkedSchemeId) {
    return linkedSchemeId;
  }

  return schemes.find((scheme) => isSidhReadyScheme(scheme))?.schemeId ?? null;
}

export { resolveSidhBatchFieldSelection, type SidhBatchFieldSelection, type SidhProgramBatchDefaults, type SidhSchemeBatchDefaults };
