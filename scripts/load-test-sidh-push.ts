import { loadEnvConfig } from "@next/env";
import { setTimeout as delay } from "node:timers/promises";

import { getEnv } from "@/lib/server/env";
import { connectToDatabase } from "@/lib/server/mongodb";
import { createInMemoryCircuitBreaker } from "@/lib/server/queue/circuit-breaker";
import { createInMemoryRateLimiter } from "@/lib/server/queue/rate-limiter";
import { createSidhConnector, type CandidateRegistrationPayload } from "@/lib/server/services/sidh-connector";

loadEnvConfig(process.cwd());


type Options = {
  concurrency: number;
  durationSec: number;
  liveRegister: boolean;
  ratePerSec: number;
  sample: number;
  understand: boolean;
};

function clampInteger(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), max);
}

function parseOptions(): Options {
  const args = process.argv.slice(2);
  let concurrency = 8;
  let ratePerSec = 10;
  let durationSec = 30;
  let sample = 40;
  let liveRegister = false;
  let understand = false;

  for (const argument of args) {
    if (argument.startsWith("--concurrency=")) {
      concurrency = clampInteger(argument.split("=")[1], concurrency, 64);
    } else if (argument.startsWith("--rate=")) {
      ratePerSec = clampInteger(argument.split("=")[1], ratePerSec, 200);
    } else if (argument.startsWith("--duration-sec=")) {
      durationSec = clampInteger(argument.split("=")[1], durationSec, 600);
    } else if (argument.startsWith("--sample=")) {
      sample = clampInteger(argument.split("=")[1], sample, 500);
    } else if (argument === "--live-register") {
      liveRegister = true;
    } else if (argument === "--i-understand") {
      understand = true;
    }
  }

  return { concurrency, durationSec, liveRegister, ratePerSec, sample, understand };
}

function buildSyntheticPayload(index: number): CandidateRegistrationPayload {
  const suffix = String(Date.now()).slice(-6) + String(index).padStart(3, "0");
  return {
    ContactDetails: {
      CountryCode: "+91",
      Phone: `9${suffix.slice(0, 9)}`.padEnd(10, "0"),
    },
    PersonalDetails: {
      DOB: "2000-01-15",
      FatherName: "Load Test Father",
      FirstName: `LoadTest Candidate ${suffix}`,
      Gender: "Male",
      NamePrefix: "Mr",
    },
  };
}

function percentile(sorted: number[], ratio: number) {
  if (sorted.length === 0) {
    return 0;
  }

  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))] ?? 0;
}

async function main() {
  const options = parseOptions();
  const env = getEnv();

  if (env.SIDH_ENV !== "uat") {
    throw new Error("Load test may only run against SIDH_ENV=uat");
  }

  if (options.liveRegister && !options.understand) {
    throw new Error("Refusing --live-register without --i-understand (creates real SIDH candidates in UAT)");
  }

  await connectToDatabase();

  const connector = createSidhConnector({ env });
  const rateLimiter = createInMemoryRateLimiter(options.ratePerSec);
  const circuitBreaker = createInMemoryCircuitBreaker({
    cooldownMs: env.SIDH_CIRCUIT_BREAKER_COOLDOWN_MS,
    failureThreshold: env.SIDH_CIRCUIT_BREAKER_THRESHOLD,
    minSamples: env.SIDH_CIRCUIT_BREAKER_MIN_SAMPLES,
  });

  const targetAttempts = options.liveRegister ? Number.POSITIVE_INFINITY : options.sample;
  const endsAt = options.liveRegister ? Date.now() + options.durationSec * 1000 : Number.POSITIVE_INFINITY;
  const startedAt = Date.now();
  let attemptIndex = 0;
  let succeeded = 0;
  let failed = 0;
  const latencies: number[] = [];

  console.log(
    JSON.stringify(
      {
        concurrency: options.concurrency,
        durationSec: options.liveRegister ? options.durationSec : null,
        mode: options.liveRegister ? "live-soak" : "timed-sample",
        ratePerSec: options.ratePerSec,
        sample: options.liveRegister ? null : options.sample,
        sidhEnv: env.SIDH_ENV,
        warning: "This script calls SIDH candidate registration in UAT.",
      },
      null,
      2,
    ),
  );

  const workers = Array.from({ length: options.concurrency }, async () => {
    while (attemptIndex < targetAttempts && Date.now() < endsAt) {
      if (await circuitBreaker.isOpen()) {
        await delay(250);
        continue;
      }

      const index = (attemptIndex += 1);
      if (index > targetAttempts) {
        break;
      }

      await rateLimiter.acquire();
      const callStarted = Date.now();

      try {
        await connector.registerCandidate({
          attemptId: `loadtest-${index}`,
          payload: buildSyntheticPayload(index),
          syncJobId: `loadtest-job-${index}`,
        });
        await circuitBreaker.recordSuccess();
        succeeded += 1;
      } catch {
        await circuitBreaker.recordFailure();
        failed += 1;
      } finally {
        latencies.push(Date.now() - callStarted);
      }
    }
  });

  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const elapsedSec = Math.max(0.001, (Date.now() - startedAt) / 1000);
  const throughput = (succeeded + failed) / elapsedSec;
  const estimated50kMinutes = throughput > 0 ? 50_000 / throughput / 60 : null;

  console.log(
    JSON.stringify(
      {
        elapsedSec: Number(elapsedSec.toFixed(2)),
        estimated50kMinutes: estimated50kMinutes === null ? null : Number(estimated50kMinutes.toFixed(1)),
        failed,
        latencyMs: {
          p50: percentile(latencies, 0.5),
          p95: percentile(latencies, 0.95),
        },
        recommendation: {
          SIDH_PUSH_CONCURRENCY: options.concurrency,
          SIDH_RATE_LIMIT_PER_SEC: options.ratePerSec,
          note:
            estimated50kMinutes !== null && estimated50kMinutes <= 60
              ? "Current settings can finish ~50k candidate pushes within about an hour on UAT-like latency."
              : "Raise concurrency/rate carefully until estimated50kMinutes <= 60, watching SIDH error rate.",
        },
        succeeded,
        totalAttempts: succeeded + failed,
        throughputPerSec: Number(throughput.toFixed(2)),
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
