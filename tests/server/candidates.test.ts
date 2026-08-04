import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeWorkbookToArrayBuffer } from "@/lib/spreadsheet/node";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  writeAuditLog: vi.fn(),
  candidateFindOne: vi.fn(),
  candidateFind: vi.fn(),
  candidateCreate: vi.fn(),
  candidateDeleteOne: vi.fn(),
  candidateUpdateOne: vi.fn(),
  candidateBulkWrite: vi.fn(),
  importJobCreate: vi.fn(),
  importJobFindOne: vi.fn(),
  importRowInsertMany: vi.fn(),
  syncJobFindOne: vi.fn(),
  syncJobFind: vi.fn(),
  syncJobCreate: vi.fn(),
  syncJobInsertMany: vi.fn(),
  syncJobDeleteMany: vi.fn(),
  courseFindOne: vi.fn(),
  courseFind: vi.fn(),
  outboxEventCreate: vi.fn(),
  outboxEventInsertMany: vi.fn(),
  programFindOne: vi.fn(),
  sectorFindOne: vi.fn(),
  trainingCenterFindOne: vi.fn(),
  sidhApiTransactionFind: vi.fn(),
  notifyCandidateSyncQueue: vi.fn(),
  writeSyncEvent: vi.fn(),
}));

vi.mock("@/lib/server/mongodb", () => ({
  connectToDatabase: mocks.connectToDatabase,
}));

vi.mock("@/lib/server/services/audit", () => ({
  writeAuditLog: mocks.writeAuditLog,
}));

vi.mock("@/lib/server/models/candidate", () => ({
  CandidateModel: {
    findOne: mocks.candidateFindOne,
    find: mocks.candidateFind,
    create: mocks.candidateCreate,
    updateOne: mocks.candidateUpdateOne,
    bulkWrite: mocks.candidateBulkWrite,
  },
}));

vi.mock("@/lib/server/models/course", () => ({
  CourseModel: {
    findOne: mocks.courseFindOne,
    find: mocks.courseFind,
  },
}));

vi.mock("@/lib/server/models/import-job", () => ({
  ImportJobModel: {
    create: mocks.importJobCreate,
    findOne: mocks.importJobFindOne,
  },
}));

