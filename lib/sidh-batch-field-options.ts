export const SIDH_BATCH_FIELD_OPTIONS = {
  assessmentMode: ["Self"],
  batchType: ["Regular"],
  categoryType: ["Fee Based"],
  createdSource: ["Created for NSDC Academy Partners"],
  feePaidBy: ["Self-Paid"],
} as const;

export type SidhBatchFieldKey = keyof typeof SIDH_BATCH_FIELD_OPTIONS;

export const SIDH_BATCH_ENUM_CATEGORIES = {
  assessmentMode: "sidh_assessment_mode",
  batchType: "sidh_batch_type",
  categoryType: "sidh_batch_category",
  createdSource: "sidh_created_source",
  feePaidBy: "sidh_fee_paid_by",
} as const satisfies Record<SidhBatchFieldKey, string>;

export type SidhBatchEnumCategory = (typeof SIDH_BATCH_ENUM_CATEGORIES)[SidhBatchFieldKey];

export type SidhBatchReferenceOption = {
  code: string;
  label: string;
  referenceValueId: string;
  sortOrder: number;
};

export type SidhBatchFieldOptionsMap = Record<SidhBatchFieldKey, string[]>;

export type SidhBatchFieldOptionsResponse = Record<
  SidhBatchFieldKey,
  {
    category: SidhBatchEnumCategory;
    options: SidhBatchReferenceOption[];
  }
>;

type EnumLike = Record<string, Array<{ code: string; label: string }>> | null | undefined;

export function deriveSidhBatchReferenceCode(label: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "option";
}

function resolveCategoryLabels(
  enums: EnumLike,
  category: SidhBatchEnumCategory,
  fallback: readonly string[],
): string[] {
  const labels = enums?.[category]?.map((option) => option.label.trim()).filter(Boolean) ?? [];

  if (labels.length > 0) {
    return labels;
  }

  return [...fallback];
}

export function resolveSidhBatchFieldOptions(enums?: EnumLike): SidhBatchFieldOptionsMap {
  return {
    assessmentMode: resolveCategoryLabels(
      enums,
      SIDH_BATCH_ENUM_CATEGORIES.assessmentMode,
      SIDH_BATCH_FIELD_OPTIONS.assessmentMode,
    ),
    batchType: resolveCategoryLabels(enums, SIDH_BATCH_ENUM_CATEGORIES.batchType, SIDH_BATCH_FIELD_OPTIONS.batchType),
    categoryType: resolveCategoryLabels(
      enums,
      SIDH_BATCH_ENUM_CATEGORIES.categoryType,
      SIDH_BATCH_FIELD_OPTIONS.categoryType,
    ),
    createdSource: resolveCategoryLabels(
      enums,
      SIDH_BATCH_ENUM_CATEGORIES.createdSource,
      SIDH_BATCH_FIELD_OPTIONS.createdSource,
    ),
    feePaidBy: resolveCategoryLabels(enums, SIDH_BATCH_ENUM_CATEGORIES.feePaidBy, SIDH_BATCH_FIELD_OPTIONS.feePaidBy),
  };
}

export function getSidhBatchFieldDefault(
  field: SidhBatchFieldKey,
  enums?: EnumLike,
  currentValue?: string | null,
) {
  const options = resolveSidhBatchFieldOptions(enums)[field];
  const normalizedCurrent = currentValue?.trim();

  if (normalizedCurrent && options.includes(normalizedCurrent)) {
    return normalizedCurrent;
  }

  return options[0] ?? SIDH_BATCH_FIELD_OPTIONS[field][0];
}

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
