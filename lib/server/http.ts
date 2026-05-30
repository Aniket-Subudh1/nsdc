import { ZodError } from "zod";
import { NextResponse } from "next/server";

export type ApiErrorDetail = {
  field?: string;
  message: string;
};

type ApiSuccessOptions = {
  headers?: HeadersInit;
  message?: string;
  meta?: Record<string, unknown>;
  requestId?: string;
  status?: number;
};

export class ApiError extends Error {
  status: number;
  errorCode: string;
  errors: ApiErrorDetail[];

  constructor(
    status: number,
    errorCode: string,
    message: string,
    errors: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
    this.errors = errors;
  }
}

export function getRequestId(headers: Headers): string {
  return headers.get("x-request-id") ?? crypto.randomUUID();
}

export function getClientIp(headers: Headers): string | null {
  const forwardedFor = headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return headers.get("x-real-ip");
}

export function apiSuccess(data: unknown, options: ApiSuccessOptions = {}) {
  const response = NextResponse.json(
    {
      success: true,
      message: options.message ?? "Operation completed",
      data,
      meta: options.meta,
    },
    {
      status: options.status ?? 200,
      headers: options.headers,
    },
  );

  if (options.requestId) {
    response.headers.set("x-request-id", options.requestId);
  }

  return response;
}

export function apiError(error: unknown, requestId?: string) {
  let payload = {
    status: 500,
    message: "Internal server error",
    errorCode: "INTERNAL_SERVER_ERROR",
    errors: [] as ApiErrorDetail[],
  };

  if (error instanceof ApiError) {
    payload = {
      status: error.status,
      message: error.message,
      errorCode: error.errorCode,
      errors: error.errors,
    };
  } else if (error instanceof ZodError) {
    payload = {
      status: 400,
      message: "Validation failed",
      errorCode: "VALIDATION_ERROR",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const response = NextResponse.json(
    {
      success: false,
      message: payload.message,
      errorCode: payload.errorCode,
      errors: payload.errors,
    },
    {
      status: payload.status,
    },
  );

  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }

  return response;
}

export async function handleRoute<T>(
  request: Request,
  handler: () => Promise<T>,
  successOptions?: ApiSuccessOptions,
) {
  const requestId = getRequestId(request.headers);

  try {
    const data = await handler();

    return apiSuccess(data, {
      ...successOptions,
      requestId,
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}