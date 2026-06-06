import {
  parseUserDateInput,
  toSidhDate,
  toSidhDateTime,
} from "@/lib/server/sidh-payload";
import type {
  BatchCreationPayload,
  CandidateRegistrationPayload,
  TrainingAssessmentPayload,
} from "@/lib/server/services/sidh-connector";

function toSidhDateField(value: string) {
  return toSidhDate(value);
}

function toSidhDateTimeField(value: string) {
  return toSidhDateTime(value);
}

export function normalizeCandidateRegistrationPayload(payload: CandidateRegistrationPayload): CandidateRegistrationPayload {
  return {
    ...payload,
    PersonalDetails: {
      ...payload.PersonalDetails,
      DOB: toSidhDateField(payload.PersonalDetails.DOB),
    },
  };
}

export function normalizeBatchCreationPayload(payload: BatchCreationPayload): BatchCreationPayload {
  return {
    ...payload,
    assessmentEndDate: toSidhDateField(payload.assessmentEndDate),
    assessmentStartDate: toSidhDateField(payload.assessmentStartDate),
    batchEndDate: toSidhDateField(payload.batchEndDate),
    batchEndTime: toSidhDateTimeField(payload.batchEndTime),
    batchStartDate: toSidhDateField(payload.batchStartDate),
    batchStartTime: toSidhDateTimeField(payload.batchStartTime),
  };
}

export function normalizeTrainingAssessmentPayload(payload: TrainingAssessmentPayload): TrainingAssessmentPayload {
  return {
    ...payload,
    candidates: payload.candidates.map((candidate) => ({
      ...candidate,
      assessmentDetails: {
        ...candidate.assessmentDetails,
        assessmentDataUploadedOn: toSidhDateField(candidate.assessmentDetails.assessmentDataUploadedOn),
      },
      certificationDetails: {
        ...candidate.certificationDetails,
        certificationDate: toSidhDateField(candidate.certificationDetails.certificationDate),
      },
    })),
  };
}

export { parseUserDateInput, toSidhDate, toSidhDateTime };
