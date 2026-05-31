import { constants, publicEncrypt } from "node:crypto";

import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

type LoginVariant = {
  body: string | URLSearchParams;
  headers: Record<string, string>;
  name: string;
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

function encryptPasswordFromDoc(password: string, publicKey: string, secretKey: string) {
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

function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactPayload(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /authorization|cookie|password|token|secret/i.test(key) ? "[REDACTED]" : redactPayload(entry),
    ]),
  );
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

    if (parsed.data && typeof parsed.data === "object") {
      summary.dataKeys = Object.keys(parsed.data as Record<string, unknown>).slice(0, 8);
    }

    return JSON.stringify(redactPayload(Object.keys(summary).length > 0 ? summary : parsed)).slice(0, 300);
  } catch {
    return trimmed.slice(0, 300);
  }
}

async function main() {
  const environment = process.env.SIDH_ENV === "production" ? "production" : "uat";
  const baseUrl = environment === "production" ? process.env.SIDH_PROD_BASE_URL : process.env.SIDH_UAT_BASE_URL;
  const username = environment === "production" ? process.env.SIDH_PROD_USERNAME : process.env.SIDH_UAT_USERNAME;
  const password = environment === "production" ? process.env.SIDH_PROD_PASSWORD : process.env.SIDH_UAT_PASSWORD;
  const tpId = ((environment === "production" ? process.env.SIDH_PROD_TP_ID : process.env.SIDH_UAT_TP_ID) || username || "").trim();

  if (!baseUrl || !username || !password || !tpId) {
    throw new Error(`Missing SIDH ${environment} configuration`);
  }

  console.log(JSON.stringify({ environment, hasUsername: Boolean(username), hasPassword: Boolean(password), hasTpId: Boolean(tpId) }));

  const csrfResponse = await fetch(new URL("/api/user/v1", baseUrl), {
    headers: { Accept: "application/json" },
    method: "HEAD",
  });
  const csrfToken = csrfResponse.headers.get("x-csrf-token")?.trim() ?? "";
  const csrfCookie = getCookieHeader(csrfResponse.headers);

  console.log(JSON.stringify({ step: "csrf", status: csrfResponse.status, ok: csrfResponse.ok, hasToken: Boolean(csrfToken), hasCookie: Boolean(csrfCookie) }));

  const keyResponse = await fetch(new URL("/api/user/v1/getkey", baseUrl), {
    headers: {
      Accept: "application/json",
      "x-csrf-token": csrfToken,
      ...(csrfCookie ? { Cookie: csrfCookie } : {}),
    },
  });
  const keyText = await keyResponse.text();
  let keyPayload: unknown = keyText;

  try {
    keyPayload = JSON.parse(keyText);
  } catch {
    keyPayload = keyText;
  }

  const publicKey = extractValue(keyPayload, ["publicKey", "public_key", "key"]);
  const secretKey = extractValue(keyPayload, ["secretKey", "secret_key", "secret"]);

  console.log(JSON.stringify({ step: "getkey", status: keyResponse.status, ok: keyResponse.ok, hasPublicKey: Boolean(publicKey), hasSecret: Boolean(secretKey) }));

  if (!publicKey || !secretKey) {
    return;
  }

  const documentedPassword = encryptPasswordFromDoc(password, publicKey, secretKey);
  const variants: LoginVariant[] = [
    {
      body: JSON.stringify({ userName: username, password: documentedPassword }),
      headers: { "Content-Type": "application/json" },
      name: "json_userName_doc_encrypted_without_tp",
    },
    {
      body: new URLSearchParams({ username, password: documentedPassword, tpId }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      name: "form_doc_encrypted_with_tp",
    },
    {
      body: new URLSearchParams({ username, password: documentedPassword }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      name: "form_doc_encrypted_without_tp",
    },
    {
      body: JSON.stringify({ username, password: documentedPassword, tpId }),
      headers: { "Content-Type": "application/json" },
      name: "json_doc_encrypted_with_tp",
    },
    {
      body: new URLSearchParams({
        username: Buffer.from(username, "utf8").toString("base64"),
        password: Buffer.from(password, "utf8").toString("base64"),
        tpId: Buffer.from(tpId, "utf8").toString("base64"),
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      name: "form_base64_doc_note",
    },
    {
      body: new URLSearchParams({ username, password, tpId }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      name: "form_raw",
    },
  ];

  for (const variant of variants) {
    const loginResponse = await fetch(new URL("/api/user/v1/login", baseUrl), {
      body: variant.body,
      headers: {
        Accept: "application/json",
        "x-csrf-token": csrfToken,
        ...(csrfCookie ? { Cookie: csrfCookie } : {}),
        ...variant.headers,
      },
      method: "POST",
    });
    const text = await loginResponse.text();
    console.log(JSON.stringify({ variant: variant.name, status: loginResponse.status, ok: loginResponse.ok, body: summarizeBody(text) }));
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});