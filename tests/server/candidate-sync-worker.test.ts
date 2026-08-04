import { beforeEach, describe, expect, it, vi } from "vitest";

import { processQueuedSyncJobs } from "@/lib/server/services/candidate-sync-worker";
import { SidhConnectorError } from "@/lib/server/services/sidh-connector";

const mocks = vi.hoisted(() => ({
  candidateFindOne: vi.fn(),
  connectToDatabase: vi.fn(),
  programFindOne: vi.fn(),
  sidhApiTransactionFindOne: vi.fn(),
  syncJobFindOneAndUpdate: vi.fn(),
  trainingCenterFindOne: vi.fn(),
  writeAuditLog: vi.fn(),
  writeSyncEvent: vi.fn(),
}));

vi.mock("@/lib/server/mongodb", () => ({
  connectToDatabase: mocks.connectToDatabase,
}));

vi.mock("@/lib/server/services/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/server/services/sync-events", () => ({
  writeSyncEvent: mocks.writeSyncEvent,
}));

vi.mock("@/lib/server/models/candidate", () => ({
  CandidateModel: {
    findOne: mocks.candidateFindOne,
  },
}));

vi.mock("@/lib/server/models/sidh-api-transaction", () => ({
  SidhApiTransactionModel: {
    findOne: mocks.sidhApiTransactionFindOne,
  },
  truncateTransactionPayload: (value: unknown) => value,
}));

vi.mock("@/lib/server/models/sync-job", () => ({
  SyncJobModel: {
    findOneAndUpdate: mocks.syncJobFindOneAndUpdate,
  },
}));

vi.mock("@/lib/server/models/training-center", () => ({
  TrainingCenterModel: {
    findOne: mocks.trainingCenterFindOne,
  },
}));

vi.mock("@/lib/server/models/program", () => ({
  ProgramModel: {
    findOne: mocks.programFindOne,
  },
}));

function createSelectQuery<T>(value: T) {
  return {
    select: vi.fn().mockResolvedValue(value),
  };
}

function createCandidate(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: "cand_001",
    category: null,
    centerId: "tc_001",
    communicationAddress: {
      address: "Plot 1",
      city: "Bhubaneswar",
      constituency: "Central",
      district: "Khordha",
      pinCode: "751001",
      sameAsPermanent: true,
      state: "Odisha",
      tehsil: "Bhubaneswar",
    },
    countryCode: "91",
    dateOfBirth: new Date("2005-06-10T00:00:00.000Z"),
    disability: false,
    domicileDistrict: "Khordha",
    domicileState: "Odisha",
    email: "rohit@example.com",
    fathersName: "Suresh Kumar",
    fullName: "Rohit Kumar",
    gender: "Male",
    guardiansName: "",
    heardAboutUs: "Training Provider",
    idNumber: "ABC1234567",
    idType: "Alternate ID",
    mobileNumber: "9876543210",
    permanentAddress: {
      address: "Plot 1",
      city: "Bhubaneswar",
      constituency: "Central",
      district: "Khordha",
      pinCode: "751001",
      state: "Odisha",
      tehsil: "Bhubaneswar",
    },
    programId: "prg_001",
    registrationMode: "internal_registration",
    save: vi.fn().mockResolvedValue(undefined),
    sidhCandidateId: null,
    syncState: {
      retryCount: 0,
      status: "queued",
    },
    trainingStatus: "Fresher",
    typeOfAlternateId: "Voter ID Card",
    ...overrides,
  };
}

function createJob(overrides: Record<string, unknown> = {}) {
  return {
    attempts: [],
    candidateId: "cand_001",
    entityId: "cand_001",
    entityType: "candidate",
    latestRemoteCandidateId: null,
    lockId: "lock_001",
    lockedAt: new Date("2026-01-01T00:00:00.000Z"),
    maxAttempts: 3,
    nextRunAt: new Date("2026-01-01T00:00:00.000Z"),
    payloadSnapshot: {},
    retryCount: 0,
    save: vi.fn().mockResolvedValue(undefined),
    status: "processing",
    syncJobId: "sync_001",
    ...overrides,
  };
}

