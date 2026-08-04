"use client";

import { useMemo } from "react";

import { useApiSWR } from "@/lib/client/use-api-swr";

export type PortalOptionsProgram = {
  id?: string;
  programId: string;
  name: string;
  status?: string;
};

export type PortalOptionsSector = {
  id?: string;
  sectorId: string;
  name: string;
  code?: string | null;
  status?: string;
};

export type PortalOptionsScheme = {
  id?: string;
  schemeId: string;
  name: string;
  status?: string;
};

export type PortalOptionsCourse = {
  id?: string;
  courseId: string;
  courseName: string;
  sectorId?: string;
  programIds?: string[];
  status?: string;
  approvalStatus?: string;
};

export type PortalOptionsCenter = {
  id: string;
  centerId: string;
  centerName: string;
  centerCode?: string;
  sidhTcId?: string | null;
  verifiedForSidh?: boolean;
};

export type PortalOptions = {
  programs: PortalOptionsProgram[];
  sectors: PortalOptionsSector[];
  schemes: PortalOptionsScheme[];
  courses: PortalOptionsCourse[];
  trainingCenters: PortalOptionsCenter[];
  enums?: Record<string, Array<{ code: string; label: string }>>;
  sidhBatchContext?: {
    environment?: string;
    tpId?: string;
  };
};

export const PORTAL_OPTIONS_KEY = "/api/v1/reference-data/portal-options";

/** Shared SWR cache for masters/reference options used across portal pages. */
export function usePortalOptions() {
  const { data, error, isLoading, isValidating, mutate } = useApiSWR<PortalOptions>(PORTAL_OPTIONS_KEY, {
    revalidateIfStale: true,
    revalidateOnMount: true,
  });

  const programs = useMemo(() => data?.programs ?? [], [data?.programs]);
  const sectors = useMemo(() => data?.sectors ?? [], [data?.sectors]);
  const schemes = useMemo(() => data?.schemes ?? [], [data?.schemes]);
  const courses = useMemo(() => data?.courses ?? [], [data?.courses]);
  const trainingCenters = useMemo(() => data?.trainingCenters ?? [], [data?.trainingCenters]);
  const enums = useMemo(() => data?.enums ?? {}, [data?.enums]);

  return {
    courses,
    data,
    enums,
    error,
    isLoading,
    isValidating,
    mutate,
    programs,
    schemes,
    sectors,
    sidhBatchContext: data?.sidhBatchContext,
    trainingCenters,
  };
}
