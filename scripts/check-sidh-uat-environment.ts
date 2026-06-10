import { constants, publicEncrypt } from "node:crypto";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type CheckResult = {
  detail?: string;
  name: string;
  ok: boolean;
};

function normalizePublicKey(publicKey: string) {
  const trimmed = publicKey.trim();

  if (trimmed.includes("BEGIN PUBLIC KEY")) {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n");
  }

  const compact = trimmed.replace(/\s+/g, "");
  const wrapped = compact.match(/.{1,64}/g)?.join("\n") ?? compact;
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}

function extractValue(payload: unknown, keys: string[]): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return extractValue(record.data, keys) ?? extractValue(record.result, keys);
}

function encryptPassword(password: string, publicKey: string, secretKey: string) {
  const encryptedPassword = publicEncrypt(
    {
      key: normalizePublicKey(publicKey),
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(password, "utf8"),
  ).toString("base64");

  return `${encryptedPassword}${secretKey.trim()}`;
}

function getCookieHeader(headers: Headers) {
  const setCookies = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookieParts = (setCookies.length > 0 ? setCookies : (headers.get("set-cookie") ?? "").split(/,(?=\s*[^;,\s]+=)/))
    .map((cookie) => cookie.split(";")[0]?.trim())
    .filter(Boolean);

  return cookieParts.length > 0 ? cookieParts.join("; ") : "";
}

function summarizeBody(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const summary: Record<string, unknown> = {};

    for (const key of ["message", "error", "errorMessage", "status", "code"]) {
      if (parsed[key] !== undefined) {
        summary[key] = parsed[key];
      }
    }

    if (parsed.token || parsed.accessToken) {
      summary.authenticated = true;
    }

    return JSON.stringify(summary).slice(0, 240);
  } catch {
    return trimmed.slice(0, 240);
  }
}

