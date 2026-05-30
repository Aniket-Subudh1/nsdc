import { connectToDatabase } from "@/lib/server/mongodb";
import { ReferenceValueModel } from "@/lib/server/models/reference-value";
import { RoleModel } from "@/lib/server/models/role";
import { ROLE_KEYS, ROLE_PERMISSIONS } from "@/lib/server/rbac";

const referenceSeedValues = [
  { category: "salutation", code: "mr", label: "Mr", sortOrder: 1 },
  { category: "salutation", code: "ms", label: "Ms", sortOrder: 2 },
  { category: "salutation", code: "mrs", label: "Mrs", sortOrder: 3 },
  { category: "gender", code: "male", label: "Male", sortOrder: 1 },
  { category: "gender", code: "female", label: "Female", sortOrder: 2 },
  { category: "gender", code: "other", label: "Other", sortOrder: 3 },
  { category: "marital_status", code: "single", label: "Single/Unmarried", sortOrder: 1 },
  { category: "marital_status", code: "married", label: "Married", sortOrder: 2 },
  { category: "religion", code: "hinduism", label: "Hinduism", sortOrder: 1 },
  { category: "religion", code: "islam", label: "Islam", sortOrder: 2 },
  { category: "religion", code: "christianity", label: "Christianity", sortOrder: 3 },
  { category: "category", code: "general", label: "General", sortOrder: 1 },
  { category: "category", code: "obc", label: "OBC", sortOrder: 2 },
  { category: "category", code: "sc", label: "SC", sortOrder: 3 },
  { category: "category", code: "st", label: "ST", sortOrder: 4 },
  { category: "education_level", code: "below_10th", label: "Below 10th", sortOrder: 1 },
  { category: "education_level", code: "10th", label: "10th Pass", sortOrder: 2 },
  { category: "education_level", code: "12th", label: "12th Pass", sortOrder: 3 },
  { category: "education_level", code: "graduate", label: "Graduate", sortOrder: 4 },
  { category: "id_type", code: "aadhaar", label: "Aadhaar", sortOrder: 1 },
  { category: "id_type", code: "alternate_id", label: "Alternate ID", sortOrder: 2 },
  { category: "alternate_id_type", code: "voter_id", label: "Voter ID Card", sortOrder: 1 },
  { category: "alternate_id_type", code: "driving_license", label: "Driving License", sortOrder: 2 },
  { category: "alternate_id_type", code: "passport", label: "Passport", sortOrder: 3 },
  { category: "training_status", code: "fresher", label: "Fresher", sortOrder: 1 },
  { category: "training_status", code: "experienced", label: "Experienced", sortOrder: 2 },
  { category: "heard_about_us", code: "training_provider", label: "Training Provider", sortOrder: 1 },
  { category: "heard_about_us", code: "community_outreach", label: "Community Outreach", sortOrder: 2 },
  { category: "heard_about_us", code: "referral", label: "Referral", sortOrder: 3 },
];

let bootstrapPromise: Promise<void> | undefined;

export async function ensureBootstrapData() {
  if (!bootstrapPromise) {
    bootstrapPromise = seedBootstrapData();
  }

  return bootstrapPromise;
}

async function seedBootstrapData() {
  await connectToDatabase();

  await Promise.all([
    ...ROLE_KEYS.map((key) =>
      RoleModel.updateOne(
        { key },
        {
          $set: {
            key,
            name: key.replaceAll("_", " "),
            permissions: ROLE_PERMISSIONS[key],
          },
        },
        { upsert: true },
      ),
    ),
    ...referenceSeedValues.map((entry) =>
      ReferenceValueModel.updateOne(
        { category: entry.category, code: entry.code },
        {
          $set: {
            category: entry.category,
            code: entry.code,
            label: entry.label,
            sortOrder: entry.sortOrder,
            status: "active",
          },
        },
        { upsert: true },
      ),
    ),
  ]);
}