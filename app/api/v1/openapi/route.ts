import { NextResponse } from "next/server";

import { getOpenApiDocument } from "@/lib/server/openapi";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getOpenApiDocument());
}