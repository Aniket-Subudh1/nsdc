"use client";

import useSWR, { type KeyedMutator, type SWRConfiguration, useSWRConfig } from "swr";

import { apiFetch } from "@/lib/client/api";
import { portalSwrFetcher } from "@/lib/client/swr";

export type ApiSwrKey = string | null | undefined | false;

/**
 * Builds a stable SWR key from a path + optional serializable query object.
 * Example: swrKey("/api/v1/candidates", { page: 1, search: "a" })
 */
export function swrKey(path: string, query?: Record<string, string | number | boolean | null | undefined>) {
  if (!query || Object.keys(query).length === 0) {
    return path;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function useApiSWR<T>(key: ApiSwrKey, config?: SWRConfiguration<T>) {
  return useSWR<T>(key || null, portalSwrFetcher<T>, config);
}

/** Imperative fetch that still goes through apiFetch (for mutations / one-offs). */
export async function apiMutate<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  return apiFetch<T>(input, init);
}

export function usePortalMutate() {
  const { mutate } = useSWRConfig();

  return {
    mutate,
    /** Revalidate every cached key that starts with the given prefix (e.g. "/api/v1/candidates"). */
    async revalidatePrefix(prefix: string) {
      await mutate((key) => typeof key === "string" && key.startsWith(prefix), undefined, { revalidate: true });
    },
    async revalidateKeys(...keys: string[]) {
      await Promise.all(keys.map((key) => mutate(key)));
    },
  };
}

export type { KeyedMutator };