vi.mock("@/lib/server/models/candidate-import-row", () => ({
  CandidateImportRowModel: {
    insertMany: mocks.importRowInsertMany,
    exists: vi.fn().mockResolvedValue(null),
    find: vi.fn(),
    countDocuments: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock("@/lib/server/models/sync-job", () => ({
  SyncJobModel: {
    findOne: mocks.syncJobFindOne,
    find: mocks.syncJobFind,
    create: mocks.syncJobCreate,
    insertMany: mocks.syncJobInsertMany,
    deleteMany: mocks.syncJobDeleteMany,
  },
}));

vi.mock("@/lib/server/models/outbox-event", () => ({
  OutboxEventModel: {
    create: mocks.outboxEventCreate,
    insertMany: mocks.outboxEventInsertMany,
  },
}));

vi.mock("@/lib/server/services/candidate-sync-worker", () => ({
  notifyCandidateSyncQueue: mocks.notifyCandidateSyncQueue,
}));

vi.mock("@/lib/server/services/sync-events", () => ({
  writeSyncEvent: mocks.writeSyncEvent,
}));

vi.mock("@/lib/server/models/program", () => ({
  ProgramModel: {
    findOne: mocks.programFindOne,
  },
}));

vi.mock("@/lib/server/models/sector", () => ({
  SectorModel: {
    findOne: mocks.sectorFindOne,
  },
}));

vi.mock("@/lib/server/models/training-center", () => ({
  TrainingCenterModel: {
    findOne: mocks.trainingCenterFindOne,
  },
}));

vi.mock("@/lib/server/models/sidh-api-transaction", () => ({
  SidhApiTransactionModel: {
    find: mocks.sidhApiTransactionFind,
  },
}));

import {
  commitCandidateImportJob,
  createCandidate,
  createCandidateImportJob,
  deleteCandidate,
  linkExistingSidhCandidate,
  queueCandidateSyncBulk,
  queueCandidateSync,
} from "@/lib/server/services/candidates";
import { candidateImportSchema, createCandidateSchema } from "@/lib/server/validation";

function createSelectQuery<T>(value: T) {
  return {
    select: vi.fn().mockResolvedValue(value),
  };
}

async function buildWorkbook(rows: Array<Record<string, unknown>>) {
  return writeWorkbookToArrayBuffer([{ name: "Candidates", rows }]);
}

const sampleRegistrationProgram = "Fee-Based" as const;

const activeReferenceCourse = {
  courseId: "cor_001",
  courseName: "Retail Sales Associate",
  sectorId: "sec_001",
  status: "active",
  approvalStatus: "approved",
} as const;

function mockActiveReferenceCourseLookup() {
  mocks.courseFindOne.mockReturnValue(createSelectQuery(activeReferenceCourse));
  mocks.courseFind.mockReturnValue({
    select: vi.fn().mockReturnValue({
      sort: vi.fn().mockResolvedValue([activeReferenceCourse]),
    }),
  });
  mocks.sectorFindOne.mockReturnValue(createSelectQuery({ sectorId: "sec_001", name: "Retail" }));
}

describe("candidate services", () => {
  const actor = {
    permissions: [],
    sessionId: "ses_001",
    user: {
      centerIds: ["tc_001"],
      email: "operator@example.com",
      id: "usr_001",
      lastLoginAt: null,
      mobileNumber: "9876543210",
      mustChangePassword: false,
      name: "Center Operator",
      role: "training_partner_admin",
      roles: ["training_partner_admin"],
      status: "active",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.programFindOne.mockReturnValue(createSelectQuery({ programId: "prg_001", name: "Program One", status: "active" }));
    mocks.trainingCenterFindOne.mockReturnValue(createSelectQuery({ centerId: "tc_001", centerName: "Center One", status: "active" }));
    mocks.syncJobFindOne.mockReturnValue(createSelectQuery(null));
    mocks.sidhApiTransactionFind.mockReturnValue({ sort: vi.fn().mockResolvedValue([]) });
    mocks.candidateFind.mockResolvedValue([]);
    mocks.syncJobFind.mockReturnValue(createSelectQuery([]));
    mocks.syncJobInsertMany.mockImplementation(async (docs: Array<Record<string, unknown>>) => docs);
    mocks.outboxEventInsertMany.mockResolvedValue([]);
    mocks.candidateBulkWrite.mockResolvedValue({});
    mocks.notifyCandidateSyncQueue.mockResolvedValue(undefined);
    mocks.writeSyncEvent.mockResolvedValue(undefined);
  });

  it("rejects candidate payloads without father or guardian name", () => {
    expect(() =>
      createCandidateSchema.parse({
        programId: "prg_001",
        centerId: "tc_001",
        registrationMode: "internal_registration",
        personalDetails: {
          fullName: "Rohit Kumar",
          gender: "Male",
          dateOfBirth: "2005-06-10",
          disability: false,
          fathersName: "",
          guardiansName: "",
        },
        contactDetails: {
          countryCode: "91",
          mobileNumber: "9876543210",
          email: "",
        },
        identity: {
          idType: "Alternate ID",
          typeOfAlternateId: "Voter ID Card",
          idNumber: "ABC1234567",
          aadhaarReferenceNo: "",
        },
        domicile: {
          state: "ODISHA",
          district: "Khordha",
        },
        permanentAddress: {
          address: "Plot 1",
          state: "ODISHA",
          district: "Khordha",
          pinCode: "751001",
          city: "CUTTACK",
          tehsil: "CUTTACK",
          constituency: "Central",
        },
        communicationAddress: {
          sameAsPermanent: true,
        },
        experience: {
          trainingStatus: "Fresher",
          previousExperienceSector: "",
          monthsOfPreviousExperience: null,
          employed: "",
          employmentStatus: "",
          employmentDetails: "",
          heardAboutUs: "Training Provider",
        },
      }),
    ).toThrow("Father name or guardian name is required");
  });

  it("accepts file-only candidate import form fields", () => {
    expect(
      candidateImportSchema.parse({
        centerId: null,
        programId: null,
        registrationMode: undefined,
      }),
    ).toEqual({
      centerId: undefined,
      programId: undefined,
      registrationMode: "internal_registration",
    });
  });

  it("rejects duplicate mobile numbers when registering a learner", async () => {
    mocks.candidateFindOne.mockReturnValue(
      createSelectQuery({ candidateId: "cand_existing", fullName: "Existing Learner" }),
    );

    await expect(
      createCandidate(actor as never, {
        program: sampleRegistrationProgram,
        personalDetails: {
          namePrefix: "Mr",
          firstName: "New Learner",
          gender: "Male",
          dob: "2005-06-10",
          fatherName: "Parent Name",
          guardianName: "",
        },
        contactDetails: {
          email: "different@example.com",
          phone: "9876543210",
          countryCode: "91",
        },
        locationDetails: {
          state: "ODISHA",
          district: "CUTTACK",
          centerName: "Center One",
          centerId: "tc_001",
        },
      }),
    ).rejects.toMatchObject({
      errorCode: "DUPLICATE_MOBILE_NUMBER",
    });

    expect(mocks.candidateFindOne).toHaveBeenCalledWith({
      mobileNumber: "9876543210",
    });
    expect(mocks.candidateCreate).not.toHaveBeenCalled();
  });

  it("allows the same email for different mobile numbers", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.candidateCreate.mockImplementation(async (value: Record<string, unknown>) => value);

    const sharedEmail = "shared@example.com";
    const first = await createCandidate(actor as never, {
      program: sampleRegistrationProgram,
      personalDetails: {
        namePrefix: "Mr",
        firstName: "Learner One",
        gender: "Male",
        dob: "2005-06-10",
        fatherName: "Parent One",
        guardianName: "",
      },
      contactDetails: {
        email: sharedEmail,
        phone: "9876543211",
        countryCode: "91",
      },
      locationDetails: {
        state: "ODISHA",
        district: "CUTTACK",
        centerName: "Center One",
        centerId: "tc_001",
      },
    });

    const second = await createCandidate(actor as never, {
      program: sampleRegistrationProgram,
      personalDetails: {
        namePrefix: "Mrs",
        firstName: "Learner Two",
        gender: "Female",
        dob: "2006-07-11",
        fatherName: "Parent Two",
        guardianName: "",
      },
      contactDetails: {
        email: sharedEmail,
        phone: "9876543212",
        countryCode: "91",
      },
      locationDetails: {
        state: "ODISHA",
        district: "CUTTACK",
        centerName: "Center One",
        centerId: "tc_001",
      },
    });

    expect(first.contactDetails.email).toBe(sharedEmail);
    expect(second.contactDetails.email).toBe(sharedEmail);
    expect(mocks.candidateCreate).toHaveBeenCalledTimes(2);
  });

  it("uses the selected training center id when registering a learner", async () => {
    mocks.trainingCenterFindOne.mockReturnValue(
      createSelectQuery({ centerId: "tc_001", centerName: "Center One", status: "active" }),
    );
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.candidateCreate.mockImplementation(async (value: Record<string, unknown>) => value);

    const result = await createCandidate(actor as never, {
      program: sampleRegistrationProgram,
      personalDetails: {
        namePrefix: "Mr",
        firstName: "Amit Kumar",
        gender: "Male",
        dob: "2005-06-10",
        fatherName: "Suresh Kumar",
        guardianName: "",
      },
      contactDetails: {
        email: "amit@example.com",
        phone: "9876543211",
        countryCode: "91",
      },
      locationDetails: {
        state: "ODISHA",
        district: "CUTTACK",
        centerName: "Center One",
        centerId: "tc_001",
      },
    });

    expect(result.centerId).toBe("tc_001");
    expect(result.locationDetails.centerName).toBe("Center One");
    expect(mocks.trainingCenterFindOne).toHaveBeenCalledWith({ centerId: "tc_001" });
  });

  it("stores reference course details when registering a learner", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mockActiveReferenceCourseLookup();
    mocks.candidateCreate.mockImplementation(async (value: Record<string, unknown>) => ({
      ...value,
      candidateId: "cand_001",
      syncState: { status: "not_queued" },
    }));

    const result = await createCandidate(actor as never, {
      program: sampleRegistrationProgram,
      personalDetails: {
        namePrefix: "Mr",
        firstName: "Amit Kumar",
        gender: "Male",
        dob: "2005-06-10",
        fatherName: "Suresh Kumar",
        guardianName: "",
      },
      contactDetails: {
        email: "amit@example.com",
        phone: "9876543211",
        countryCode: "91",
      },
      locationDetails: {
        state: "ODISHA",
        district: "CUTTACK",
        centerName: "Center One",
        centerId: "tc_001",
      },
      referenceDetails: {
        courseId: "cor_001",
        courseName: "Retail Sales Associate",
      },
    });

    expect(mocks.candidateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceCourseId: "cor_001",
        referenceCourseName: "Retail Sales Associate",
        referenceSectorName: "Retail",
      }),
    );
    expect(mocks.courseFindOne).toHaveBeenCalledWith({ courseId: "cor_001" });
    expect(result.referenceDetails).toEqual({
      courseId: "cor_001",
      courseName: "Retail Sales Associate",
      sectorName: "Retail",
    });
  });

  it("resolves reference course details from master data when only course id is provided", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mockActiveReferenceCourseLookup();
    mocks.candidateCreate.mockImplementation(async (value: Record<string, unknown>) => ({
      ...value,
      candidateId: "cand_002",
      syncState: { status: "not_queued" },
    }));

    await createCandidate(actor as never, {
      program: sampleRegistrationProgram,
      personalDetails: {
        namePrefix: "Mr",
        firstName: "Amit Kumar",
        gender: "Male",
        dob: "2005-06-10",
        fatherName: "Suresh Kumar",
        guardianName: "",
      },
      contactDetails: {
        email: "amit@example.com",
        phone: "9876543211",
        countryCode: "91",
      },
      locationDetails: {
        state: "ODISHA",
        district: "CUTTACK",
        centerName: "Center One",
        centerId: "tc_001",
      },
      referenceDetails: {
        courseId: "cor_001",
      },
    });

    expect(mocks.courseFindOne).toHaveBeenCalledWith({ courseId: "cor_001" });
    expect(mocks.candidateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceCourseId: "cor_001",
        referenceCourseName: "Retail Sales Associate",
      }),
    );
  });

  it("rejects unknown reference course ids", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.courseFindOne.mockReturnValue(createSelectQuery(null));

    await expect(
      createCandidate(actor as never, {
        program: sampleRegistrationProgram,
        personalDetails: {
          namePrefix: "Mr",
          firstName: "Amit Kumar",
          gender: "Male",
          dob: "2005-06-10",
          fatherName: "Suresh Kumar",
          guardianName: "",
        },
        contactDetails: {
          email: "amit@example.com",
          phone: "9876543211",
          countryCode: "91",
        },
        locationDetails: {
          state: "ODISHA",
          district: "CUTTACK",
          centerName: "Center One",
          centerId: "tc_001",
        },
        referenceDetails: {
          courseId: "cor_missing",
        },
      }),
    ).rejects.toMatchObject({
      errorCode: "INVALID_REFERENCE_COURSE",
    });
  });

  it("deletes learners that have not been sent to SIDH yet", async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    mocks.candidateFindOne.mockResolvedValue({
      candidateId: "cand_001",
      centerId: "tc_001",
      programId: "prg_001",
      fullName: "Amit Kumar",
      registrationMode: "internal_registration",
      sidhCandidateId: null,
      syncState: { status: "not_queued" },
      deleteOne,
    });
    mocks.syncJobDeleteMany.mockResolvedValue({ deletedCount: 0 });

    const result = await deleteCandidate(actor as never, "cand_001");

    expect(result).toEqual({ candidateId: "cand_001", deleted: true });
    expect(mocks.syncJobDeleteMany).toHaveBeenCalledWith({ candidateId: "cand_001" });
    expect(deleteOne).toHaveBeenCalledTimes(1);
  });

  it("creates a candidate from the registration payload without requiring active master data", async () => {
    mocks.programFindOne.mockReturnValue(createSelectQuery(null));
    mocks.trainingCenterFindOne.mockReturnValue(createSelectQuery(null));
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.candidateCreate.mockImplementation(async (value: Record<string, unknown>) => value);

    const result = await createCandidate(actor as never, {
      program: sampleRegistrationProgram,
      personalDetails: {
        namePrefix: "Mr",
        firstName: "Rohit Kumar",
        gender: "Male",
        dob: "2005-06-10",
        fatherName: "Suresh Kumar",
        guardianName: "",
      },
      contactDetails: {
        email: "rohit@example.com",
        phone: "9876543210",
        countryCode: "91",
      },
      locationDetails: {
        state: "ODISHA",
        district: "CUTTACK",
        centerName: "Center One",
      },
    });

    expect(result.personalDetails.fullName).toBe("Rohit Kumar");
    expect(result.locationDetails).toEqual({
      centerName: "Center One",
      district: "CUTTACK",
      state: "ODISHA",
    });
    expect(result.programId).toBe(sampleRegistrationProgram);
    expect(result.program).toBe(sampleRegistrationProgram);
    expect(result.centerId).toBe("tc_001");
    expect(mocks.programFindOne).not.toHaveBeenCalled();
    expect(mocks.trainingCenterFindOne).toHaveBeenCalledWith({
      centerName: { $regex: /^Center One$/i },
      status: "active",
    });
  });

  it("builds a candidate import template with sector-dependent course columns", async () => {
    const { buildCandidateImportTemplateBuffer } = await import("@/lib/candidate-import-template-excel");
    const workbookBuffer = await buildCandidateImportTemplateBuffer({
      centerNames: ["Center One"],
      courseNames: ["Retail Sales Associate", "Yoga Instructor"],
      sectorNames: ["Healthcare", "Retail"],
      coursesBySector: {
        Healthcare: ["Yoga Instructor"],
        Retail: ["Retail Sales Associate"],
      },
    });

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(new Uint8Array(workbookBuffer)));
    const sheet = workbook.getWorksheet("Candidates") as
      | (ExcelJS.Worksheet & { dataValidations?: { model?: Record<string, { formulae?: string[] }> } })
      | undefined;
    const headers = (sheet?.getRow(1).values as Array<string | null | undefined>).filter(Boolean);

    expect(headers).toContain("Sector (reference only)");
    expect(headers).toContain("Course (reference only)");
    expect(headers.indexOf("Sector (reference only)")).toBeLessThan(headers.indexOf("Course (reference only)"));

    const courseValidation = sheet?.dataValidations?.model?.O2;
    expect(courseValidation?.formulae?.[0] ?? "").toContain("VLOOKUP($N2");
    expect(courseValidation?.formulae?.[0] ?? "").toContain('IF($N2=""');
  });

  it("imports from the Candidates sheet even when Lists appears first", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mockActiveReferenceCourseLookup();
    mocks.sectorFindOne.mockReturnValue(createSelectQuery({ sectorId: "sec_retail", name: "Retail" }));
    mocks.importJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    mocks.importRowInsertMany.mockResolvedValue([]);

    const workbook = await writeWorkbookToArrayBuffer([
      {
        name: "Lists",
        rows: [
          {
            Mr: "Mrs",
            Male: "Female",
            "NSQF School": "Fee-Based",
            "Center One": "Center Two",
          },
        ],
      },
      {
        name: "Candidates",
        rows: [
          {
            "Name Prefix": "Mr",
            "Full Name": "Rupa Karji",
            Gender: "Female",
            DOB: "28/06/1945",
            "Father's Name": "K Barun",
            "Guardian Name": "K Barun",
            Email: "rkarji@gmail.com",
            "Country Code": "91",
            Phone: "8559681145",
            State: "ODISHA",
            District: "GAJAPATI",
            Program: "Farmer",
            "Center Name": "GTET Skill Training Center Paralakhemundi",
            "Sector (reference only)": "Retail",
            "Course (reference only)": "Retail Sales Associate",
          },
        ],
      },
    ]);

    const result = await createCandidateImportJob(
      actor as never,
      {
        programId: "prg_001",
        centerId: "tc_001",
        registrationMode: "internal_registration",
      },
      "Test.xlsx",
      workbook as ArrayBuffer,
    );

    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(0);
    expect(mocks.sectorFindOne).toHaveBeenCalled();
    expect(mocks.importRowInsertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          status: "valid",
          normalized: expect.objectContaining({
            personalDetails: expect.objectContaining({ firstName: "Rupa Karji" }),
            contactDetails: expect.objectContaining({ phone: "8559681145" }),
            program: "Farmer",
            referenceDetails: expect.objectContaining({
              courseName: "Retail Sales Associate",
              sectorName: "Retail",
            }),
          }),
        }),
      ]),
      { ordered: false },
    );
  });

  it("stages import rows with reference course names from the workbook", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mockActiveReferenceCourseLookup();
    mocks.importJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    mocks.importRowInsertMany.mockResolvedValue([]);

    const workbook = await buildWorkbook([
      {
        "Name Prefix": "Mr",
        "Full Name": "Rohit Kumar",
        Gender: "Male",
        DOB: "10/06/2005",
        "Father's Name": "Suresh Kumar",
        Email: "rohit@example.com",
        "Country Code": "91",
        Phone: "9876543210",
        State: "ODISHA",
        District: "CUTTACK",
        Program: sampleRegistrationProgram,
        "Center Name": "Center One",
        "Course (reference only)": "Retail Sales Associate",
      },
    ]);

    const result = await createCandidateImportJob(actor as never, {
      programId: "prg_001",
      centerId: "tc_001",
      registrationMode: "internal_registration",
    }, "candidates.xlsx", workbook as ArrayBuffer);

    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(1);
    expect(mocks.courseFind).toHaveBeenCalled();
    expect(mocks.importRowInsertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          normalized: expect.objectContaining({
            referenceDetails: {
              courseId: "cor_001",
              courseName: "Retail Sales Associate",
            },
          }),
        }),
      ]),
      { ordered: false },
    );
  });

  it("marks import rows duplicate when the phone number already exists", async () => {
    mocks.candidateFindOne.mockReturnValue(
      createSelectQuery({ candidateId: "cand_existing", fullName: "Existing Learner" }),
    );
    mocks.importJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    mocks.importRowInsertMany.mockResolvedValue([]);

    const workbook = await buildWorkbook([
      {
        "Name Prefix": "Mr",
        "Full Name": "Rohit Kumar",
        Gender: "Male",
        DOB: "10/06/2005",
        "Father's Name": "Suresh Kumar",
        Email: "rohit@example.com",
        "Country Code": "91",
        Phone: "9876543210",
        State: "ODISHA",
        District: "CUTTACK",
        Program: sampleRegistrationProgram,
        "Center Name": "Center One",
      },
    ]);

    const result = await createCandidateImportJob(actor as never, {
      programId: "prg_001",
      centerId: "tc_001",
      registrationMode: "internal_registration",
    }, "candidates.xlsx", workbook as ArrayBuffer);

    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(0);
    expect(result.duplicateRows).toBe(1);
  });

  it("stages import rows with valid and invalid counts", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.importJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    mocks.importRowInsertMany.mockResolvedValue([]);

    const workbook = await buildWorkbook([
      {
        "Name Prefix": "Mr",
        "Full Name": "Rohit Kumar",
        Gender: "Male",
        DOB: "10/06/2005",
        "Father's Name": "Suresh Kumar",
        Email: "rohit@example.com",
        "Country Code": "91",
        Phone: "9876543210",
        State: "ODISHA",
        District: "CUTTACK",
        Program: sampleRegistrationProgram,
        "Center Name": "Center One",
      },
      {
        "Name Prefix": "Mr",
        "Full Name": "Missing Mobile",
        Gender: "Male",
        DOB: "10/06/2005",
        "Father's Name": "Parent",
        Email: "missing.mobile@example.com",
        "Country Code": "91",
        Phone: "",
        State: "ODISHA",
        District: "CUTTACK",
        Program: sampleRegistrationProgram,
        "Center Name": "Center One",
      },
    ]);

    const result = await createCandidateImportJob(actor as never, {
      programId: "prg_001",
      centerId: "tc_001",
      registrationMode: "internal_registration",
    }, "candidates.xlsx", workbook as ArrayBuffer);

    expect(result.totalRows).toBe(2);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(1);
    expect(mocks.importJobCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [],
        totalRows: 2,
        validRows: 1,
        invalidRows: 1,
      }),
    );
    expect(mocks.importRowInsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.importRowInsertMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          normalized: expect.objectContaining({
            locationDetails: {
              centerName: "Center One",
              district: "CUTTACK",
              state: "ODISHA",
            },
          }),
        }),
      ]),
      { ordered: false },
    );
  });

  it("marks import rows invalid when name prefix is missing", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.importJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    mocks.importRowInsertMany.mockResolvedValue([]);

    const workbook = await buildWorkbook([
      {
        "Name Prefix": "",
        "Full Name": "Rohit Kumar",
        Gender: "Male",
        DOB: "10/06/2005",
        "Father's Name": "Suresh Kumar",
        Email: "rohit@example.com",
        "Country Code": "91",
        Phone: "9876543210",
        State: "ODISHA",
        District: "CUTTACK",
        Program: sampleRegistrationProgram,
        "Center Name": "Center One",
      },
    ]);

    const result = await createCandidateImportJob(actor as never, {
      programId: "prg_001",
      centerId: "tc_001",
      registrationMode: "internal_registration",
    }, "candidates.xlsx", workbook as ArrayBuffer);

    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(0);
    expect(result.invalidRows).toBe(1);
  });

  it("marks import rows invalid when gender is not allowed", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.importJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    mocks.importRowInsertMany.mockResolvedValue([]);

    const workbook = await buildWorkbook([
      {
        "Name Prefix": "Mr",
        "Full Name": "Rohit Kumar",
        Gender: "Other",
        DOB: "10/06/2005",
        "Father's Name": "Suresh Kumar",
        Email: "rohit@example.com",
        "Country Code": "91",
        Phone: "9876543210",
        State: "ODISHA",
        District: "CUTTACK",
        Program: sampleRegistrationProgram,
        "Center Name": "Center One",
      },
    ]);

    const result = await createCandidateImportJob(actor as never, {
      programId: "prg_001",
      centerId: "tc_001",
      registrationMode: "internal_registration",
    }, "candidates.xlsx", workbook as ArrayBuffer);

    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(0);
    expect(result.invalidRows).toBe(1);
  });

  it("links an existing SIDH candidate without queueing sync", async () => {
    mocks.candidateFindOne
      .mockReturnValueOnce(createSelectQuery(null))
      .mockReturnValueOnce(createSelectQuery(null));
    mocks.candidateCreate.mockImplementation(async (value: Record<string, unknown>) => value);

    const result = await linkExistingSidhCandidate(actor as never, {
      programId: "prg_001",
      centerId: "tc_001",
      sidhCandidateId: "CAN_24883828",
      mobileNumber: "9876543210",
      fullName: "Rohit Kumar",
      dateOfBirth: "2005-06-10",
    });

    expect(result.registrationMode).toBe("existing_sidh_link");
    expect(result.sidhCandidateId).toBe("CAN_24883828");
    expect(result.syncState?.status).toBe("linked");
  });

  it("queues a sync job for an internal candidate", async () => {
    mocks.candidateFindOne.mockResolvedValue({
      candidateId: "cand_001",
      centerId: "tc_001",
      registrationMode: "internal_registration",
      programId: "prg_001",
      fullName: "Rohit Kumar",
      salutation: "Mr",
      gender: "Male",
      dateOfBirth: new Date("2005-06-10T00:00:00.000Z"),
      disability: false,
      idType: "Alternate ID",
      mobileNumber: "9876543210",
      permanentAddress: {
        address: "Plot 1",
        state: "ODISHA",
        district: "Khordha",
        pinCode: "751001",
        city: "CUTTACK",
        tehsil: "CUTTACK",
        constituency: "Central",
      },
      communicationAddress: {
        sameAsPermanent: true,
        address: "Plot 1",
        state: "ODISHA",
        district: "Khordha",
        pinCode: "751001",
        city: "CUTTACK",
        tehsil: "CUTTACK",
        constituency: "Central",
      },
      syncState: {
        status: "not_queued",
        retryCount: 0,
      },
    });
    mocks.syncJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);

    const result = await queueCandidateSync(actor as never, "cand_001");

    expect(result.status).toBe("queued");
    expect(mocks.outboxEventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.candidateUpdateOne).toHaveBeenCalledTimes(1);
  });

  it("commits valid import rows into candidates without queueing delivery", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    mocks.importJobFindOne.mockResolvedValue({
      importJobId: "imp_001",
      centerId: "tc_001",
      status: "staged",
      committedRows: 0,
      rows: [
        {
          rowId: "impr_001",
          rowNumber: 2,
          status: "valid",
          normalized: {
            programId: "prg_001",
            centerId: "tc_001",
            registrationMode: "internal_registration",
            personalDetails: {
              salutation: "Mr",
              fullName: "Rohit Kumar",
              gender: "Male",
              dateOfBirth: "2005-06-10",
              fathersName: "Suresh Kumar",
              mothersName: "",
              guardiansName: "",
              religion: "",
              category: "",
              disability: false,
              typeOfDisability: "",
              educationLevel: "",
              maritalStatus: "",
            },
            contactDetails: {
              email: "",
              countryCode: "91",
              mobileNumber: "9876543210",
            },
            identity: {
              idType: "Alternate ID",
              typeOfAlternateId: "Voter ID Card",
              aadhaarReferenceNo: "",
              idNumber: "ABC1234567",
            },
            domicile: {
              state: "ODISHA",
              district: "Khordha",
            },
            permanentAddress: {
              address: "Plot 1",
              state: "ODISHA",
              district: "Khordha",
              pinCode: "751001",
              city: "CUTTACK",
              tehsil: "CUTTACK",
              constituency: "Central",
            },
            communicationAddress: {
              sameAsPermanent: true,
            },
            experience: {
              trainingStatus: "Fresher",
              previousExperienceSector: "",
              monthsOfPreviousExperience: null,
              employed: "",
              employmentStatus: "",
              employmentDetails: "",
              heardAboutUs: "Training Provider",
            },
          },
          errors: [],
        },
      ],
      save,
    });
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.candidateCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    const result = await commitCandidateImportJob(actor as never, "imp_001");

    expect(result.committedRows).toBe(1);
    expect(result.status).toBe("committed");
    expect(save).toHaveBeenCalledTimes(1);
    expect(mocks.syncJobCreate).not.toHaveBeenCalled();
  });

  it("commits only import rows matching sector and course filters", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    mocks.importJobFindOne.mockResolvedValue({
      importJobId: "imp_filter_001",
      centerId: "tc_001",
      status: "staged",
      committedRows: 0,
      validRows: 2,
      rows: [
        {
          rowId: "impr_retail",
          rowNumber: 2,
          status: "valid",
          normalized: {
            programId: "prg_001",
            centerId: "tc_001",
            registrationMode: "internal_registration",
            personalDetails: {
              salutation: "Mr",
              fullName: "Retail Learner",
              gender: "Male",
              dateOfBirth: "2005-06-10",
              fathersName: "Father",
              mothersName: "",
              guardiansName: "",
              religion: "",
              category: "",
              disability: false,
              typeOfDisability: "",
              educationLevel: "",
              maritalStatus: "",
            },
            contactDetails: { email: "", countryCode: "91", mobileNumber: "9876543211" },
            identity: { idType: "Alternate ID", typeOfAlternateId: "Voter ID Card", aadhaarReferenceNo: "", idNumber: "ABC1111111" },
            domicile: { state: "ODISHA", district: "Khordha" },
            permanentAddress: {
              address: "Plot 1",
              state: "ODISHA",
              district: "Khordha",
              pinCode: "751001",
              city: "CUTTACK",
              tehsil: "CUTTACK",
              constituency: "Central",
            },
            communicationAddress: { sameAsPermanent: true },
            experience: {
              trainingStatus: "Fresher",
              previousExperienceSector: "",
              monthsOfPreviousExperience: null,
              employed: "",
              employmentStatus: "",
              employmentDetails: "",
              heardAboutUs: "Training Provider",
            },
            referenceDetails: { courseName: "Retail Sales Associate", sectorName: "Retail" },
          },
          errors: [],
        },
        {
          rowId: "impr_yoga",
          rowNumber: 3,
          status: "valid",
          normalized: {
            programId: "prg_001",
            centerId: "tc_001",
            registrationMode: "internal_registration",
            personalDetails: {
              salutation: "Ms",
              fullName: "Yoga Learner",
              gender: "Female",
              dateOfBirth: "2005-06-10",
              fathersName: "Father",
              mothersName: "",
              guardiansName: "",
              religion: "",
              category: "",
              disability: false,
              typeOfDisability: "",
              educationLevel: "",
              maritalStatus: "",
            },
            contactDetails: { email: "", countryCode: "91", mobileNumber: "9876543212" },
            identity: { idType: "Alternate ID", typeOfAlternateId: "Voter ID Card", aadhaarReferenceNo: "", idNumber: "ABC2222222" },
            domicile: { state: "ODISHA", district: "Khordha" },
            permanentAddress: {
              address: "Plot 2",
              state: "ODISHA",
              district: "Khordha",
              pinCode: "751001",
              city: "CUTTACK",
              tehsil: "CUTTACK",
              constituency: "Central",
            },
            communicationAddress: { sameAsPermanent: true },
            experience: {
              trainingStatus: "Fresher",
              previousExperienceSector: "",
              monthsOfPreviousExperience: null,
              employed: "",
              employmentStatus: "",
              employmentDetails: "",
              heardAboutUs: "Training Provider",
            },
            referenceDetails: { courseName: "Yoga Instructor", sectorName: "Healthcare" },
          },
          errors: [],
        },
      ],
      save,
    });
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.candidateCreate.mockImplementation(async (value: Record<string, unknown>) => value);
    mockActiveReferenceCourseLookup();

    const result = await commitCandidateImportJob(actor as never, "imp_filter_001", undefined, {
      sectorName: "Retail",
      courseName: "Retail Sales Associate",
    });

    expect(result.committedRows).toBe(1);
    expect(result.validRows).toBe(1);
    expect(result.status).toBe("staged");
    expect(mocks.candidateCreate).toHaveBeenCalledTimes(1);
    expect(mocks.candidateCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: "Retail Learner",
      }),
    );
  });

  it("queues selected candidates in bulk", async () => {
    mocks.candidateFind.mockResolvedValue([
      {
        candidateId: "cand_001",
        centerId: "tc_001",
        registrationMode: "internal_registration",
        programId: "prg_001",
        fullName: "Rohit Kumar",
        salutation: "Mr",
        gender: "Male",
        dateOfBirth: new Date("2005-06-10T00:00:00.000Z"),
        disability: false,
        idType: "UNSPECIFIED",
        mobileNumber: "9876543210",
        permanentAddress: {},
        communicationAddress: { sameAsPermanent: true },
        syncState: { status: "not_queued", retryCount: 0 },
      },
      {
        candidateId: "cand_002",
        centerId: "tc_001",
        registrationMode: "existing_sidh_link",
        sidhCandidateId: "CAN_24883828",
      },
    ]);

    const result = await queueCandidateSyncBulk(actor as never, {
      candidateIds: ["cand_001", "cand_002"],
    });

    expect(result.queuedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(mocks.syncJobInsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.outboxEventInsertMany).toHaveBeenCalledTimes(1);
    expect(mocks.candidateBulkWrite).toHaveBeenCalledTimes(1);
    expect(mocks.notifyCandidateSyncQueue).toHaveBeenCalledTimes(1);
  });

  it("skips a candidate that already has a queued or processing sync job", async () => {
    mocks.candidateFind.mockResolvedValue([
      {
        candidateId: "cand_001",
        centerId: "tc_001",
        registrationMode: "internal_registration",
        programId: "prg_001",
        fullName: "Rohit Kumar",
        salutation: "Mr",
        gender: "Male",
        dateOfBirth: new Date("2005-06-10T00:00:00.000Z"),
        disability: false,
        idType: "UNSPECIFIED",
        mobileNumber: "9876543210",
        permanentAddress: {},
        communicationAddress: { sameAsPermanent: true },
        syncState: { status: "not_queued", retryCount: 0 },
      },
    ]);
    mocks.syncJobFind.mockReturnValue(createSelectQuery([{ candidateId: "cand_001" }]));

    const result = await queueCandidateSyncBulk(actor as never, {
      candidateIds: ["cand_001"],
    });

    expect(result.queuedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.items[0]).toMatchObject({ candidateId: "cand_001", status: "skipped" });
    expect(mocks.syncJobInsertMany).not.toHaveBeenCalled();
  });
});