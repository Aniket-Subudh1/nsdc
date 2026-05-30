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

export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    throw new ClientApiError(payload.message ?? "Request failed", response.status);
  }

  return payload.data;
}