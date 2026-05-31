import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeWorkbookToArrayBuffer } from "@/lib/spreadsheet/node";

const mocks = vi.hoisted(() => ({
  connectToDatabase: vi.fn(),
  writeAuditLog: vi.fn(),
  candidateFindOne: vi.fn(),
  candidateCreate: vi.fn(),
  candidateUpdateOne: vi.fn(),
  importJobCreate: vi.fn(),
  importJobFindOne: vi.fn(),
  syncJobFindOne: vi.fn(),
  syncJobCreate: vi.fn(),
  outboxEventCreate: vi.fn(),
  programFindOne: vi.fn(),
  trainingCenterFindOne: vi.fn(),
  sidhApiTransactionFind: vi.fn(),
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
    create: mocks.candidateCreate,
    updateOne: mocks.candidateUpdateOne,
  },
}));

vi.mock("@/lib/server/models/import-job", () => ({
  ImportJobModel: {
    create: mocks.importJobCreate,
    findOne: mocks.importJobFindOne,
  },
}));

vi.mock("@/lib/server/models/sync-job", () => ({
  SyncJobModel: {
    findOne: mocks.syncJobFindOne,
    create: mocks.syncJobCreate,
  },
}));

vi.mock("@/lib/server/models/outbox-event", () => ({
  OutboxEventModel: {
    create: mocks.outboxEventCreate,
  },
}));

vi.mock("@/lib/server/models/program", () => ({
  ProgramModel: {
    findOne: mocks.programFindOne,
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
  createCandidateImportJob,
  linkExistingSidhCandidate,
  queueCandidateSync,
} from "@/lib/server/services/candidates";
import { createCandidateSchema } from "@/lib/server/validation";

function createSelectQuery<T>(value: T) {
  return {
    select: vi.fn().mockResolvedValue(value),
  };
}

async function buildWorkbook(rows: Array<Record<string, unknown>>) {
  return writeWorkbookToArrayBuffer([{ name: "Candidates", rows }]);
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
          state: "Odisha",
          district: "Khordha",
        },
        permanentAddress: {
          address: "Plot 1",
          state: "Odisha",
          district: "Khordha",
          pinCode: "751001",
          city: "Bhubaneswar",
          tehsil: "Bhubaneswar",
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

  it("stages import rows with valid and invalid counts", async () => {
    mocks.candidateFindOne.mockReturnValue(createSelectQuery(null));
    mocks.importJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);

    const workbook = await buildWorkbook([
      {
        FullName: "Rohit Kumar",
        Gender: "Male",
        DateofBirth: "10/06/2005",
        FathersName: "Suresh Kumar",
        IDType: "Alternate ID",
        TypeofAlternateID: "Voter ID Card",
        IDNo: "ABC1234567",
        CountryCode: "91",
        MobileNo: "9876543210",
        DomicileState: "Odisha",
        DomicileDistrict: "Khordha",
        PermanentAddressAddress: "Plot 1",
        PermanentAddressState: "Odisha",
        PermanentAddressDistrict: "Khordha",
        PermanentAddressPINCode: "751001",
        PermanentAddressCity: "Bhubaneswar",
        PermanentAddressTehsil: "Bhubaneswar",
        PermanentAddressConstituency: "Central",
        CommunicationSameasPermanentAddress: "Yes",
        TrainingStatus: "Fresher",
        HeardAboutUs: "Training Provider",
      },
      {
        FullName: "Missing Mobile",
        Gender: "Male",
        DateofBirth: "10/06/2005",
        FathersName: "Parent",
        IDType: "Alternate ID",
        TypeofAlternateID: "Voter ID Card",
        IDNo: "BAD123",
        CountryCode: "91",
        MobileNo: "",
        DomicileState: "Odisha",
        DomicileDistrict: "Khordha",
        PermanentAddressAddress: "Plot 2",
        PermanentAddressState: "Odisha",
        PermanentAddressDistrict: "Khordha",
        PermanentAddressPINCode: "751001",
        PermanentAddressCity: "Bhubaneswar",
        PermanentAddressTehsil: "Bhubaneswar",
        PermanentAddressConstituency: "Central",
        CommunicationSameasPermanentAddress: "Yes",
        TrainingStatus: "Fresher",
        HeardAboutUs: "Training Provider",
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
    expect(mocks.importJobCreate).toHaveBeenCalledTimes(1);
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
        state: "Odisha",
        district: "Khordha",
        pinCode: "751001",
        city: "Bhubaneswar",
        tehsil: "Bhubaneswar",
        constituency: "Central",
      },
      communicationAddress: {
        sameAsPermanent: true,
        address: "Plot 1",
        state: "Odisha",
        district: "Khordha",
        pinCode: "751001",
        city: "Bhubaneswar",
        tehsil: "Bhubaneswar",
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

  it("commits valid import rows into candidates and queues sync", async () => {
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
              state: "Odisha",
              district: "Khordha",
            },
            permanentAddress: {
              address: "Plot 1",
              state: "Odisha",
              district: "Khordha",
              pinCode: "751001",
              city: "Bhubaneswar",
              tehsil: "Bhubaneswar",
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
    mocks.syncJobCreate.mockImplementation(async (value: Record<string, unknown>) => value);

    const result = await commitCandidateImportJob(actor as never, "imp_001");

    expect(result.committedRows).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(mocks.syncJobCreate).toHaveBeenCalledTimes(1);
  });
});