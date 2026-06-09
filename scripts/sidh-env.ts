import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadEnvConfig } from "@next/env";

import { createEnv, getSidhBaseUrl, getSidhCredentials } from "@/lib/server/env";

loadEnvConfig(process.cwd());

type SidhEnvironment = "uat" | "production";

const envPath = resolve(process.cwd(), ".env");

function readEnvFile() {
  return readFileSync(envPath, "utf8");
}

function parseSidhEnv(content: string): SidhEnvironment {
  const match = content.match(/^SIDH_ENV=["']?(uat|production)["']?\s*$/m);
  return match?.[1] === "production" ? "production" : "uat";
}

function setSidhEnv(content: string, target: SidhEnvironment) {
  if (/^SIDH_ENV=/m.test(content)) {
    return content.replace(/^SIDH_ENV=.*$/m, `SIDH_ENV="${target}"`);
  }

  return `${content.trimEnd()}\nSIDH_ENV="${target}"\n`;
}

function mask(value: string) {
  if (!value.trim()) {
    return "(not set)";
  }

  if (value.length <= 4) {
    return "***";
  }

  return `${value.slice(0, 2)}***`;
}

function printStatus(environment: SidhEnvironment) {
  process.env.SIDH_ENV = environment;
  const env = createEnv(process.env);
  const credentials = getSidhCredentials(env);

  console.log("SIDH environment");
  console.log("=".repeat(40));
  console.log(`Active env : ${environment}`);
  console.log(`Base URL   : ${getSidhBaseUrl(env)}`);
  console.log(`Username   : ${mask(credentials.username)}`);
  console.log(`TP ID      : ${mask(credentials.tpId)}`);
  console.log("");
  console.log("Switch:");
  console.log("  npm run sidh:env:uat");
  console.log("  npm run sidh:env:production");
  console.log("");
  console.log("After switching, restart `npm run dev` so the app picks up the change.");
}

function main() {
  const targetArg = process.argv[2]?.trim().toLowerCase();

  if (targetArg && targetArg !== "uat" && targetArg !== "production") {
    console.error("Usage: npm run sidh:env -- [uat|production]");
    process.exitCode = 1;
    return;
  }

  const content = readEnvFile();
  const current = parseSidhEnv(content);
  const target = (targetArg as SidhEnvironment | undefined) ?? current;

  if (targetArg && target !== current) {
    writeFileSync(envPath, setSidhEnv(content, target), "utf8");
    console.log(`Switched SIDH_ENV: ${current} -> ${target}`);
    console.log("");
  } else if (targetArg) {
    console.log(`SIDH_ENV is already set to ${current}.`);
    console.log("");
  }

  printStatus(targetArg ? target : current);
}

main();
