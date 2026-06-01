import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeWorkbookToArrayBuffer } from "@/lib/spreadsheet/node";

const mocks = vi.hoisted(() => ({
  attendanceRecordDeleteMany: vi.fn(),
  attendanceRecordFind: vi.fn(),
  attendanceRecordFindOne: vi.fn(),
  attendanceRecordInsertMany: vi.fn(),
  attendanceUploadCreate: vi.fn(),
  attendanceUploadFindOne: vi.fn(),
  batchCandidateAggregate: vi.fn(),
  batchCandidateCountDocuments: vi.fn(),
  batchCandidateDeleteOne: vi.fn(),
  batchCandidateFind: vi.fn(),
  batchCandidateInsertMany: vi.fn(),
  batchCandidateUpdateMany: vi.fn(),
  batchDailySessionFind: vi.fn(),
  batchDailySessionUpdateOne: vi.fn(),
  batchFind: vi.fn(),
  batchFindOne: vi.fn(),
  batchCreate: vi.fn(),
  batchCountDocuments: vi.fn(),
  batchUpdateOne: vi.fn(),
  batchSyncStateCreate: vi.fn(),
  batchSyncStateFind: vi.fn(),
  batchSyncStateFindOne: vi.fn(),
  batchSyncStateFindOneAndUpdate: vi.fn(),
  candidateFind: vi.fn(),
  candidateTrainingStatusDeleteMany: vi.fn(),
  candidateTrainingStatusFind: vi.fn(),
  candidateTrainingStatusInsertMany: vi.fn(),
  candidateUpdateOne: vi.fn(),
  connectToDatabase: vi.fn(),
  courseFindOne: vi.fn(),
  schemeFindOne: vi.fn(),
  trainingCenterFindOne: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/server/mongodb", () => ({
  connectToDatabase: mocks.connectToDatabase,
}));

vi.mock("@/lib/server/services/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/server/models/batch", () => ({
  BatchModel: {
    countDocuments: mocks.batchCountDocuments,
    create: mocks.batchCreate,
    find: mocks.batchFind,
    findOne: mocks.batchFindOne,
    updateOne: mocks.batchUpdateOne,
  },
}));

vi.mock("@/lib/server/models/batch-candidate", () => ({
  BatchCandidateModel: {
    aggregate: mocks.batchCandidateAggregate,
    countDocuments: mocks.batchCandidateCountDocuments,
    deleteOne: mocks.batchCandidateDeleteOne,
    find: mocks.batchCandidateFind,
    insertMany: mocks.batchCandidateInsertMany,
    updateMany: mocks.batchCandidateUpdateMany,
  },
}));

vi.mock("@/lib/server/models/batch-sync-state", () => ({
  BatchSyncStateModel: {
    create: mocks.batchSyncStateCreate,
    find: mocks.batchSyncStateFind,
    findOne: mocks.batchSyncStateFindOne,
    findOneAndUpdate: mocks.batchSyncStateFindOneAndUpdate,
  },
}));

vi.mock("@/lib/server/models/attendance-upload", () => ({
  AttendanceUploadModel: {
    create: mocks.attendanceUploadCreate,
    findOne: mocks.attendanceUploadFindOne,
  },
}));

vi.mock("@/lib/server/models/attendance-record", () => ({
  AttendanceRecordModel: {
    deleteMany: mocks.attendanceRecordDeleteMany,
    find: mocks.attendanceRecordFind,
    findOne: mocks.attendanceRecordFindOne,
    insertMany: mocks.attendanceRecordInsertMany,
  },
}));

vi.mock("@/lib/server/models/batch-daily-session", () => ({
  BatchDailySessionModel: {
    find: mocks.batchDailySessionFind,
    updateOne: mocks.batchDailySessionUpdateOne,
  },
}));

vi.mock("@/lib/server/models/candidate-training-status-history", () => ({
  CandidateTrainingStatusHistoryModel: {
    deleteMany: mocks.candidateTrainingStatusDeleteMany,
    find: mocks.candidateTrainingStatusFind,
    insertMany: mocks.candidateTrainingStatusInsertMany,
  },
}));

vi.mock("@/lib/server/models/candidate", () => ({
  CandidateModel: {
    find: mocks.candidateFind,
    updateOne: mocks.candidateUpdateOne,
  },
}));

vi.mock("@/lib/server/models/course", () => ({
  CourseModel: {
    findOne: mocks.courseFindOne,
  },
}));

vi.mock("@/lib/server/models/scheme", () => ({
  SchemeModel: {
    findOne: mocks.schemeFindOne,
  },
}));

vi.mock("@/lib/server/models/training-center", () => ({
  TrainingCenterModel: {
    findOne: mocks.trainingCenterFindOne,
  },
}));

import {
  createAttendanceImport,
  createBatch,
  getBatchAttendanceSummary,
  processQueuedBatchSyncJobs,
  processQueuedEnrollmentSyncJobs,
  queueEnrollmentSync,
} from "@/lib/server/services/batches";
import { SidhConnectorError } from "@/lib/server/services/sidh-connector";

function createSelectQuery<T>(value: T) {
  return {
    select: vi.fn().mockResolvedValue(value),
  };
}

function createSortQuery<T>(value: T) {
  return {
    sort: vi.fn().mockResolvedValue(value),
  };
}

async function buildWorkbook(rows: Array<Record<string, unknown>>) {
  return writeWorkbookToArrayBuffer([{ name: "Attendance", rows }]);
}

function createBatchDocument(overrides: Record<string, unknown> = {}) {
  return {
    assessmentDate: new Date("2026-02-05T00:00:00.000Z"),
    assessmentEligibilityThreshold: 70,
    allowAssessmentBeforeBatchEnd: false,
    allowCandidateOverlap: false,
    batchCode: "BAT-001",
    batchId: "bat_001",
    batchName: "Retail Batch",
    batchSize: 80,
    candidateCount: 2,
    centerId: "tc_001",
    courseId: "course_001",
    endDate: new Date("2026-02-01T00:00:00.000Z"),
    endTime: "17:00",
    fee: 500,
    save: vi.fn().mockResolvedValue(undefined),
    schemeId: "scheme_001",
    sidhBatchId: "BATCH_REMOTE_001",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    startTime: "09:00",
    status: "draft",
    syncEnabled: true,
    trainingHoursPerDay: 8,
    updatedByUserId: null,
    ...overrides,
  };
}

function createSyncState(overrides: Record<string, unknown> = {}) {
  return {
    batchId: "bat_001",
    batchSync: {
      attempts: [],
      lastJobId: "bsjob_001",
      retryCount: 0,
      status: "synced",
    },
    batchSyncStateId: "bsst_001",
    enrollmentSync: {
      attempts: [],
      lastJobId: "enjob_001",
      retryCount: 0,
      status: "not_synced",
    },
    save: vi.fn().mockResolvedValue(undefined),
    sidhBatchId: "BATCH_REMOTE_001",
    ...overrides,
  };
}

