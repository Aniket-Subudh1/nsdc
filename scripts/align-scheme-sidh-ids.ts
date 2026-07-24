import { loadEnvConfig } from "@next/env";

import { resolveSidhSchemeKey } from "@/lib/sidh-batch-payload";
import { connectToDatabase } from "@/lib/server/mongodb";
import { SchemeModel } from "@/lib/server/models/scheme";

loadEnvConfig(process.cwd());

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  await connectToDatabase();

  const schemes = await SchemeModel.find({
    $or: [
      { sidhSchemeId: { $nin: [null, ""] } },
      { sidhSchemeReferenceId: { $nin: [null, ""] } },
    ],
  })
    .select({
      schemeId: 1,
      name: 1,
      code: 1,
      sidhSchemeId: 1,
      sidhSchemeReferenceId: 1,
    })
    .lean();

  let aligned = 0;
  let skipped = 0;

  for (const scheme of schemes) {
    const currentId = String(scheme.sidhSchemeId ?? "").trim();
    const currentRef = String(scheme.sidhSchemeReferenceId ?? "").trim();
    const schemeKey = resolveSidhSchemeKey({
      sidhSchemeId: currentId || null,
      sidhSchemeReferenceId: currentRef || null,
    });

    if (!schemeKey) {
      skipped += 1;
      console.log(`Skip ${scheme.schemeId} (${scheme.code}): no usable SIDH scheme key`);
      continue;
    }

    if (currentId === schemeKey && currentRef === schemeKey) {
      skipped += 1;
      continue;
    }

    console.log(
      `${dryRun ? "Would align" : "Align"} ${scheme.schemeId} (${scheme.code}): ` +
        `${currentId || "(empty)"} / ${currentRef || "(empty)"} -> ${schemeKey} / ${schemeKey}`,
    );

    if (!dryRun) {
      await SchemeModel.updateOne(
        { schemeId: scheme.schemeId },
        {
          $set: {
            sidhSchemeId: schemeKey,
            sidhSchemeReferenceId: schemeKey,
          },
        },
      );
    }

    aligned += 1;
  }

  console.log(
    `${dryRun ? "Dry run complete" : "Alignment complete"}: ${aligned} scheme(s) ${
      dryRun ? "would be updated" : "updated"
    }, ${skipped} unchanged/skipped.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
