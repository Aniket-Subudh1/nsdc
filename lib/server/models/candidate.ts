import mongoose, { type InferSchemaType, type Model } from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    address: {
      type: String,
      trim: true,
      default: null,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    district: {
      type: String,
      trim: true,
      default: null,
    },
    pinCode: {
      type: String,
      trim: true,
      default: null,
    },
    city: {
      type: String,
      trim: true,
      default: null,
    },
    tehsil: {
      type: String,
      trim: true,
      default: null,
    },
    constituency: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false },
);

const communicationAddressSchema = new mongoose.Schema(
  {
    sameAsPermanent: {
      type: Boolean,
      default: true,
    },
    address: {
      type: String,
      trim: true,
      default: null,
    },
    state: {
      type: String,
      trim: true,
      default: null,
    },
    district: {
      type: String,
      trim: true,
      default: null,
    },
    pinCode: {
      type: String,
      trim: true,
      default: null,
    },
    city: {
      type: String,
      trim: true,
      default: null,
    },
    tehsil: {
      type: String,
      trim: true,
      default: null,
    },
    constituency: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false },
);

const candidateSchema = new mongoose.Schema(
  {
    candidateId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    registrationMode: {
      type: String,
      enum: ["internal_registration", "existing_sidh_link"],
      required: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedFullName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    salutation: {
      type: String,
      trim: true,
      default: null,
    },
    gender: {
      type: String,
      trim: true,
      default: null,
    },
    dateOfBirth: {
      type: Date,
      required: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    maritalStatus: {
      type: String,
      trim: true,
      default: null,
    },
    fathersName: {
      type: String,
      trim: true,
      default: null,
    },
    mothersName: {
      type: String,
      trim: true,
      default: null,
    },
    guardiansName: {
      type: String,
      trim: true,
      default: null,
    },
    religion: {
      type: String,
      trim: true,
      default: null,
    },
    category: {
      type: String,
      trim: true,
      default: null,
    },
    disability: {
      type: Boolean,
      default: false,
    },
    typeOfDisability: {
      type: String,
      trim: true,
      default: null,
    },
    domicileState: {
      type: String,
      trim: true,
      default: null,
    },
    domicileDistrict: {
      type: String,
      trim: true,
      default: null,
    },
    idType: {
      type: String,
      trim: true,
      required: true,
    },
    typeOfAlternateId: {
      type: String,
      trim: true,
      default: null,
    },
    aadhaarReferenceNo: {
      type: String,
      trim: true,
      default: null,
    },
    idNumber: {
      type: String,
      trim: true,
      default: null,
    },
    normalizedIdNumber: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    countryCode: {
      type: String,
      trim: true,
      default: "91",
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    educationLevel: {
      type: String,
      trim: true,
      default: null,
    },
    permanentAddress: {
      type: addressSchema,
      required: true,
    },
    communicationAddress: {
      type: communicationAddressSchema,
      required: true,
    },
    trainingStatus: {
      type: String,
      trim: true,
      default: null,
    },
    previousExperienceSector: {
      type: String,
      trim: true,
      default: null,
    },
    monthsOfPreviousExperience: {
      type: Number,
      default: null,
    },
    employed: {
      type: String,
      trim: true,
      default: null,
    },
    employmentStatus: {
      type: String,
      trim: true,
      default: null,
    },
    employmentDetails: {
      type: String,
      trim: true,
      default: null,
    },
    heardAboutUs: {
      type: String,
      trim: true,
      default: null,
    },
    programId: {
      type: String,
      required: true,
      index: true,
    },
    centerId: {
      type: String,
      required: true,
      index: true,
    },
    centerName: {
      type: String,
      trim: true,
      default: null,
    },
    referenceCourseId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    referenceCourseName: {
      type: String,
      trim: true,
      default: null,
    },
    duplicateHash: {
      type: String,
      required: true,
      index: true,
    },
    sidhCandidateId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    syncState: {
      status: {
        type: String,
        enum: ["not_queued", "queued", "processing", "synced", "failed", "manual_review", "linked"],
        default: "not_queued",
        index: true,
      },
      lastJobId: {
        type: String,
        default: null,
      },
      lastAttemptAt: {
        type: Date,
        default: null,
      },
      lastSuccessAt: {
        type: Date,
        default: null,
      },
      lastFailureCode: {
        type: String,
        default: null,
      },
      lastFailureMessage: {
        type: String,
        default: null,
      },
      retryCount: {
        type: Number,
        default: 0,
      },
    },
    sourceImportJobId: {
      type: String,
      default: null,
      index: true,
    },
    createdByUserId: {
      type: String,
      default: null,
    },
    updatedByUserId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

candidateSchema.index({ duplicateHash: 1, programId: 1, centerId: 1 }, { unique: true });
candidateSchema.index({ normalizedFullName: 1, dateOfBirth: 1, mobileNumber: 1 });

export type CandidateDocument = InferSchemaType<typeof candidateSchema>;

export const CandidateModel =
  (mongoose.models.Candidate as Model<CandidateDocument> | undefined) ??
  mongoose.model<CandidateDocument>("Candidate", candidateSchema);