describe("batch services", () => {
  const actor = {
    permissions: [],
    sessionId: "ses_001",
    user: {
      centerIds: ["tc_001"],
      email: "admin@example.com",
      id: "usr_001",
      lastLoginAt: null,
      mobileNumber: "9876543210",
      mustChangePassword: false,
      name: "Platform Admin",
      role: "training_partner_admin",
      roles: ["training_partner_admin"],
      status: "active",
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.batchCandidateCountDocuments.mockResolvedValue(2);
    mocks.batchCandidateAggregate.mockResolvedValue([{ _id: "queued", count: 1 }]);
    mocks.batchSyncStateFind.mockResolvedValue([]);
    mocks.batchUpdateOne.mockResolvedValue(undefined);
    mocks.attendanceRecordDeleteMany.mockResolvedValue(undefined);
    mocks.attendanceRecordInsertMany.mockResolvedValue(undefined);
    mocks.batchDailySessionUpdateOne.mockResolvedValue(undefined);
    mocks.candidateTrainingStatusInsertMany.mockResolvedValue(undefined);
    mocks.candidateUpdateOne.mockResolvedValue(undefined);
    mocks.writeAuditLog.mockResolvedValue(undefined);

    mocks.trainingCenterFindOne.mockReturnValue(
      createSelectQuery({
        centerCode: "TC-001",
        centerId: "tc_001",
        centerName: "Center One",
        programIds: ["prg_001"],
        sidhTcId: "SIDH_TC_001",
        status: "active",
        verifiedForSidh: true,
      }),
    );
    mocks.schemeFindOne.mockReturnValue(
      createSelectQuery({
        beneficiaryType: "general",
        fundingType: "grant",
        name: "Scheme One",
        schemeId: "scheme_001",
        sidhSchemeId: "SIDH_SCHEME_001",
        status: "active",
        syncEnabled: true,
        validFrom: new Date("2025-01-01T00:00:00.000Z"),
        validTo: new Date("2026-12-31T00:00:00.000Z"),
      }),
    );
  });

  it("rejects invalid course validity windows during batch creation", async () => {
    mocks.batchFindOne.mockReturnValue(createSelectQuery(null));
    mocks.courseFindOne.mockReturnValue(
      createSelectQuery({
        approvalStatus: "approved",
        associatedQpOrJobRole: "Retail Sales Associate",
        courseId: "course_001",
        courseName: "Retail Course",
        minimumAge: 18,
        nsqfLevel: 4,
        programIds: ["prg_001"],
        qpCode: "QP001",
        schemeIds: ["scheme_001"],
        sidhCourseId: "SIDH_COURSE_001",
        status: "active",
        trainingHours: 240,
        validityEndDate: new Date("2026-01-15T00:00:00.000Z"),
        validityStartDate: new Date("2025-01-01T00:00:00.000Z"),
      }),
    );

    await expect(
      createBatch(actor as never, {
        assessmentDate: "2026-02-05",
        assessmentEligibilityThreshold: 70,
        allowAssessmentBeforeBatchEnd: false,
        allowCandidateOverlap: false,
        batchCode: "BAT-001",
        batchName: "Retail Batch",
        batchSize: 80,
        candidateIds: [],
        centerId: "tc_001",
        courseId: "course_001",
        endDate: "2026-02-01",
        endTime: "17:00",
        fee: 500,
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        startTime: "09:00",
        status: "draft",
        syncEnabled: true,
        trainingHoursPerDay: 8,
      }),
    ).rejects.toThrow("Selected course mapping is not valid for the requested batch dates");
  });

  it("rejects sync-enabled batch creation without an assigned center", async () => {
    await expect(
      createBatch(actor as never, {
        assessmentDate: "2026-02-05",
        assessmentEligibilityThreshold: 70,
        allowAssessmentBeforeBatchEnd: false,
        allowCandidateOverlap: false,
        batchCode: "BAT-001",
        batchName: "Retail Batch",
        batchSize: 80,
        candidateIds: [],
        centerId: "",
        courseId: "course_001",
        endDate: "2026-02-01",
        endTime: "17:00",
        fee: 500,
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        startTime: "09:00",
        status: "ready",
        syncEnabled: true,
        trainingHoursPerDay: 8,
      }),
    ).rejects.toThrow("Select a training center before enabling SIDH sync");

    expect(mocks.batchCreate).not.toHaveBeenCalled();
    expect(mocks.batchSyncStateCreate).not.toHaveBeenCalled();
  });

  it("does not create a batch when candidate assignment validation fails during creation", async () => {
    mocks.batchFindOne.mockReturnValue(createSelectQuery(null));
    mocks.courseFindOne.mockReturnValue(
      createSelectQuery({
        approvalStatus: "approved",
        associatedQpOrJobRole: "Retail Sales Associate",
        courseId: "course_001",
        courseName: "Retail Course",
        minimumAge: 18,
        nsqfLevel: 4,
        programIds: ["prg_001"],
        qpCode: "QP001",
        schemeIds: ["scheme_001"],
        sidhCourseId: "SIDH_COURSE_001",
        status: "active",
        trainingHours: 240,
        validityEndDate: new Date("2026-12-31T00:00:00.000Z"),
        validityStartDate: new Date("2025-01-01T00:00:00.000Z"),
      }),
    );
    mocks.batchCandidateFind.mockReturnValueOnce(createSelectQuery([])).mockReturnValueOnce(createSelectQuery([]));
    mocks.candidateFind.mockReturnValue(
      createSelectQuery([
        {
          candidateId: "cand_001",
          centerId: "tc_999",
          dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
          fullName: "Asha",
          mobileNumber: "9876543210",
          programId: "prg_001",
          registrationMode: "internal_registration",
          sidhCandidateId: "CAN_001",
          syncState: { status: "synced" },
          trainingStatus: "ongoing",
        },
      ]),
    );

    await expect(
      createBatch(actor as never, {
        assessmentDate: "2026-02-05",
        assessmentEligibilityThreshold: 70,
        allowAssessmentBeforeBatchEnd: false,
        allowCandidateOverlap: false,
        batchCode: "BAT-001",
        batchName: "Retail Batch",
        batchSize: 80,
        candidateIds: ["cand_001"],
        centerId: "tc_001",
        courseId: "course_001",
        endDate: "2026-02-01",
        endTime: "17:00",
        fee: 500,
        schemeId: "scheme_001",
        startDate: "2026-01-01",
        startTime: "09:00",
        status: "draft",
        syncEnabled: true,
        trainingHoursPerDay: 8,
      }),
    ).rejects.toThrow("Candidate cand_001 is assigned to a different center");

    expect(mocks.batchCreate).not.toHaveBeenCalled();
    expect(mocks.batchCandidateInsertMany).not.toHaveBeenCalled();
    expect(mocks.batchSyncStateCreate).not.toHaveBeenCalled();
  });

  it("builds SIDH batch creation payloads with default NSDC metadata", async () => {
    const batch = createBatchDocument({ sidhBatchId: null });
    const claimedState = createSyncState({
      batchSync: {
        attempts: [],
        lastJobId: "bsjob_001",
        retryCount: 0,
        status: "processing",
      },
      sidhBatchId: null,
    });

    mocks.batchSyncStateFindOneAndUpdate.mockResolvedValueOnce(claimedState).mockResolvedValueOnce(null);
    mocks.batchFindOne.mockResolvedValue(batch);
    mocks.courseFindOne.mockReturnValue(
      createSelectQuery({
        approvalStatus: "approved",
        associatedQpOrJobRole: "Retail Sales Associate",
        courseId: "course_001",
        courseName: "Retail Course",
        minimumAge: 18,
        nsqfLevel: 4,
        programIds: ["prg_001"],
        qpCode: "QP001",
        schemeIds: ["scheme_001"],
        sidhCourseId: "SIDH_COURSE_001",
        status: "active",
        trainingHours: 240,
        validityEndDate: new Date("2026-12-31T00:00:00.000Z"),
        validityStartDate: new Date("2025-01-01T00:00:00.000Z"),
      }),
    );
    mocks.batchCandidateFind.mockReturnValueOnce(createSortQuery([]));

    const connector = {
      createBatch: vi.fn().mockResolvedValue({ remoteBatchId: "BATCH_REMOTE_002", responseBody: {}, responseStatus: 201 }),
    };

    const result = await processQueuedBatchSyncJobs(actor as never, { limit: 1 }, { connector: connector as never, now: () => new Date("2026-01-15T00:00:00.000Z") });

    expect(result.succeededCount).toBe(1);
    expect(connector.createBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          assessmentMode: "Self",
          assessmentEndDate: "2026-02-05T00:00:00Z",
          assessmentStartDate: "2026-02-05T00:00:00Z",
          batchEndDate: "2026-02-01T00:00:00Z",
          batchEndTime: "2026-02-01T17:00:00Z",
          batchFee: { totalFees: 500 },
          batchStartDate: "2026-01-01T00:00:00Z",
          batchStartTime: "2026-01-01T09:00:00Z",
          batchType: "Regular",
          createdSource: "Created for NSDC Academy Partners",
          feePaidBy: "Self-Paid",
          schemeReferenceId: "02R/2009-10/002IM",
          schemeType: "feeBased",
          skillingcategory: { id: 1, name: "NSDC Market led programme", scheme: "Fee Based" },
          trainingHoursPerDay: 8,
          type: "Fee Based",
        }),
      }),
    );
  });

  it("moves unassigned sync-enabled batches to manual review during sync processing", async () => {
    const batch = createBatchDocument({ centerId: "unassigned", sidhBatchId: null });
    const claimedState = createSyncState({
      batchSync: {
        attempts: [],
        lastJobId: "bsjob_001",
        retryCount: 0,
        status: "processing",
      },
      sidhBatchId: null,
    });

    mocks.batchSyncStateFindOneAndUpdate.mockResolvedValueOnce(claimedState).mockResolvedValueOnce(null);
    mocks.batchFindOne.mockResolvedValue(batch);

    const connector = {
      createBatch: vi.fn(),
    };

    const result = await processQueuedBatchSyncJobs(actor as never, { limit: 1 }, { connector: connector as never, now: () => new Date("2026-01-15T00:00:00.000Z") });

    expect(result.manualReviewCount).toBe(1);
    expect(result.succeededCount).toBe(0);
    expect(result.jobs[0]?.status).toBe("manual_review");
    expect(result.jobs[0]?.message).toBe("Select a training center before enabling SIDH sync");
    expect(connector.createBatch).not.toHaveBeenCalled();
  });

  it("allows enrollment sync only for sync-eligible batches and candidates", async () => {
    const batch = createBatchDocument();
    const syncState = createSyncState();

    mocks.batchFindOne.mockResolvedValueOnce(batch).mockResolvedValueOnce(batch);
    mocks.batchCandidateFind.mockResolvedValue([{ batchCandidateId: "batc_001", batchId: "bat_001", candidateId: "cand_001", enrollmentStatus: "not_enrolled" }]);
    mocks.batchSyncStateFindOne.mockResolvedValue(syncState);
    mocks.candidateFind.mockReturnValue(createSelectQuery([{ candidateId: "cand_001", sidhCandidateId: "CAN_001" }]));
    mocks.batchCandidateUpdateMany.mockResolvedValue(undefined);
    mocks.batchCandidateAggregate.mockResolvedValue([{ _id: "queued", count: 1 }]);

    const result = await queueEnrollmentSync(actor as never, "bat_001", { forceResync: false }, "req_001");

    expect(result.batchId).toBe("bat_001");
    expect(mocks.batchCandidateUpdateMany).toHaveBeenCalledTimes(1);
    expect(syncState.enrollmentSync.status).toBe("queued");
  });

  it("stages attendance imports and computes attendance percentages correctly", async () => {
    const batch = createBatchDocument();
    mocks.batchFindOne.mockResolvedValue(batch);
    mocks.batchCandidateFind
      .mockReturnValueOnce(createSortQuery([
        { batchCandidateId: "batc_001", batchId: "bat_001", candidateId: "cand_001", enrollmentStatus: "synced" },
        { batchCandidateId: "batc_002", batchId: "bat_001", candidateId: "cand_002", enrollmentStatus: "synced" },
      ]))
      .mockReturnValueOnce(createSortQuery([
        { batchCandidateId: "batc_001", batchId: "bat_001", candidateId: "cand_001", enrollmentStatus: "synced" },
        { batchCandidateId: "batc_002", batchId: "bat_001", candidateId: "cand_002", enrollmentStatus: "synced" },
      ]));
    mocks.candidateFind
      .mockReturnValueOnce(createSelectQuery([
        {
          candidateId: "cand_001",
          centerId: "tc_001",
          dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
          fullName: "Asha",
          mobileNumber: "9876543210",
          programId: "prg_001",
          registrationMode: "internal_registration",
          sidhCandidateId: "CAN_001",
          trainingStatus: "ongoing",
        },
        {
          candidateId: "cand_002",
          centerId: "tc_001",
          dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
          fullName: "Biju",
          mobileNumber: "9876500000",
          programId: "prg_001",
          registrationMode: "internal_registration",
          sidhCandidateId: "CAN_002",
          trainingStatus: "ongoing",
        },
      ]))
      .mockReturnValueOnce(createSelectQuery([
        {
          candidateId: "cand_001",
          centerId: "tc_001",
          dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
          fullName: "Asha",
          mobileNumber: "9876543210",
          programId: "prg_001",
          registrationMode: "internal_registration",
          sidhCandidateId: "CAN_001",
          trainingStatus: "ongoing",
        },
        {
          candidateId: "cand_002",
          centerId: "tc_001",
          dateOfBirth: new Date("2000-01-01T00:00:00.000Z"),
          fullName: "Biju",
          mobileNumber: "9876500000",
          programId: "prg_001",
          registrationMode: "internal_registration",
          sidhCandidateId: "CAN_002",
          trainingStatus: "ongoing",
        },
      ]));
    mocks.attendanceUploadCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    mocks.batchDailySessionFind.mockReturnValue({ sort: vi.fn().mockResolvedValue([
      { absentCount: 1, expectedCandidateCount: 2, presentCount: 1, sessionDate: new Date("2026-01-10T00:00:00.000Z") },
      { absentCount: 0, expectedCandidateCount: 2, presentCount: 2, sessionDate: new Date("2026-01-11T00:00:00.000Z") },
    ]) });
    mocks.attendanceRecordFind.mockReturnValue({ sort: vi.fn().mockResolvedValue([
      { attendanceStatus: "present", candidateId: "cand_001" },
      { attendanceStatus: "absent", candidateId: "cand_001" },
      { attendanceStatus: "present", candidateId: "cand_002" },
      { attendanceStatus: "present", candidateId: "cand_002" },
    ]) });
    mocks.candidateTrainingStatusFind.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });

    const workbook = await buildWorkbook([
      { CandidateId: "cand_001", AttendanceDate: "10/01/2026", AttendanceStatus: "Present", TrainingStatus: "ongoing" },
      { CandidateId: "cand_002", AttendanceDate: "10/01/2026", AttendanceStatus: "Absent", TrainingStatus: "ongoing" },
    ]);

    const upload = await createAttendanceImport(actor as never, "bat_001", "attendance.xlsx", workbook as ArrayBuffer);
    const summary = await getBatchAttendanceSummary(actor as never, "bat_001");

    expect(upload.validRows).toBe(2);
    expect(upload.invalidRows).toBe(0);
    expect(summary.totalSessions).toBe(2);
    expect(summary.candidates.find((candidate) => candidate.candidateId === "cand_001")?.attendancePercentage).toBe(50);
    expect(summary.candidates.find((candidate) => candidate.candidateId === "cand_002")?.attendancePercentage).toBe(100);
  });
});

