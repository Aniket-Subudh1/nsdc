"use client";

import { createElement, type ReactNode } from "react";
import { SWRConfig, type SWRConfiguration } from "swr";

import { apiFetch } from "@/lib/client/api";

export const portalSwrConfig: SWRConfiguration = {
  dedupingInterval: 2_000,
  errorRetryCount: 2,
  focusThrottleInterval: 30_000,
  keepPreviousData: true,
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  shouldRetryOnError: true,
};

export async function portalSwrFetcher<T>(key: string): Promise<T> {
  return apiFetch<T>(key);
}

export function PortalSWRProvider({ children }: { children: ReactNode }) {
  return createElement(
    SWRConfig,
    {
      value: {
        ...portalSwrConfig,
        fetcher: portalSwrFetcher,
      },
    },
    children,
  );
}
