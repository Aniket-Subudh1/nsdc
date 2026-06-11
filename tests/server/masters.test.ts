import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  writeAuditLog: vi.fn(),
  programFind: vi.fn(),
  programFindOne: vi.fn(),
  sectorFind: vi.fn(),
  sectorFindOne: vi.fn(),
  schemeFind: vi.fn(),
  schemeFindOne: vi.fn(),
  courseFind: vi.fn(),
  courseFindOne: vi.fn(),
  courseCreate: vi.fn(),
  courseVersionFind: vi.fn(),
  courseVersionCreate: vi.fn(),
  trainingCenterFind: vi.fn(),
  referenceValueFind: vi.fn(),
}));

vi.mock("@/lib/server/mongodb", () => ({
  connectToDatabase: mocks.connectToDatabase,
}));

vi.mock("@/lib/server/services/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/server/models/program", () => ({
  ProgramModel: {
    find: mocks.programFind,
    findOne: mocks.programFindOne,
  },
}));

vi.mock("@/lib/server/models/sector", () => ({
  SectorModel: {
    find: mocks.sectorFind,
    findOne: mocks.sectorFindOne,
  },
}));

vi.mock("@/lib/server/models/scheme", () => ({
  SchemeModel: {
    find: mocks.schemeFind,
    findOne: mocks.schemeFindOne,
  },
}));

vi.mock("@/lib/server/models/course", () => ({
  CourseModel: {
    find: mocks.courseFind,
    findOne: mocks.courseFindOne,
    create: mocks.courseCreate,
  },
}));

vi.mock("@/lib/server/models/course-version", () => ({
  CourseVersionModel: {
    find: mocks.courseVersionFind,
    create: mocks.courseVersionCreate,
  },
}));

vi.mock("@/lib/server/models/training-center", () => ({
  TrainingCenterModel: {
    find: mocks.trainingCenterFind,
  },
}));

vi.mock("@/lib/server/models/reference-value", () => ({
  ReferenceValueModel: {
    find: mocks.referenceValueFind,
  },
}));

import {
  createCourse,
  getCandidateReferenceData,
  updateCourse,
} from "@/lib/server/services/masters";

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

