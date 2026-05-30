import { hashPassword } from "../lib/server/auth";
import { createEnv } from "../lib/server/env";
import { ensureBootstrapData } from "../lib/server/bootstrap";
import { createPrefixedId } from "../lib/server/ids";
import { connectToDatabase } from "../lib/server/mongodb";
import { UserModel } from "../lib/server/models/user";

async function main() {
  const env = createEnv(process.env);

  await connectToDatabase();
  await ensureBootstrapData();

  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);

  const result = await UserModel.findOneAndUpdate(
    { email: env.SEED_ADMIN_EMAIL.toLowerCase() },
    {
      $set: {
        name: env.SEED_ADMIN_NAME,
        email: env.SEED_ADMIN_EMAIL.toLowerCase(),
        passwordHash,
        roles: ["platform_admin"],
        centerIds: [],
        status: "active",
        mustChangePassword: false,
      },
      $setOnInsert: {
        userId: createPrefixedId("usr"),
      },
    },
    {
      upsert: true,
      new: true,
    },
  );

  console.log(`Seeded admin user: ${result.email}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });