import { connectToDatabase } from "@/lib/server/mongodb";
import { RoleModel } from "@/lib/server/models/role";
import { ROLE_KEYS, ROLE_PERMISSIONS } from "@/lib/server/rbac";

let bootstrapPromise: Promise<void> | undefined;

export async function ensureBootstrapData() {
  if (!bootstrapPromise) {
    bootstrapPromise = seedRoles();
  }

  return bootstrapPromise;
}

async function seedRoles() {
  await connectToDatabase();

  await Promise.all(
    ROLE_KEYS.map((key) =>
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
  );
}