describe("masters service", () => {
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
    vi.clearAllMocks();
    mocks.programFind.mockReturnValue(createSelectQuery([{ programId: "prg_001" }]));
    mocks.schemeFind.mockReturnValue(createSelectQuery([{ schemeId: "sch_001" }]));
    mocks.sectorFindOne.mockResolvedValue({ sectorId: "sec_001" });
  });

  it("creates a course and stores the initial version snapshot", async () => {
    const createdAt = new Date("2024-01-01T00:00:00.000Z");
    mocks.courseFindOne
      .mockReturnValueOnce(createSelectQuery(null))
      .mockResolvedValueOnce(null);
    mocks.courseCreate.mockResolvedValue({
      approvalDate: new Date("2024-01-10T00:00:00.000Z"),
      approvalStatus: "approved",
      associatedQpOrJobRole: "AGR Job Role",
      courseId: "cor_001",
      courseName: "Bamboo Grower",
      createdAt,
      gtUploadedDurationHours: 320,
      internalCourseCode: "GT_BAMBOO_001",
      jobRoleMappingType: "QP_NOS",
      minimumAge: 18,
      nsqfLevel: 4,
      price: 1000,
      programIds: ["prg_001"],
      qpCode: "AGR/Q6101",
      schemeIds: ["sch_001"],
      sectorId: "sec_001",
      sidhCourseId: "SIDH_001",
      status: "active",
      trainingHours: 320,
      updatedAt: createdAt,
      validityEndDate: new Date("2025-01-08T00:00:00.000Z"),
      validityStartDate: new Date("2023-11-28T00:00:00.000Z"),
      version: 1,
    });

    const result = await createCourse(actor as never, {
      approvalDate: "2024-01-10",
      approvalStatus: "approved",
      associatedQpOrJobRole: "AGR Job Role",
      courseName: "Bamboo Grower",
      internalCourseCode: "GT_BAMBOO_001",
      jobRoleMappingType: "QP_NOS",
      minimumAge: 18,
      nsqfLevel: 4,
      price: 1000,
      programIds: ["prg_001"],
      qpCode: "AGR/Q6101",
      schemeIds: ["sch_001"],
      sectorId: "sec_001",
      sidhCourseId: "SIDH_001",
      status: "active",
      trainingHours: 320,
      validityEndDate: "2025-01-08",
      validityStartDate: "2023-11-28",
      gtUploadedDurationHours: 320,
    });

    expect(result.version).toBe(1);
    expect(mocks.courseVersionCreate).toHaveBeenCalledTimes(1);
    expect(mocks.courseVersionCreate.mock.calls[0]?.[0]).toMatchObject({
      courseId: "cor_001",
      version: 1,
    });
  });

  it("increments course version on update", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const courseDocument = {
      approvalDate: new Date("2024-01-10T00:00:00.000Z"),
      approvalStatus: "approved",
      associatedQpOrJobRole: "AGR Job Role",
      courseId: "cor_001",
      courseName: "Bamboo Grower",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      gtUploadedDurationHours: 320,
      internalCourseCode: "GT_BAMBOO_001",
      jobRoleMappingType: "QP_NOS",
      minimumAge: 18,
      nsqfLevel: 4,
      price: 1000,
      programIds: ["prg_001"],
      qpCode: "AGR/Q6101",
      save,
      schemeIds: ["sch_001"],
      sectorId: "sec_001",
      sidhCourseId: "SIDH_001",
      status: "active",
      trainingHours: 320,
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      validityEndDate: new Date("2025-01-08T00:00:00.000Z"),
      validityStartDate: new Date("2023-11-28T00:00:00.000Z"),
      version: 1,
    };

    mocks.courseFindOne
      .mockResolvedValueOnce(courseDocument)
      .mockReturnValueOnce(createSelectQuery(null));

    const result = await updateCourse(actor as never, "cor_001", {
      courseName: "Bamboo Grower Advanced",
      currentVersion: 1,
    });

    expect(result.version).toBe(2);
    expect(courseDocument.version).toBe(2);
    expect(save).toHaveBeenCalledTimes(1);
    expect(mocks.courseVersionCreate).toHaveBeenCalledTimes(1);
    expect(mocks.courseVersionCreate.mock.calls[0]?.[0]).toMatchObject({
      courseId: "cor_001",
      version: 2,
    });
  });

  it("rejects overlapping active course mappings", async () => {
    mocks.courseFindOne.mockReturnValueOnce(createSelectQuery({ courseId: "cor_existing" }));

    await expect(
      createCourse(actor as never, {
        approvalStatus: "approved",
        associatedQpOrJobRole: "AGR Job Role",
        courseName: "Bamboo Grower",
        internalCourseCode: "GT_BAMBOO_001",
        jobRoleMappingType: "QP_NOS",
        minimumAge: 18,
        nsqfLevel: 4,
        price: 1000,
        programIds: ["prg_001"],
        qpCode: "AGR/Q6101",
        schemeIds: ["sch_001"],
        sectorId: "sec_001",
        sidhCourseId: "SIDH_001",
        status: "active",
        trainingHours: 320,
        validityEndDate: "2025-01-08",
        validityStartDate: "2023-11-28",
      }),
    ).rejects.toMatchObject({ errorCode: "COURSE_MAPPING_OVERLAP" });
  });

  it("returns candidate reference data from normalized sources", async () => {
    mocks.programFind.mockReturnValueOnce(createSortQuery([
      {
        code: "NSQF_SCHOOL",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        description: null,
        name: "NSQF School",
        programId: "prg_001",
        status: "active",
        syncToSidh: true,
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ]));
    mocks.sectorFind.mockReturnValueOnce(createSortQuery([
      {
        code: "AGR",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        description: null,
        name: "Agriculture",
        sectorId: "sec_001",
        status: "active",
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ]));
    mocks.schemeFind.mockReturnValueOnce(createSortQuery([
      {
        beneficiaryType: "Youth",
        code: "DDUGKY",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        description: null,
        fundingType: "Government",
        name: "DDU-GKY",
        schemeId: "sch_001",
        sidhSchemeId: "SIDH_SCH_001",
        status: "active",
        syncEnabled: true,
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        validFrom: new Date("2024-01-01T00:00:00.000Z"),
        validTo: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]));
    mocks.trainingCenterFind.mockReturnValueOnce(createSortQuery([
      {
        centerCode: "GTET-JSG-001",
        centerId: "tc_001",
        centerName: "Jharsuguda Center",
      },
    ]));
    mocks.courseFind.mockReturnValueOnce(createSortQuery([
      {
        approvalDate: new Date("2024-01-01T00:00:00.000Z"),
        approvalStatus: "approved",
        associatedQpOrJobRole: "AGR Job Role",
        courseId: "cor_001",
        courseName: "Bamboo Grower",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        gtUploadedDurationHours: 320,
        internalCourseCode: "GT_BAMBOO_001",
        jobRoleMappingType: "QP_NOS",
        minimumAge: 18,
        nsqfLevel: 4,
        price: 1000,
        programIds: ["prg_001"],
        qpCode: "AGR/Q6101",
        schemeIds: ["sch_001"],
        sectorId: "sec_001",
        sidhCourseId: "SIDH_001",
        status: "active",
        trainingHours: 320,
        updatedAt: new Date("2024-01-01T00:00:00.000Z"),
        validityEndDate: new Date("2099-01-01T00:00:00.000Z"),
        validityStartDate: new Date("2024-01-01T00:00:00.000Z"),
        version: 1,
      },
    ]));
    mocks.referenceValueFind.mockReturnValueOnce(createSortQuery([
      { category: "salutation", code: "mr", label: "Mr" },
      { category: "gender", code: "male", label: "Male" },
    ]));

    const result = await getCandidateReferenceData(actor as never);

    expect(result.programs).toHaveLength(1);
    expect(result.trainingCenters).toHaveLength(1);
    expect(result.courses).toHaveLength(1);
    expect(result.enums.salutation).toEqual([{ code: "mr", label: "Mr" }]);
  });
});