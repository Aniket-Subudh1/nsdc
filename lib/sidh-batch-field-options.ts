export const SIDH_BATCH_FIELD_OPTIONS = {
  assessmentMode: ["Self"],
  batchType: ["Regular"],
  categoryType: ["Fee Based"],
  createdSource: ["Created for NSDC Academy Partners"],
  feePaidBy: ["Self-Paid"],
} as const;

export type SidhBatchFieldSelection = {
  assessmentMode: string;
  batchType: string;
  categoryType: string;
  createdSource: string;
  feePaidBy: string;
  tpId: string;
};

export type SidhProgramBatchDefaults = {
  assessmentMode?: string | null;
  batchCategoryType?: string | null;
  batchType?: string | null;
  createdSource?: string | null;
  feePaidBy?: string | null;
};

export type SidhSchemeBatchDefaults = {
  assessmentMode?: string | null;
  batchCategoryType?: string | null;
  batchType?: string | null;
  createdSource?: string | null;
  feePaidBy?: string | null;
  fundingType?: string | null;
};

export function resolveSidhBatchFieldSelection(input: {
  batch?: Partial<SidhBatchFieldSelection> | null;
  configuredTpId?: string | null;
  defaults?: Partial<SidhBatchFieldSelection>;
  program?: SidhProgramBatchDefaults | null;
  scheme?: SidhSchemeBatchDefaults | null;
}): SidhBatchFieldSelection {
  const fallback = input.defaults ?? {};

  return {
    assessmentMode:
      input.batch?.assessmentMode?.trim() ||
      input.program?.assessmentMode?.trim() ||
      input.scheme?.assessmentMode?.trim() ||
      fallback.assessmentMode ||
      SIDH_BATCH_FIELD_OPTIONS.assessmentMode[0],
    batchType:
      input.batch?.batchType?.trim() ||
      input.program?.batchType?.trim() ||
      input.scheme?.batchType?.trim() ||
      fallback.batchType ||
      SIDH_BATCH_FIELD_OPTIONS.batchType[0],
    categoryType:
      input.batch?.categoryType?.trim() ||
      input.program?.batchCategoryType?.trim() ||
      input.scheme?.batchCategoryType?.trim() ||
      fallback.categoryType ||
      SIDH_BATCH_FIELD_OPTIONS.categoryType[0],
    createdSource:
      input.batch?.createdSource?.trim() ||
      input.program?.createdSource?.trim() ||
      input.scheme?.createdSource?.trim() ||
      fallback.createdSource ||
      SIDH_BATCH_FIELD_OPTIONS.createdSource[0],
    feePaidBy:
      input.batch?.feePaidBy?.trim() ||
      input.program?.feePaidBy?.trim() ||
      input.scheme?.feePaidBy?.trim() ||
      input.scheme?.fundingType?.trim() ||
      fallback.feePaidBy ||
      SIDH_BATCH_FIELD_OPTIONS.feePaidBy[0],
    tpId: input.batch?.tpId?.trim() || input.configuredTpId?.trim() || fallback.tpId || "",
  };
}

export function buildSidhEnumSeeds() {
  return [
    ...SIDH_BATCH_FIELD_OPTIONS.assessmentMode.map((label, index) => ({
      category: "sidh_assessment_mode",
      code: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label,
      sortOrder: index + 1,
    })),
    ...SIDH_BATCH_FIELD_OPTIONS.batchType.map((label, index) => ({
      category: "sidh_batch_type",
      code: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label,
      sortOrder: index + 1,
    })),
    ...SIDH_BATCH_FIELD_OPTIONS.categoryType.map((label, index) => ({
      category: "sidh_batch_category",
      code: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label,
      sortOrder: index + 1,
    })),
    ...SIDH_BATCH_FIELD_OPTIONS.feePaidBy.map((label, index) => ({
      category: "sidh_fee_paid_by",
      code: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label,
      sortOrder: index + 1,
    })),
    ...SIDH_BATCH_FIELD_OPTIONS.createdSource.map((label, index) => ({
      category: "sidh_created_source",
      code: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label,
      sortOrder: index + 1,
    })),
  ];
}