async function runCheck(name: string, fn: () => Promise<string | undefined>): Promise<CheckResult> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const environment = process.env.SIDH_ENV === "production" ? "production" : "uat";
  const baseUrl = environment === "production" ? process.env.SIDH_PROD_BASE_URL : process.env.SIDH_UAT_BASE_URL;
  const username = environment === "production" ? process.env.SIDH_PROD_USERNAME : process.env.SIDH_UAT_USERNAME;
  const password = environment === "production" ? process.env.SIDH_PROD_PASSWORD : process.env.SIDH_UAT_PASSWORD;
  const tpId = ((environment === "production" ? process.env.SIDH_PROD_TP_ID : process.env.SIDH_UAT_TP_ID) || username || "").trim();

  console.log("SIDH environment health check");
  console.log("=".repeat(48));
  console.log(`Environment : ${environment}`);
  console.log(`Base URL    : ${baseUrl ?? "(missing)"}`);
  console.log(`Username    : ${username ? `${username.slice(0, 2)}***` : "(missing)"}`);
  console.log(`TP ID       : ${tpId ? `${tpId.slice(0, 2)}***` : "(missing)"}`);
  console.log("");

  if (!baseUrl || !username || !password || !tpId) {
    console.error("FAIL: Missing SIDH configuration in .env");
    process.exitCode = 1;
    return;
  }

  const checks: CheckResult[] = [];
  let csrfToken = "";
  let csrfCookie = "";
  let accessToken = "";

  checks.push(
    await runCheck("Base URL reachable", async () => {
      const response = await fetch(new URL("/api/user/v1", baseUrl), {
        headers: { Accept: "application/json" },
        method: "HEAD",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return `HTTP ${response.status}`;
    }),
  );

  checks.push(
    await runCheck("CSRF bootstrap", async () => {
      const response = await fetch(new URL("/api/user/v1", baseUrl), {
        headers: { Accept: "application/json" },
        method: "HEAD",
      });

      csrfToken = response.headers.get("x-csrf-token")?.trim() ?? "";
      csrfCookie = getCookieHeader(response.headers);

      if (!csrfToken) {
        throw new Error("Missing x-csrf-token header");
      }

      return csrfCookie ? "CSRF token and session cookie received" : "CSRF token received";
    }),
  );

  checks.push(
    await runCheck("Public key bootstrap", async () => {
      const response = await fetch(new URL("/api/user/v1/getkey", baseUrl), {
        headers: {
          Accept: "application/json",
          "x-csrf-token": csrfToken,
          ...(csrfCookie ? { Cookie: csrfCookie } : {}),
        },
      });
      const text = await response.text();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${summarizeBody(text)}`);
      }

      let payload: unknown = text;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }

      const publicKey = extractValue(payload, ["publicKey", "public_key", "key"]);
      const secretKey = extractValue(payload, ["secretKey", "secret_key", "secret"]);

      if (!publicKey || !secretKey) {
        throw new Error("getkey response did not include public/secret keys");
      }

      return "Public and secret keys received";
    }),
  );

  checks.push(
    await runCheck("App-style login", async () => {
      const loginCsrfResponse = await fetch(new URL("/api/user/v1", baseUrl), {
        headers: { Accept: "application/json" },
        method: "HEAD",
      });
      const loginCsrfToken = loginCsrfResponse.headers.get("x-csrf-token")?.trim() ?? csrfToken;
      const loginCookie = getCookieHeader(loginCsrfResponse.headers) || csrfCookie;

      const keyResponse = await fetch(new URL("/api/user/v1/getkey", baseUrl), {
        headers: {
          Accept: "application/json",
          "x-csrf-token": loginCsrfToken,
          ...(loginCookie ? { Cookie: loginCookie } : {}),
        },
      });
      const keyText = await keyResponse.text();

      if (!keyResponse.ok) {
        throw new Error(`getkey failed with HTTP ${keyResponse.status}`);
      }

      const keyPayload = JSON.parse(keyText) as Record<string, unknown>;
      const publicKey = extractValue(keyPayload, ["publicKey", "public_key", "key"]);
      const secretKey = extractValue(keyPayload, ["secretKey", "secret_key", "secret"]);

      if (!publicKey || !secretKey) {
        throw new Error("Unable to read encryption keys for login");
      }

      const loginResponse = await fetch(new URL("/api/user/v1/login", baseUrl), {
        body: JSON.stringify({
          password: encryptPassword(password, publicKey, secretKey),
          userName: username,
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-csrf-token": loginCsrfToken,
          ...(loginCookie ? { Cookie: loginCookie } : {}),
        },
        method: "POST",
      });
      const loginText = await loginResponse.text();

      if (!loginResponse.ok) {
        throw new Error(`HTTP ${loginResponse.status}: ${summarizeBody(loginText)}`);
      }

      let loginPayload: unknown = loginText;
      try {
        loginPayload = JSON.parse(loginText);
      } catch {
        loginPayload = loginText;
      }

      accessToken = extractValue(loginPayload, ["accessToken", "token", "authToken", "jwt"]) ?? "";

      if (!accessToken) {
        throw new Error("Login succeeded but no access token was returned");
      }

      return "Authenticated successfully";
    }),
  );

  checks.push(
    await runCheck("Authenticated session usable", async () => {
      if (!accessToken) {
        throw new Error("Skipped because login did not return a token");
      }

      const response = await fetch(new URL("/api/user/v1/getkey", baseUrl), {
        headers: {
          Accept: "application/json",
          Authorization: accessToken,
          "x-csrf-token": csrfToken,
          ...(csrfCookie ? { Cookie: csrfCookie } : {}),
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${summarizeBody(text)}`);
      }

      return `Authenticated request OK (HTTP ${response.status})`;
    }),
  );

  console.log("Checks");
  console.log("-".repeat(48));

  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`${status.padEnd(5)} ${check.name}${check.detail ? ` — ${check.detail}` : ""}`);
  }

  const passed = checks.filter((check) => check.ok).length;
  const failed = checks.length - passed;

  console.log("");
  console.log("Summary");
  console.log("-".repeat(48));
  console.log(`Passed: ${passed}/${checks.length}`);
  console.log(`Failed: ${failed}/${checks.length}`);

  if (failed === 0) {
    console.log("");
    console.log("UAT environment is working for SIDH authentication.");
  } else {
    console.log("");
    console.log("UAT environment is NOT fully working. Review failed checks above.");
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