describe("enrollment sync worker", () => {
  const actor = {
    permissions: [],
    sessionId: "ses_002",
    user: {
      centerIds: [],
      email: "platform@example.com",
      id: "usr_002",
      lastLoginAt: null,
      mobileNumber: null,
      mustChangePassword: false,
      name: "Platform Admin",
      role: "platform_admin",
      roles: ["platform_admin"],
      status: "active",
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("handles remote 406 cancelled batch responses", async () => {
    const batch = createBatchDocument();
    const claimedState = createSyncState({
      enrollmentSync: {
        attempts: [],
        lastJobId: "enjob_001",
        retryCount: 0,
        status: "processing",
      },
    });

    mocks.batchSyncStateFindOneAndUpdate.mockResolvedValueOnce(claimedState).mockResolvedValueOnce(null);
    mocks.batchFindOne.mockResolvedValue(batch);
    mocks.batchSyncStateFindOne.mockResolvedValue(claimedState);
    mocks.batchCandidateFind.mockResolvedValue([{ batchCandidateId: "batc_001", batchId: "bat_001", candidateId: "cand_001", enrollmentStatus: "queued" }]);
    mocks.candidateFind.mockReturnValue(
      createSelectQuery([{ candidateId: "cand_001", fullName: "Asha", mobileNumber: "9876543210", registrationMode: "internal_registration", sidhCandidateId: "CAN_001" }]),
    );
    mocks.batchCandidateUpdateMany.mockResolvedValue(undefined);
    mocks.batchCandidateCountDocuments.mockResolvedValue(1);

    const connector = {
      enrollCandidate: vi.fn().mockRejectedValue(
        new SidhConnectorError({
          code: "SIDH_REMOTE_BATCH_CANCELLED",
          manualReview: true,
          message: "Remote batch cancelled",
          status: 406,
        }),
      ),
    };

    const result = await processQueuedEnrollmentSyncJobs(actor as never, { limit: 1 }, { connector: connector as never, now: () => new Date("2026-01-15T00:00:00.000Z") });

    expect(result.cancelledCount).toBe(1);
    expect(result.jobs[0]?.status).toBe("cancelled");
    expect(claimedState.enrollmentSync.status).toBe("cancelled");
    expect(mocks.batchCandidateUpdateMany).toHaveBeenCalledTimes(1);
  });
});