describe("candidate sync worker", () => {
  const actor = {
    permissions: [],
    sessionId: "ses_001",
    user: {
      centerIds: [],
      email: "admin@example.com",
      id: "usr_001",
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
    mocks.sidhApiTransactionFindOne.mockReturnValue({
      sort: vi.fn().mockResolvedValue(null),
    });
    mocks.writeSyncEvent.mockResolvedValue(undefined);
  });

  it("processes a queued sync job and stores the remote candidate id", async () => {
    const candidate = createCandidate();
    const job = createJob();
    const connector = {
      registerCandidate: vi.fn().mockResolvedValue({
        remoteCandidateId: "CAN_998877",
        responseBody: { candidateId: "CAN_998877" },
        responseStatus: 201,
      }),
    };

    mocks.syncJobFindOneAndUpdate.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
    mocks.candidateFindOne.mockResolvedValue(candidate);

    const result = await processQueuedSyncJobs(actor as never, { limit: 1 }, { connector: connector as never });

    expect(connector.registerCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          ContactDetails: {
            CountryCode: "+91",
            Email: "rohit@example.com",
            Phone: "9876543210",
          },
          PersonalDetails: {
            DOB: "2005-06-10T00:00:00Z",
            FatherName: "Suresh Kumar",
            FirstName: "Rohit Kumar",
            Gender: "Male",
          },
        },
      }),
    );
    expect(result.processedCount).toBe(1);
    expect(result.succeededCount).toBe(1);
    expect(result.jobs[0]?.remoteCandidateId).toBe("CAN_998877");
    expect(job.status).toBe("succeeded");
    expect(candidate.sidhCandidateId).toBe("CAN_998877");
    expect(candidate.save).toHaveBeenCalled();
  });

  it("requeues retryable failures with backoff", async () => {
    const candidate = createCandidate();
    const job = createJob();
    const connector = {
      registerCandidate: vi.fn().mockRejectedValue(
        new SidhConnectorError({
          code: "SIDH_SERVER_ERROR",
          message: "SIDH unavailable",
          retryable: true,
          status: 503,
        }),
      ),
    };

    mocks.syncJobFindOneAndUpdate.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
    mocks.candidateFindOne.mockResolvedValue(candidate);

    const result = await processQueuedSyncJobs(actor as never, { limit: 1 }, { connector: connector as never, now: () => new Date("2026-01-01T00:00:00.000Z") });

    expect(result.retryScheduledCount).toBe(1);
    expect(job.status).toBe("queued");
    expect(job.retryCount).toBe(1);
    expect(candidate.syncState.status).toBe("queued");
  });

  it("dead-letters retryable failures after the third attempt", async () => {
    const candidate = createCandidate({
      syncState: {
        retryCount: 2,
        status: "queued",
      },
    });
    const job = createJob({ maxAttempts: 3, retryCount: 2 });
    const connector = {
      registerCandidate: vi.fn().mockRejectedValue(
        new SidhConnectorError({
          code: "SIDH_AUTH_FAILED",
          message: "Unauthorized : csrf",
          retryable: true,
          status: 401,
        }),
      ),
    };

    mocks.syncJobFindOneAndUpdate.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
    mocks.candidateFindOne.mockResolvedValue(candidate);

    const result = await processQueuedSyncJobs(actor as never, { limit: 1 }, { connector: connector as never, now: () => new Date("2026-01-01T00:00:00.000Z") });

    expect(result.deadLetterCount).toBe(1);
    expect(result.jobs[0]?.status).toBe("dead_letter");
    expect(job.status).toBe("dead_letter");
  });

  it("reconciles 409 responses that include an existing remote candidate id", async () => {
    const candidate = createCandidate();
    const job = createJob();
    const connector = {
      registerCandidate: vi.fn().mockRejectedValue(
        new SidhConnectorError({
          code: "SIDH_CONFLICT",
          manualReview: false,
          message: "Candidate already exists",
          remoteCandidateId: "CAN_112233",
          responseBody: { candidateId: "CAN_112233" },
          status: 409,
        }),
      ),
    };

    mocks.syncJobFindOneAndUpdate.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
    mocks.candidateFindOne.mockResolvedValue(candidate);

    const result = await processQueuedSyncJobs(actor as never, { limit: 1 }, { connector: connector as never });

    expect(result.succeededCount).toBe(1);
    expect(candidate.sidhCandidateId).toBe("CAN_112233");
    expect(job.status).toBe("succeeded");
  });
});