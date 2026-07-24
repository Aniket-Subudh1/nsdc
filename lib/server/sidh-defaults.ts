export const SIDH_BATCH_DEFAULTS = {
  assessmentMode: "Self",
  batchType: "Regular",
  createdSource: "Created for NSDC Academy Partners",
  feePaidBy: "Self-Paid",
  scheme: "Fee Based",
  schemeId: "Scheme_2",
  schemeReferenceId: "Scheme_2",
  schemeType: "feeBased",
  skillingCategoryId: 1,
  skillingCategoryName: "NSDC Market led programme",
  type: "Fee Based",
} as const;

export const SIDH_STATUS_VALUES = {
  all: "ALL",
  approved: "Approved",
  failed: "FAILED",
  pending: "Pending",
  registered: "REGISTERED",
  success: "SUCCESS",
  unregistered: "UNREGISTERED",
} as const;

export const SIDH_MESSAGES = {
  batchCandidateUpdateDone: "Updated batch with candidate in candidate collection",
} as const;