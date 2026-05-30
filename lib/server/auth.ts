import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { NextResponse } from "next/server";

import { getEnv } from "@/lib/server/env";
import type { RoleKey } from "@/lib/server/rbac";

export const ACCESS_TOKEN_COOKIE = "nsdc_access_token";

export type SessionTokenPayload = {
  sub: string;
  sid: string;
  email: string;
  name: string;
  roles: RoleKey[];
  centerIds: string[];
};

function getAccessSecret() {
  return new TextEncoder().encode(getEnv().JWT_ACCESS_SECRET);
}

export async function hashPassword(value: string) {
  return bcrypt.hash(value, 12);
}

export async function verifyPassword(value: string, hash: string) {
  return bcrypt.compare(value, hash);
}

export async function signAccessToken(payload: SessionTokenPayload) {
  const env = getEnv();
  const expiresInMinutes = env.ACCESS_TOKEN_TTL_MINUTES;
  const roles = Array.from(payload.roles);
  const centerIds = Array.from(payload.centerIds);

  return new SignJWT({
    email: payload.email,
    name: payload.name,
    roles,
    centerIds,
    sid: payload.sid,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${expiresInMinutes}m`)
    .sign(getAccessSecret());
}

export async function verifyAccessToken(token: string) {
  const verified = await jwtVerify(token, getAccessSecret());
  const payload = verified.payload as typeof verified.payload & SessionTokenPayload;

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    email: payload.email,
    name: payload.name,
    roles: payload.roles,
    centerIds: payload.centerIds,
  };
}

export function setAuthCookie(response: NextResponse, token: string) {
  const env = getEnv();

  response.cookies.set(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnv().NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export function getTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieParts = cookieHeader.split(";").map((part) => part.trim());
  const matched = cookieParts.find((part) => part.startsWith(`${ACCESS_TOKEN_COOKIE}=`));

  return matched ? decodeURIComponent(matched.split("=").slice(1).join("=")) : null;
}