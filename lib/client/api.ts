export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
  meta?: Record<string, unknown>;
  errorCode?: string;
  errors?: Array<{
    field?: string;
    message: string;
  }>;
};

export class ClientApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function formatApiErrorMessage(payload: Partial<ApiEnvelope<unknown>>, fallback: string) {
  const details = payload.errors
    ?.map((error) => error.message)
    .filter((message): message is string => Boolean(message?.trim()))
    .join("; ");

  return [payload.message ?? fallback, details].filter(Boolean).join(" — ");
}

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(input, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && /failed to fetch|networkerror|load failed/i.test(error.message)
        ? "Network request was blocked or failed. If antivirus is blocking this site, choose Proceed Anyway and retry."
        : error instanceof Error
          ? error.message
          : "Network request failed";
    throw new ClientApiError(message, 0);
  }

  const text = await response.text();
  let payload: ApiEnvelope<T>;

  try {
    payload = JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new ClientApiError(
      response.ok
        ? "The server returned an unexpected response"
        : `Request failed (${response.status})`,
      response.status,
    );
  }

  if (!response.ok || !payload.success) {
    throw new ClientApiError(formatApiErrorMessage(payload, "Request failed"), response.status);
  }

  return payload.data;
}