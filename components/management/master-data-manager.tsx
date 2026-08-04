"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import { useRefreshableLoad } from "@/lib/client/use-refreshable-load";
import {
  IconBook,
  IconBriefcase,
  IconChevronLeft,
  IconChevronRight,
  IconCircleCheck,
  IconDownload,
  IconFilter,
  IconHierarchy,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconStack2,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import CourseBulkImportPanel from "@/components/management/course-bulk-import-panel";
import { apiFetch, ClientApiError } from "@/lib/client/api";
import { usePortalMutate } from "@/lib/client/use-api-swr";
import { PORTAL_OPTIONS_KEY, usePortalOptions } from "@/lib/client/use-portal-options";
import {
  getSidhBatchFieldDefault,
  resolveSidhBatchFieldOptions,
  SIDH_BATCH_FIELD_OPTIONS,
  type SidhBatchFieldKey,
  type SidhBatchFieldOptionsMap,
  type SidhBatchFieldOptionsResponse,
} from "@/lib/sidh-batch-field-options";
import { cn } from "@/lib/utils";

type MasterDataManagerProps = {
  portal: "admin" | "training_partner";
};

type ProgramRecord = {
  assessmentMode: string | null;
  batchCategoryType: string | null;
  batchType: string | null;
  code: string;
  createdSource: string | null;
  description: string | null;
  feePaidBy: string | null;
  id: string;
  name: string;
  programId: string;
  skillingCategoryId: number;
  skillingCategoryName: string | null;
  skillingCategoryScheme: string | null;
  status: "active" | "inactive";
  syncToSidh: boolean;
  verifiedAt: string | null;
  verifiedForSidh: boolean;
};

type SectorRecord = {
  code: string;
  description: string | null;
  id: string;
  name: string;
  sectorId: string;
  status: "active" | "inactive";
};

type SchemeRecord = {
  assessmentMode: string | null;
  batchCategoryType: string | null;
  batchType: string | null;
  beneficiaryType: string | null;
  code: string;
  createdSource: string | null;
  description: string | null;
  fundingType: string | null;
  id: string;
  name: string;
  schemeId: string;
  sidhSchemeId: string | null;
  sidhSchemeReferenceId: string | null;
  sidhSchemeType: string | null;
  status: "active" | "inactive";
  syncEnabled: boolean;
  validFrom: string | null;
  validTo: string | null;
  verifiedAt: string | null;
  verifiedForSidh: boolean;
};

type CourseRecord = {
  approvalDate: string | null;
  approvalStatus: "approved" | "pending" | "rejected" | "expired";
  courseCode: string;
  courseId: string;
  courseName: string;
  id: string;
  jobRole: string;
  nsqfLevel: string;
  programIds: string[];
  schemeIds: string[];
  sectorId: string;
  shortForm: string | null;
  sidhCourseId: string;
  status: "active" | "inactive";
  totalHours: number;
  trainingPerDayHours: number | null;
  validity: number | null;
  validityEndDate: string | null;
  validityStartDate: string | null;
  version: number;
};

type PagedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

type Tab = "programs" | "sectors" | "schemes" | "courses";
type CourseViewMode = "list" | "bulk_import";

const TABS: Array<{ icon: React.ReactNode; id: Tab; label: string }> = [
  { icon: <IconBriefcase className="h-4 w-4" />, id: "programs", label: "Programs" },
  { icon: <IconStack2 className="h-4 w-4" />, id: "sectors", label: "Sectors" },
  { icon: <IconHierarchy className="h-4 w-4" />, id: "schemes", label: "Schemes" },
  { icon: <IconBook className="h-4 w-4" />, id: "courses", label: "Courses" },
];

const portalContent = {
  admin: {
    description:
      "Set up programs, sectors, schemes, and courses — the building blocks used when creating training batches.",
    heading: "Course Catalog",
  },
  training_partner: {
    description:
      "Browse programs, sectors, and schemes. Manage courses available for your training operations and batch setup.",
    heading: "Course Catalog",
  },
} as const;

type SidhWorkflowState = "draft" | "ready" | "verified";

function resolveSidhWorkflowState(verifiedForSidh: boolean, readyForSidh: boolean): SidhWorkflowState {
  if (readyForSidh) {
    return "ready";
  }

  if (verifiedForSidh) {
    return "verified";
  }

  return "draft";
}

function createEmptyProgramForm(enums?: Record<string, Array<{ code: string; label: string }>>) {
  return {
    assessmentMode: getSidhBatchFieldDefault("assessmentMode", enums),
    batchCategoryType: getSidhBatchFieldDefault("categoryType", enums),
    batchType: getSidhBatchFieldDefault("batchType", enums),
    code: "",
    createdSource: getSidhBatchFieldDefault("createdSource", enums),
    description: "",
    feePaidBy: getSidhBatchFieldDefault("feePaidBy", enums),
    name: "",
    skillingCategoryId: "1",
    skillingCategoryName: "",
    skillingCategoryScheme: "Fee Based",
    status: "active" as "active" | "inactive",
    syncToSidh: false,
  };
}

const emptyProgramForm = createEmptyProgramForm();

const emptySectorForm = {
  code: "",
  description: "",
  name: "",
  status: "active" as "active" | "inactive",
};

const emptySchemeForm = {
  beneficiaryType: "",
  code: "",
  description: "",
  fundingType: "",
  name: "",
  sidhSchemeId: "",
  sidhSchemeReferenceId: "",
  sidhSchemeType: "feeBased",
  status: "active" as "active" | "inactive",
  syncEnabled: false,
  validFrom: "",
  validTo: "",
};

type CourseListFilters = {
  approvalStatus: string;
  page: number;
  pageSize: number;
  programId: string;
  search: string;
  sectorId: string;
  status: string;
  validOn: string;
};

function buildQueryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }

    const normalized = String(value).trim();

    if (!normalized) {
      continue;
    }

    params.set(key, normalized);
  }

  return params.toString();
}

function buildCourseListQuery(filters: CourseListFilters) {
  return buildQueryString({
    page: filters.page,
    pageSize: filters.pageSize,
    search: filters.search || undefined,
    status: filters.status || undefined,
    sectorId: filters.sectorId || undefined,
    programId: filters.programId || undefined,
    approvalStatus: filters.approvalStatus || undefined,
    validOn: filters.validOn || undefined,
  });
}

function buildCourseExportQuery(filters: Omit<CourseListFilters, "page" | "pageSize">) {
  return buildQueryString({
    search: filters.search || undefined,
    status: filters.status || undefined,
    sectorId: filters.sectorId || undefined,
    programId: filters.programId || undefined,
    approvalStatus: filters.approvalStatus || undefined,
    validOn: filters.validOn || undefined,
  });
}

async function downloadCourseExport(filters: Omit<CourseListFilters, "page" | "pageSize">) {
  const query = buildCourseExportQuery(filters);
  const response = await fetch(`/api/v1/masters/courses/exports?${query}`, {
    credentials: "include",
  });

  if (!response.ok) {
    let message = "Unable to export courses";
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Keep default message when the response is not JSON.
    }

    throw new ClientApiError(message, response.status);
  }

  const blob = await response.blob();
  const stamp = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `courses_export_${stamp}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const emptyCourseForm = {
  approvalDate: "",
  approvalStatus: "pending" as "approved" | "pending",
  courseName: "",
  jobRole: "",
  nsqfLevel: "",
  programId: "",
  schemeId: "",
  sectorId: "",
  shortForm: "",
  sidhCourseId: "",
  totalHours: "",
  trainingPerDayHours: "",
  validUntil: "",
};

export default function MasterDataManager({ portal }: MasterDataManagerProps) {
  const canManageCoreMasters = portal === "admin";
  const [activeTab, setActiveTab] = useState<Tab>(canManageCoreMasters ? "programs" : "courses");
  const [courseViewMode, setCourseViewMode] = useState<CourseViewMode>("list");
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [sectors, setSectors] = useState<SectorRecord[]>([]);
  const [schemes, setSchemes] = useState<SchemeRecord[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [coursePage, setCoursePage] = useState(1);
  const [coursePageSize] = useState(10);
  const [courseTotal, setCourseTotal] = useState(0);

  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const [programForm, setProgramForm] = useState(emptyProgramForm);
  const [sectorForm, setSectorForm] = useState(emptySectorForm);
  const [schemeForm, setSchemeForm] = useState(emptySchemeForm);
  const [courseForm, setCourseForm] = useState(emptyCourseForm);

  const { enums: referenceEnums } = usePortalOptions();
  const { revalidateKeys } = usePortalMutate();
  const [sidhFieldOptions, setSidhFieldOptions] = useState<SidhBatchFieldOptionsResponse | null>(null);
  const loadState = useRefreshableLoad();
  const [isCoursesLoading, setIsCoursesLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [showAdvancedCourseFilters, setShowAdvancedCourseFilters] = useState(false);
  const [courseSectorFilter, setCourseSectorFilter] = useState("");
  const [courseProgramFilter, setCourseProgramFilter] = useState("");
  const [courseApprovalFilter, setCourseApprovalFilter] = useState("");
  const [courseValidOnFilter, setCourseValidOnFilter] = useState("");
  const [isExportingCourses, setIsExportingCourses] = useState(false);

  const selectedProgram = programs.find((p) => p.programId === selectedProgramId) ?? null;
  const selectedSector = sectors.find((sector) => sector.sectorId === selectedSectorId) ?? null;
  const selectedScheme = schemes.find((s) => s.schemeId === selectedSchemeId) ?? null;
  const selectedCourse = courses.find((course) => course.courseId === selectedCourseId) ?? null;

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setSearchQuery("");
    setStatusFilter("all");
    setShowAdvancedCourseFilters(false);
    setCourseSectorFilter("");
    setCourseProgramFilter("");
    setCourseApprovalFilter("");
    setCourseValidOnFilter("");
    if (tab === "courses") setCoursePage(1);
    if (tab !== "courses") setCourseViewMode("list");
  }

  const courseListFilters = useMemo<CourseListFilters>(
    () => ({
      approvalStatus: courseApprovalFilter,
      page: coursePage,
      pageSize: coursePageSize,
      programId: courseProgramFilter,
      search: activeTab === "courses" ? searchQuery : "",
      sectorId: courseSectorFilter,
      status: activeTab === "courses" && statusFilter !== "all" ? statusFilter : "",
      validOn: courseValidOnFilter,
    }),
    [
      activeTab,
      courseApprovalFilter,
      coursePage,
      coursePageSize,
      courseProgramFilter,
      courseSectorFilter,
      courseValidOnFilter,
      searchQuery,
      statusFilter,
    ],
  );

  const activeCourseFilterCount = useMemo(
    () =>
      [
        courseListFilters.search,
        courseListFilters.status,
        courseListFilters.sectorId,
        courseListFilters.programId,
        courseListFilters.approvalStatus,
        courseListFilters.validOn,
      ].filter(Boolean).length,
    [courseListFilters],
  );

  function clearCourseFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setCourseSectorFilter("");
    setCourseProgramFilter("");
    setCourseApprovalFilter("");
    setCourseValidOnFilter("");
    setCoursePage(1);
  }

  const activeList = useMemo(
    () =>
      activeTab === "programs"
        ? programs
        : activeTab === "sectors"
          ? sectors
          : activeTab === "schemes"
            ? schemes
            : courses,
      [activeTab, courses, programs, sectors, schemes],
  );

  const filteredPrograms = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return programs.filter((p) => {
      const match = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      const status = statusFilter === "all" || p.status === statusFilter;
      return match && status;
    });
  }, [programs, searchQuery, statusFilter]);

  const sortedSectors = useMemo(
    () => [...sectors].sort((left, right) => left.name.localeCompare(right.name)),
    [sectors],
  );

  const filteredSectors = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return sortedSectors.filter((s) => {
      const match = !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      const status = statusFilter === "all" || s.status === statusFilter;
      return match && status;
    });
  }, [sortedSectors, searchQuery, statusFilter]);

  const filteredSchemes = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return schemes.filter((s) => {
      const match =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.sidhSchemeId ?? "").toLowerCase().includes(q);
      const status = statusFilter === "all" || s.status === statusFilter;
      return match && status;
    });
  }, [schemes, searchQuery, statusFilter]);

  const sectorNameById = useMemo(
    () => new Map(sectors.map((sector) => [sector.sectorId, sector.name])),
    [sectors],
  );

  const sidhBatchFieldOptionLabels = useMemo(
    () => resolveSidhBatchFieldOptions(referenceEnums),
    [referenceEnums],
  );

  async function handleDelete(tab: Tab, id: string, label: string) {
    const endpoint =
      tab === "programs"
        ? `/api/v1/masters/programs/${id}`
        : tab === "sectors"
          ? `/api/v1/masters/sectors/${id}`
          : tab === "schemes"
            ? `/api/v1/masters/schemes/${id}`
            : `/api/v1/masters/courses/${id}`;

    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }

    try {
      await apiFetch(endpoint, { method: "DELETE" });

      if (tab === "programs" && selectedProgramId === id) {
        setSelectedProgramId(null);
        setProgramForm(emptyProgramForm);
        setShowEditModal(false);
      }
      if (tab === "sectors" && selectedSectorId === id) {
        setSelectedSectorId(null);
        setSectorForm(emptySectorForm);
        setShowEditModal(false);
      }
      if (tab === "schemes" && selectedSchemeId === id) {
        setSelectedSchemeId(null);
        setSchemeForm(emptySchemeForm);
        setShowEditModal(false);
      }
      if (tab === "courses" && selectedCourseId === id) {
        setSelectedCourseId(null);
        setCourseForm(emptyCourseForm);
        setShowEditModal(false);
      }

      toast.success(`${label} deleted`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : `Unable to delete ${label}`);
    }
  }

  async function handleVerify(tab: "programs" | "schemes", id: string, label: string) {
    const endpoint =
      tab === "programs"
        ? `/api/v1/masters/programs/${id}/verify`
        : `/api/v1/masters/schemes/${id}/verify`;

    try {
      await apiFetch(endpoint, { method: "POST" });
      toast.success(`${label} verified for SIDH readiness`);
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : `Unable to verify ${label}`);
    }
  }

  async function handleSync(tab: "programs" | "schemes", id: string, label: string) {
    const endpoint =
      tab === "programs"
        ? `/api/v1/masters/programs/${id}/sync`
        : `/api/v1/masters/schemes/${id}/sync`;

    try {
      await apiFetch(endpoint, { method: "POST" });
      toast.success(`${label} marked ready for SIDH use`);
      await loadData();
    } catch (error) {
      toast.error(
        error instanceof ClientApiError ? error.message : `Unable to mark ${label} ready for SIDH`,
      );
    }
  }

  async function loadSidhFieldOptions() {
    try {
      const sidhOptions = await apiFetch<SidhBatchFieldOptionsResponse>("/api/v1/masters/sidh-batch-field-options");
      setSidhFieldOptions(sidhOptions);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load SIDH batch field options");
    }
  }

  async function loadCourses() {
    const courseData = await apiFetch<PagedResponse<CourseRecord>>(
      `/api/v1/masters/courses?${buildCourseListQuery(courseListFilters)}`,
    );
    setCourses(courseData.items);
    setCourseTotal(courseData.total);
  }

  async function loadData() {
    loadState.begin();
    try {
      const [programData, sectorData, schemeData] = await Promise.all([
        apiFetch<PagedResponse<ProgramRecord>>("/api/v1/masters/programs?page=1&pageSize=100"),
        apiFetch<PagedResponse<SectorRecord>>("/api/v1/masters/sectors?page=1&pageSize=100"),
        apiFetch<PagedResponse<SchemeRecord>>("/api/v1/masters/schemes?page=1&pageSize=100"),
        loadSidhFieldOptions(),
      ]);
      setPrograms(programData.items);
      setSectors(sectorData.items);
      setSchemes(schemeData.items);
      await loadCourses();
      await revalidateKeys(PORTAL_OPTIONS_KEY, "/api/v1/dashboard/summary");
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load master data");
    } finally {
      loadState.end();
    }
  }

  async function handleExportCourses() {
    setIsExportingCourses(true);

    try {
      await downloadCourseExport(courseListFilters);
      toast.success(
        activeCourseFilterCount > 0
          ? `Exported ${courseTotal.toLocaleString()} filtered course${courseTotal === 1 ? "" : "s"} to Excel`
          : `Exported ${courseTotal.toLocaleString()} course${courseTotal === 1 ? "" : "s"} to Excel`,
      );
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to export courses");
    } finally {
      setIsExportingCourses(false);
    }
  }

  async function handleAddSidhBatchFieldOption(field: SidhBatchFieldKey, label: string) {
    try {
      await apiFetch("/api/v1/masters/sidh-batch-field-options", {
        method: "POST",
        body: JSON.stringify({ field, label }),
      });
      toast.success("Option added");
      await loadSidhFieldOptions();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to add option");
      throw error;
    }
  }

  async function handleRemoveSidhBatchFieldOption(referenceValueId: string) {
    try {
      await apiFetch(`/api/v1/masters/sidh-batch-field-options/${referenceValueId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "inactive" }),
      });
      toast.success("Option removed");
      await loadSidhFieldOptions();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to remove option");
      throw error;
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (activeTab !== "courses" || courseViewMode === "bulk_import") {
      return;
    }

    let isMounted = true;

    async function refreshCourses() {
      setIsCoursesLoading(true);

      try {
        await loadCourses();
      } catch (error) {
        if (isMounted) {
          toast.error(error instanceof ClientApiError ? error.message : "Unable to load courses");
        }
      } finally {
        if (isMounted) {
          setIsCoursesLoading(false);
        }
      }
    }

    void refreshCourses();

    return () => {
      isMounted = false;
    };
  }, [
    activeTab,
    courseViewMode,
    courseListFilters.approvalStatus,
    courseListFilters.page,
    courseListFilters.programId,
    courseListFilters.search,
    courseListFilters.sectorId,
    courseListFilters.status,
    courseListFilters.validOn,
  ]);

  function openCreateModal() {
    if (activeTab === "programs") setProgramForm(createEmptyProgramForm(referenceEnums));
    else if (activeTab === "sectors") setSectorForm(emptySectorForm);
    else if (activeTab === "schemes") setSchemeForm(emptySchemeForm);
    else setCourseForm({ ...emptyCourseForm, sectorId: sortedSectors[0]?.sectorId ?? "" });
    setShowCreateModal(true);
  }

  function openEditModal(id: string) {
    if (activeTab === "programs") {
      const prog = programs.find((p) => p.programId === id);
      if (!prog) return;
      setSelectedProgramId(prog.programId);
      setProgramForm({
        assessmentMode: getSidhBatchFieldDefault("assessmentMode", referenceEnums, prog.assessmentMode),
        batchCategoryType: getSidhBatchFieldDefault("categoryType", referenceEnums, prog.batchCategoryType),
        batchType: getSidhBatchFieldDefault("batchType", referenceEnums, prog.batchType),
        code: prog.code,
        createdSource: getSidhBatchFieldDefault("createdSource", referenceEnums, prog.createdSource),
        description: prog.description ?? "",
        feePaidBy: getSidhBatchFieldDefault("feePaidBy", referenceEnums, prog.feePaidBy),
        name: prog.name,
        skillingCategoryId: String(prog.skillingCategoryId ?? 1),
        skillingCategoryName: prog.skillingCategoryName ?? "",
        skillingCategoryScheme: prog.skillingCategoryScheme ?? "Fee Based",
        status: prog.status,
        syncToSidh: prog.syncToSidh,
      });
    } else if (activeTab === "sectors") {
      const sector = sectors.find((item) => item.sectorId === id);
      if (!sector) return;
      setSelectedSectorId(sector.sectorId);
      setSectorForm({
        code: sector.code,
        description: sector.description ?? "",
        name: sector.name,
        status: sector.status,
      });
    } else if (activeTab === "schemes") {
      const scheme = schemes.find((s) => s.schemeId === id);
      if (!scheme) return;
      setSelectedSchemeId(scheme.schemeId);
      setSchemeForm({
        beneficiaryType: scheme.beneficiaryType ?? "",
        code: scheme.code,
        description: scheme.description ?? "",
        fundingType: scheme.fundingType ?? "",
        name: scheme.name,
        sidhSchemeId: scheme.sidhSchemeId ?? "",
        sidhSchemeReferenceId: scheme.sidhSchemeReferenceId ?? "",
        sidhSchemeType: scheme.sidhSchemeType ?? "feeBased",
        status: scheme.status,
        syncEnabled: scheme.syncEnabled,
        validFrom: scheme.validFrom ? scheme.validFrom.slice(0, 10) : "",
        validTo: scheme.validTo ? scheme.validTo.slice(0, 10) : "",
      });
    } else if (activeTab === "courses") {
      const course = courses.find((item) => item.courseId === id);
      if (!course) return;
      setSelectedCourseId(course.courseId);
      setCourseForm({
        approvalDate: course.approvalDate ? course.approvalDate.slice(0, 10) : "",
        approvalStatus: course.approvalStatus === "approved" ? "approved" : "pending",
        courseName: course.courseName,
        jobRole: course.jobRole,
        nsqfLevel: String(course.nsqfLevel ?? ""),
        programId: course.programIds[0] ?? "",
        schemeId: course.schemeIds[0] ?? "",
        sectorId: course.sectorId,
        shortForm: course.shortForm ?? "",
        sidhCourseId: course.sidhCourseId || course.courseCode,
        totalHours: String(course.totalHours ?? ""),
        trainingPerDayHours: String(course.trainingPerDayHours ?? ""),
        validUntil: course.validityEndDate ? course.validityEndDate.slice(0, 10) : "",
      });
    }
    setShowEditModal(true);
  }

  async function handleProgramSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSaving(true);
    const payload = {
      ...programForm,
      skillingCategoryId: Number(programForm.skillingCategoryId || 1),
    };
    try {
      if (selectedProgram) {
        await apiFetch(`/api/v1/masters/programs/${selectedProgram.programId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Program updated");
        setShowEditModal(false);
      } else {
        await apiFetch("/api/v1/masters/programs", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Program created");
        setShowCreateModal(false);
      }
      setSelectedProgramId(null);
      setProgramForm(emptyProgramForm);
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to save program");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSectorSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (selectedSector) {
        await apiFetch(`/api/v1/masters/sectors/${selectedSector.sectorId}`, {
          method: "PATCH",
          body: JSON.stringify(sectorForm),
        });
        toast.success("Sector updated");
        setShowEditModal(false);
      } else {
        await apiFetch("/api/v1/masters/sectors", {
          method: "POST",
          body: JSON.stringify(sectorForm),
        });
        toast.success("Sector created");
        setShowCreateModal(false);
      }
      setSelectedSectorId(null);
      setSectorForm(emptySectorForm);
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to save sector");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSchemeSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (selectedScheme) {
        await apiFetch(`/api/v1/masters/schemes/${selectedScheme.schemeId}`, {
          method: "PATCH",
          body: JSON.stringify(schemeForm),
        });
        toast.success("Scheme updated");
        setShowEditModal(false);
      } else {
        await apiFetch("/api/v1/masters/schemes", {
          method: "POST",
          body: JSON.stringify(schemeForm),
        });
        toast.success("Scheme created");
        setShowCreateModal(false);
      }
      setSelectedSchemeId(null);
      setSchemeForm(emptySchemeForm);
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to save scheme");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCourseSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSaving(true);
    const validityStartDate = courseForm.approvalDate || new Date().toISOString().slice(0, 10);
    const payload = {
      approvalDate: courseForm.approvalDate || undefined,
      approvalStatus: courseForm.approvalStatus,
      courseName: courseForm.courseName,
      jobRole: courseForm.jobRole,
      nsqfLevel: courseForm.nsqfLevel,
      programIds: courseForm.programId ? [courseForm.programId] : [],
      schemeIds: courseForm.schemeId ? [courseForm.schemeId] : [],
      sectorId: courseForm.sectorId,
      shortForm: courseForm.shortForm,
      sidhCourseId: courseForm.sidhCourseId,
      totalHours: Number(courseForm.totalHours),
      trainingPerDayHours: Number(courseForm.trainingPerDayHours),
      validityEndDate: courseForm.validUntil,
      validityStartDate,
      ...(selectedCourse ? { currentVersion: selectedCourse.version } : {}),
    };

    try {
      if (selectedCourse) {
        await apiFetch(`/api/v1/masters/courses/${selectedCourse.courseId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        toast.success("Course updated");
        setShowEditModal(false);
      } else {
        await apiFetch("/api/v1/masters/courses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Course created");
        setShowCreateModal(false);
        setCoursePage(1);
      }
      setSelectedCourseId(null);
      setCourseForm(emptyCourseForm);
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to save course");
    } finally {
      setIsSaving(false);
    }
  }

  const addLabel =
    activeTab === "programs"
      ? "Add program"
      : activeTab === "sectors"
        ? "Add sector"
        : activeTab === "schemes"
          ? "Add scheme"
          : "Add course";

  const content = portalContent[portal];

  const statusCounts = {
    active: activeList.filter((i) => i.status === "active").length,
    all: activeList.length,
    inactive: activeList.filter((i) => i.status === "inactive").length,
  };
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-6 overflow-hidden bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <div className="shrink-0 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{content.heading}</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">{content.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => startTransition(() => void loadData())}
            disabled={loadState.isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <IconRefresh className={cn("h-4 w-4", loadState.isRefreshing && "animate-spin")} />
            Refresh
          </button>
          {activeTab === "courses" ? (
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setCourseViewMode("list")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  courseViewMode === "list" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                All courses
              </button>
              <button
                type="button"
                onClick={() => setCourseViewMode("bulk_import")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  courseViewMode === "bulk_import" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                Bulk import
              </button>
            </div>
          ) : null}
          {(canManageCoreMasters || activeTab === "courses") && courseViewMode === "list" ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <IconPlus className="h-4 w-4" />
              {addLabel}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Programs"
          value={loadState.isInitialLoading ? null : programs.length}
          icon={<IconBriefcase className="h-5 w-5" />}
          active={activeTab === "programs"}
          onClick={() => switchTab("programs")}
        />
        <StatCard
          label="Sectors"
          value={loadState.isInitialLoading ? null : sectors.length}
          icon={<IconStack2 className="h-5 w-5" />}
          active={activeTab === "sectors"}
          onClick={() => switchTab("sectors")}
        />
        <StatCard
          label="Schemes"
          value={loadState.isInitialLoading ? null : schemes.length}
          icon={<IconHierarchy className="h-5 w-5" />}
          active={activeTab === "schemes"}
          onClick={() => switchTab("schemes")}
        />
        <StatCard
          label="Courses"
          value={loadState.isInitialLoading ? null : courseTotal}
          icon={<IconBook className="h-5 w-5" />}
          active={activeTab === "courses"}
          onClick={() => switchTab("courses")}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-slate-100 px-4 pt-3 sm:px-5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchTab(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition",
                activeTab === tab.id
                  ? "border-sky-600 text-sky-700"
                  : "border-transparent text-neutral-400 hover:text-neutral-600"
              )}
            >
              {tab.icon}
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  activeTab === tab.id ? "bg-sky-100 text-sky-700" : "bg-neutral-100 text-neutral-500"
                )}
              >
                {{ programs: programs.length, sectors: sectors.length, schemes: schemes.length, courses: courseTotal }[tab.id]}
              </span>
            </button>
          ))}
        </div>

        {!(activeTab === "courses" && courseViewMode === "bulk_import") ? (
          <div className="shrink-0 space-y-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-1">
                {(["all", "active", "inactive"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setStatusFilter(s);
                      if (activeTab === "courses") {
                        setCoursePage(1);
                      }
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition",
                      statusFilter === s
                        ? "bg-sky-100 text-sky-700"
                        : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                    )}
                  >
                    {s === "all" ? "All items" : s}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                        statusFilter === s ? "bg-sky-200/70 text-sky-800" : "bg-neutral-100 text-neutral-500"
                      )}
                    >
                      {statusCounts[s]}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1 sm:max-w-xs md:max-w-sm">
                  <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (activeTab === "courses") {
                        setCoursePage(1);
                      }
                    }}
                    placeholder="Search by name or code"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        if (activeTab === "courses") {
                          setCoursePage(1);
                        }
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      <IconX className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                {activeTab === "courses" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAdvancedCourseFilters((current) => !current)}
                      className={cn(
                        "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition",
                        showAdvancedCourseFilters || activeCourseFilterCount > 0
                          ? "border-sky-200 bg-sky-50 text-sky-700"
                          : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:text-sky-700",
                      )}
                    >
                      <IconFilter className="h-4 w-4" />
                      Advanced filters
                      {activeCourseFilterCount > 0 ? (
                        <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {activeCourseFilterCount}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      disabled={isExportingCourses || courseTotal === 0}
                      onClick={() => void handleExportCourses()}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:border-sky-200 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isExportingCourses ? (
                        <IconLoader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <IconDownload className="h-4 w-4" />
                      )}
                      Export Excel
                      {courseTotal > 0 ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                          {courseTotal.toLocaleString()}
                        </span>
                      ) : null}
                    </button>
                    {activeCourseFilterCount > 0 ? (
                      <button
                        type="button"
                        onClick={clearCourseFilters}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        <IconX className="h-4 w-4" />
                        Clear all
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
            {activeTab === "courses" && showAdvancedCourseFilters ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">Sector</span>
                    <select
                      value={courseSectorFilter}
                      onChange={(event) => {
                        setCourseSectorFilter(event.target.value);
                        setCoursePage(1);
                      }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-300"
                    >
                      <option value="">All sectors</option>
                      {sortedSectors.map((sector) => (
                        <option key={sector.sectorId} value={sector.sectorId}>
                          {sector.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">Program</span>
                    <select
                      value={courseProgramFilter}
                      onChange={(event) => {
                        setCourseProgramFilter(event.target.value);
                        setCoursePage(1);
                      }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-300"
                    >
                      <option value="">All programs</option>
                      {programs.map((program) => (
                        <option key={program.programId} value={program.programId}>
                          {program.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">Approval status</span>
                    <select
                      value={courseApprovalFilter}
                      onChange={(event) => {
                        setCourseApprovalFilter(event.target.value);
                        setCoursePage(1);
                      }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-300"
                    >
                      <option value="">All approval statuses</option>
                      <option value="approved">Approved</option>
                      <option value="pending">Pending</option>
                      <option value="rejected">Rejected</option>
                      <option value="expired">Expired</option>
                    </select>
                  </label>
                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium text-slate-700">Valid on</span>
                    <input
                      type="date"
                      value={courseValidOnFilter}
                      onChange={(event) => {
                        setCourseValidOnFilter(event.target.value);
                        setCoursePage(1);
                      }}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-300"
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeTab === "courses" && courseViewMode === "bulk_import" ? (
            <div className="p-4 sm:p-5">
              <CourseBulkImportPanel
                onImportCommitted={() => {
                  setCoursePage(1);
                  void loadData();
                }}
              />
            </div>
          ) : (
            <>
          <div
            className={cn(
              "hidden overflow-x-auto lg:block transition-opacity",
              (loadState.isRefreshing || (activeTab === "courses" && isCoursesLoading)) && "opacity-70",
            )}
          >
          {activeTab === "programs" && (
            <ProgramsTable
              isLoading={loadState.isInitialLoading}
              readOnly={!canManageCoreMasters}
              onDelete={handleDelete}
              programs={filteredPrograms}
              onEdit={(id) => openEditModal(id)}
              onVerify={handleVerify}
              onSync={handleSync}
            />
          )}
          {activeTab === "sectors" && (
            <SectorsTable
              isLoading={loadState.isInitialLoading}
              readOnly={!canManageCoreMasters}
              onDelete={handleDelete}
              onEdit={(id) => openEditModal(id)}
              sectors={filteredSectors}
            />
          )}
          {activeTab === "schemes" && (
            <SchemesTable
              isLoading={loadState.isInitialLoading}
              readOnly={!canManageCoreMasters}
              onDelete={handleDelete}
              schemes={filteredSchemes}
              onEdit={(id) => openEditModal(id)}
              onVerify={handleVerify}
              onSync={handleSync}
            />
          )}
          {activeTab === "courses" && (
            <CoursesTable
              courses={courses}
              isLoading={loadState.isInitialLoading || isCoursesLoading}
              onDelete={handleDelete}
              onEdit={(id) => openEditModal(id)}
              page={coursePage}
              pageSize={coursePageSize}
              sectorNameById={sectorNameById}
              total={courseTotal}
              onPageChange={setCoursePage}
            />
          )}
        </div>

        <div
          className={cn(
            "divide-y divide-slate-100 lg:hidden transition-opacity",
            (loadState.isRefreshing || (activeTab === "courses" && isCoursesLoading)) && "opacity-70",
          )}
        >
          {activeTab === "programs" && (
            <ProgramsMobileList
              isLoading={loadState.isInitialLoading}
              readOnly={!canManageCoreMasters}
              onDelete={handleDelete}
              onEdit={(id) => openEditModal(id)}
              onSync={handleSync}
              onVerify={handleVerify}
              programs={filteredPrograms}
            />
          )}
          {activeTab === "sectors" && (
            <SectorsMobileList
              isLoading={loadState.isInitialLoading}
              readOnly={!canManageCoreMasters}
              onDelete={handleDelete}
              onEdit={(id) => openEditModal(id)}
              sectors={filteredSectors}
            />
          )}
          {activeTab === "schemes" && (
            <SchemesMobileList
              isLoading={loadState.isInitialLoading}
              readOnly={!canManageCoreMasters}
              onDelete={handleDelete}
              onEdit={(id) => openEditModal(id)}
              onSync={handleSync}
              onVerify={handleVerify}
              schemes={filteredSchemes}
            />
          )}
          {activeTab === "courses" && (
            <CoursesMobileList
              courses={courses}
              isLoading={loadState.isInitialLoading || isCoursesLoading}
              onDelete={handleDelete}
              onEdit={(id) => openEditModal(id)}
              page={coursePage}
              pageSize={coursePageSize}
              sectorNameById={sectorNameById}
              total={courseTotal}
              onPageChange={setCoursePage}
            />
          )}
        </div>
            </>
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showCreateModal && activeTab === "programs" && (
        <ProgramModal
          form={programForm}
          isEdit={false}
          isSaving={isSaving}
          sidhFieldOptionLabels={sidhBatchFieldOptionLabels}
          setForm={setProgramForm}
          onClose={() => {
            setShowCreateModal(false);
            setProgramForm(createEmptyProgramForm(referenceEnums));
          }}
          onSubmit={handleProgramSave}
        />
      )}
      {showEditModal && activeTab === "programs" && (
        <ProgramModal
          form={programForm}
          isEdit={true}
          isSaving={isSaving}
          sidhFieldOptionLabels={sidhBatchFieldOptionLabels}
          sidhFieldOptions={sidhFieldOptions}
          onAddSidhFieldOption={handleAddSidhBatchFieldOption}
          onRemoveSidhFieldOption={handleRemoveSidhBatchFieldOption}
          setForm={setProgramForm}
          onClose={() => {
            setShowEditModal(false);
            setSelectedProgramId(null);
            setProgramForm(createEmptyProgramForm(referenceEnums));
          }}
          onSubmit={handleProgramSave}
        />
      )}
      {showCreateModal && activeTab === "sectors" && (
        <SectorModal
          form={sectorForm}
          isEdit={false}
          isSaving={isSaving}
          setForm={setSectorForm}
          onClose={() => {
            setShowCreateModal(false);
            setSectorForm(emptySectorForm);
          }}
          onSubmit={handleSectorSave}
        />
      )}
      {showEditModal && activeTab === "sectors" && (
        <SectorModal
          form={sectorForm}
          isEdit={true}
          isSaving={isSaving}
          setForm={setSectorForm}
          onClose={() => {
            setShowEditModal(false);
            setSelectedSectorId(null);
            setSectorForm(emptySectorForm);
          }}
          onSubmit={handleSectorSave}
        />
      )}
      {showCreateModal && activeTab === "schemes" && (
        <SchemeModal
          form={schemeForm}
          isEdit={false}
          isSaving={isSaving}
          setForm={setSchemeForm}
          onClose={() => {
            setShowCreateModal(false);
            setSchemeForm(emptySchemeForm);
          }}
          onSubmit={handleSchemeSave}
        />
      )}
      {showEditModal && activeTab === "schemes" && (
        <SchemeModal
          form={schemeForm}
          isEdit={true}
          isSaving={isSaving}
          setForm={setSchemeForm}
          onClose={() => {
            setShowEditModal(false);
            setSelectedSchemeId(null);
            setSchemeForm(emptySchemeForm);
          }}
          onSubmit={handleSchemeSave}
        />
      )}
      {showCreateModal && activeTab === "courses" && (
        <CourseModal
          form={courseForm}
          isEdit={false}
          isSaving={isSaving}
          programs={programs}
          schemes={schemes}
          sectors={sortedSectors}
          setForm={setCourseForm}
          onClose={() => {
            setShowCreateModal(false);
            setCourseForm(emptyCourseForm);
          }}
          onSubmit={handleCourseSave}
        />
      )}
      {showEditModal && activeTab === "courses" && (
        <CourseModal
          form={courseForm}
          isEdit={true}
          isSaving={isSaving}
          programs={programs}
          schemes={schemes}
          sectors={sortedSectors}
          setForm={setCourseForm}
          onClose={() => {
            setShowEditModal(false);
            setSelectedCourseId(null);
            setCourseForm(emptyCourseForm);
          }}
          onSubmit={handleCourseSave}
        />
      )}
    </div>
  );
}

// ─── Table components ────────────────────────────────────────────────────────

// ─── Mobile lists ─────────────────────────────────────────────────────────────

function ProgramsMobileList({
  isLoading,
  readOnly = false,
  onDelete,
  onEdit,
  onSync,
  onVerify,
  programs,
}: {
  isLoading: boolean;
  readOnly?: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  onSync: (tab: "programs" | "schemes", id: string, label: string) => void;
  onVerify: (tab: "programs" | "schemes", id: string, label: string) => void;
  programs: ProgramRecord[];
}) {
  if (isLoading) return <MobileLoadingState />;
  if (programs.length === 0) {
    return <MobileEmptyState icon={<IconBriefcase className="mx-auto h-8 w-8 text-slate-300" />} message="No programs found" />;
  }

  return (
    <>
      {programs.map((program) => {
        const workflow = resolveSidhWorkflowState(program.verifiedForSidh, program.syncToSidh);
        return (
          <div key={program.id} className="px-4 py-4">
            {readOnly ? (
              <div className="w-full text-left">
                <MasterDataIdentity
                  accentClass="bg-violet-100 text-violet-700"
                  code={program.code}
                  name={program.name}
                  subtitle={program.description}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <WorkflowBadge state={workflow} />
                  <StatusBadge status={program.status} />
                </div>
              </div>
            ) : (
              <>
                <button type="button" onClick={() => onEdit(program.programId)} className="w-full text-left">
                  <MasterDataIdentity
                    accentClass="bg-violet-100 text-violet-700"
                    code={program.code}
                    name={program.name}
                    subtitle={program.description}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <WorkflowBadge state={workflow} />
                    <StatusBadge status={program.status} />
                  </div>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <RowActionButton
                    label={workflow === "draft" ? "Verify" : workflow === "verified" ? "Verified" : "Ready"}
                    onClick={() => onVerify("programs", program.programId, program.name)}
                    icon={<IconCircleCheck className="h-3.5 w-3.5" />}
                    tone={workflow === "draft" ? "primary" : "neutral"}
                    disabled={workflow !== "draft"}
                  />
                  <RowActionButton
                    label={program.syncToSidh ? "Ready" : "Mark ready"}
                    onClick={() => onSync("programs", program.programId, program.name)}
                    icon={<IconRefresh className="h-3.5 w-3.5" />}
                    tone={program.syncToSidh ? "neutral" : "primary"}
                    disabled={workflow !== "verified"}
                  />
                  <EditButton onClick={() => onEdit(program.programId)} />
                  <RowActionButton
                    label="Delete"
                    onClick={() => onDelete("programs", program.programId, program.name)}
                    icon={<IconTrash className="h-3.5 w-3.5" />}
                    tone="danger"
                  />
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function SectorsMobileList({
  isLoading,
  readOnly = false,
  onDelete,
  onEdit,
  sectors,
}: {
  isLoading: boolean;
  readOnly?: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  sectors: SectorRecord[];
}) {
  if (isLoading) return <MobileLoadingState />;
  if (sectors.length === 0) {
    return <MobileEmptyState icon={<IconStack2 className="mx-auto h-8 w-8 text-slate-300" />} message="No sectors found" />;
  }

  return (
    <>
      {sectors.map((sector) => (
        <div key={sector.id} className="px-4 py-4">
          {readOnly ? (
            <div className="w-full text-left">
              <MasterDataIdentity accentClass="bg-sky-100 text-sky-700" code={sector.code} name={sector.name} subtitle={sector.description} />
              <div className="mt-3">
                <StatusBadge status={sector.status} />
              </div>
            </div>
          ) : (
            <>
              <button type="button" onClick={() => onEdit(sector.sectorId)} className="w-full text-left">
                <MasterDataIdentity accentClass="bg-sky-100 text-sky-700" code={sector.code} name={sector.name} subtitle={sector.description} />
              </button>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={sector.status} />
                <div className="flex flex-wrap gap-2">
                  <EditButton onClick={() => onEdit(sector.sectorId)} />
                  <RowActionButton
                    label="Delete"
                    onClick={() => onDelete("sectors", sector.sectorId, sector.name)}
                    icon={<IconTrash className="h-3.5 w-3.5" />}
                    tone="danger"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </>
  );
}

function SchemesMobileList({
  isLoading,
  readOnly = false,
  onDelete,
  onEdit,
  onSync,
  onVerify,
  schemes,
}: {
  isLoading: boolean;
  readOnly?: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  onSync: (tab: "programs" | "schemes", id: string, label: string) => void;
  onVerify: (tab: "programs" | "schemes", id: string, label: string) => void;
  schemes: SchemeRecord[];
}) {
  if (isLoading) return <MobileLoadingState />;
  if (schemes.length === 0) {
    return (
      <MobileEmptyState
        icon={<IconHierarchy className="mx-auto h-8 w-8 text-slate-300" />}
        message="No schemes found"
      />
    );
  }

  return (
    <>
      {schemes.map((scheme) => {
        const workflow = resolveSidhWorkflowState(scheme.verifiedForSidh, scheme.syncEnabled);
        return (
          <div key={scheme.id} className="px-4 py-4">
            {readOnly ? (
              <div className="w-full text-left">
                <MasterDataIdentity
                  accentClass="bg-emerald-100 text-emerald-700"
                  code={scheme.code}
                  name={scheme.name}
                  subtitle={scheme.sidhSchemeId ?? scheme.fundingType ?? undefined}
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <WorkflowBadge state={workflow} />
                  <StatusBadge status={scheme.status} />
                </div>
              </div>
            ) : (
              <>
                <button type="button" onClick={() => onEdit(scheme.schemeId)} className="w-full text-left">
                  <MasterDataIdentity
                    accentClass="bg-emerald-100 text-emerald-700"
                    code={scheme.code}
                    name={scheme.name}
                    subtitle={scheme.sidhSchemeId ?? scheme.fundingType ?? undefined}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <WorkflowBadge state={workflow} />
                    <StatusBadge status={scheme.status} />
                  </div>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <RowActionButton
                    label={workflow === "draft" ? "Verify" : workflow === "verified" ? "Verified" : "Ready"}
                    onClick={() => onVerify("schemes", scheme.schemeId, scheme.name)}
                    icon={<IconCircleCheck className="h-3.5 w-3.5" />}
                    tone={workflow === "draft" ? "primary" : "neutral"}
                    disabled={workflow !== "draft"}
                  />
                  <RowActionButton
                    label={scheme.syncEnabled ? "Ready" : "Mark ready"}
                    onClick={() => onSync("schemes", scheme.schemeId, scheme.name)}
                    icon={<IconRefresh className="h-3.5 w-3.5" />}
                    tone={scheme.syncEnabled ? "neutral" : "primary"}
                    disabled={workflow !== "verified"}
                  />
                  <EditButton onClick={() => onEdit(scheme.schemeId)} />
                  <RowActionButton
                    label="Delete"
                    onClick={() => onDelete("schemes", scheme.schemeId, scheme.name)}
                    icon={<IconTrash className="h-3.5 w-3.5" />}
                    tone="danger"
                  />
                </div>
              </>
            )}
          </div>
        );
      })}
    </>
  );
}

function CoursesMobileList({
  courses,
  isLoading,
  onDelete,
  onEdit,
  onPageChange,
  page,
  pageSize,
  sectorNameById,
  total,
}: {
  courses: CourseRecord[];
  isLoading: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  sectorNameById: Map<string, string>;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (isLoading) return <MobileLoadingState />;
  if (courses.length === 0) {
    return <MobileEmptyState icon={<IconBook className="mx-auto h-8 w-8 text-slate-300" />} message="No courses found" />;
  }

  return (
    <>
      {courses.map((course) => (
        <div key={course.id} className="px-4 py-4">
          <button type="button" onClick={() => onEdit(course.courseId)} className="w-full text-left">
            <MasterDataIdentity
              accentClass="bg-indigo-100 text-indigo-700"
              code={course.sidhCourseId || course.courseCode}
              name={course.courseName}
              subtitle={sectorNameById.get(course.sectorId) ?? undefined}
            />
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
              <span>{course.jobRole}</span>
              <span>·</span>
              <span>{course.totalHours} hours</span>
              {course.nsqfLevel ? (
                <>
                  <span>·</span>
                  <span>NSQF {course.nsqfLevel}</span>
                </>
              ) : null}
            </div>
            <div className="mt-3">
              <ApprovalBadge status={course.approvalStatus} />
            </div>
          </button>
          <div className="mt-3 flex flex-wrap gap-2">
            <EditButton onClick={() => onEdit(course.courseId)} />
            <RowActionButton
              label="Delete"
              onClick={() => onDelete("courses", course.courseId, course.courseName)}
              icon={<IconTrash className="h-3.5 w-3.5" />}
              tone="danger"
            />
          </div>
        </div>
      ))}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
            >
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40"
            >
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MasterDataIdentity({
  accentClass,
  code,
  name,
  subtitle,
}: {
  accentClass: string;
  code: string;
  name: string;
  subtitle?: string | null;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold", accentClass)}>
        {name.trim().charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-slate-900">{name}</div>
        <div className="font-mono text-xs text-slate-500">{code}</div>
        {subtitle ? <div className="mt-0.5 truncate text-xs text-slate-400">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function MobileLoadingState() {
  return (
    <div className="px-4 py-12 text-center text-sm text-slate-400">
      <IconLoader2 className="mx-auto h-6 w-6 animate-spin" />
      <p className="mt-2">Loading…</p>
    </div>
  );
}

function MobileEmptyState({
  hint,
  icon,
  message,
}: {
  hint?: string;
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <div className="px-4 py-12 text-center">
      {icon}
      <p className="mt-2 text-sm font-medium text-slate-500">{message}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

// ─── Tables ────────────────────────────────────────────────────────────────────

function ProgramsTable({
  isLoading,
  readOnly = false,
  onDelete,
  onEdit,
  onVerify,
  onSync,
  programs,
}: {
  isLoading: boolean;
  readOnly?: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  onVerify: (tab: "programs" | "schemes", id: string, label: string) => void;
  onSync: (tab: "programs" | "schemes", id: string, label: string) => void;
  programs: ProgramRecord[];
}) {
  const headers = readOnly ? ["Program", "Code", "Setup status", "Status"] : ["Program", "Code", "Setup status", "Status", ""];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/80">
          {headers.map((h) => (
            <th
              key={h || "actions"}
              className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {isLoading ? (
          <LoadingRow cols={headers.length} />
        ) : programs.length === 0 ? (
          <EmptyRow
            cols={headers.length}
            icon={<IconBriefcase className="mx-auto h-8 w-8 text-slate-300" />}
            message="No programs found"
          />
        ) : (
          programs.map((p) => {
            const workflow = resolveSidhWorkflowState(p.verifiedForSidh, p.syncToSidh);

            return (
              <tr
                key={p.id}
                className={cn("group transition-colors", !readOnly && "cursor-pointer hover:bg-slate-50/80")}
                onClick={readOnly ? undefined : () => onEdit(p.programId)}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700">
                      {p.name.trim().charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      {p.description && (
                        <div className="mt-0.5 max-w-64 truncate text-xs text-slate-400">
                          {p.description}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 font-mono text-xs text-slate-600">{p.code}</td>
                <td className="px-4 py-4">
                  <WorkflowBadge state={workflow} />
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={p.status} />
                </td>
                {!readOnly ? (
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                      <RowActionButton
                        label={workflow === "draft" ? "Verify" : workflow === "verified" ? "Verified" : "Ready"}
                        onClick={() => onVerify("programs", p.programId, p.name)}
                        icon={<IconCircleCheck className="h-3 w-3" />}
                        tone={workflow === "draft" ? "primary" : "neutral"}
                        disabled={workflow !== "draft"}
                      />
                      <RowActionButton
                        label={p.syncToSidh ? "Ready" : "Mark Ready"}
                        onClick={() => onSync("programs", p.programId, p.name)}
                        icon={<IconRefresh className="h-3 w-3" />}
                        tone={p.syncToSidh ? "neutral" : "primary"}
                        disabled={workflow !== "verified"}
                      />
                      <EditButton onClick={() => onEdit(p.programId)} />
                      <RowActionButton
                        label="Delete"
                        onClick={() => onDelete("programs", p.programId, p.name)}
                        icon={<IconTrash className="h-3 w-3" />}
                        tone="danger"
                      />
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function SectorsTable({
  isLoading,
  readOnly = false,
  onDelete,
  onEdit,
  sectors,
}: {
  isLoading: boolean;
  readOnly?: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  sectors: SectorRecord[];
}) {
  const headers = readOnly ? ["Sector", "Code", "Description", "Status"] : ["Sector", "Code", "Description", "Status", ""];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/80">
          {headers.map((h) => (
            <th
              key={h || "actions"}
              className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {isLoading ? (
          <LoadingRow cols={headers.length} />
        ) : sectors.length === 0 ? (
          <EmptyRow
            cols={headers.length}
            icon={<IconStack2 className="mx-auto h-8 w-8 text-slate-300" />}
            message="No sectors found"
          />
        ) : (
          sectors.map((s) => (
            <tr
              key={s.id}
              className={cn("group transition-colors", !readOnly && "cursor-pointer hover:bg-slate-50/80")}
              onClick={readOnly ? undefined : () => onEdit(s.sectorId)}
            >
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700">
                    {s.name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="font-semibold text-slate-900">{s.name}</div>
                </div>
              </td>
              <td className="px-4 py-4 font-mono text-xs text-slate-600">{s.code}</td>
              <td className="max-w-sm px-4 py-4 text-xs text-slate-500">
                {s.description ?? <span className="text-slate-300">—</span>}
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={s.status} />
              </td>
              {!readOnly ? (
                <td className="px-4 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                  <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                    <EditButton onClick={() => onEdit(s.sectorId)} />
                    <RowActionButton
                      label="Delete"
                      onClick={() => onDelete("sectors", s.sectorId, s.name)}
                      icon={<IconTrash className="h-3 w-3" />}
                      tone="danger"
                    />
                  </div>
                </td>
              ) : null}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function SchemesTable({
  isLoading,
  readOnly = false,
  onDelete,
  onEdit,
  onVerify,
  onSync,
  schemes,
}: {
  isLoading: boolean;
  readOnly?: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  onVerify: (tab: "programs" | "schemes", id: string, label: string) => void;
  onSync: (tab: "programs" | "schemes", id: string, label: string) => void;
  schemes: SchemeRecord[];
}) {
  const headers = readOnly
    ? ["Scheme", "Code", "NSDC_SIDH ID", "Setup status", "Valid until", "Status"]
    : ["Scheme", "Code", "NSDC_SIDH ID", "Setup status", "Valid until", "Status", ""];

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/80">
          {headers.map((h) => (
            <th
              key={h || "actions"}
              className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {isLoading ? (
          <LoadingRow cols={headers.length} />
        ) : schemes.length === 0 ? (
          <EmptyRow
            cols={headers.length}
            icon={<IconHierarchy className="mx-auto h-8 w-8 text-slate-300" />}
            message="No schemes found"
          />
        ) : (
          schemes.map((s) => {
            const workflow = resolveSidhWorkflowState(s.verifiedForSidh, s.syncEnabled);

            return (
              <tr
                key={s.id}
                className={cn("group transition-colors", !readOnly && "cursor-pointer hover:bg-slate-50/80")}
                onClick={readOnly ? undefined : () => onEdit(s.schemeId)}
              >
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                      {s.name.trim().charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      {s.fundingType && (
                        <div className="mt-0.5 text-xs text-slate-400">{s.fundingType}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4 font-mono text-xs text-slate-600">{s.code}</td>
                <td className="px-4 py-4">
                  {s.sidhSchemeId ? (
                    <span className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 font-mono text-xs font-semibold text-sky-700">
                      {s.sidhSchemeId}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <WorkflowBadge state={workflow} />
                </td>
                <td className="px-4 py-4 text-xs text-slate-500">
                  {s.validTo ? (
                    new Date(s.validTo).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <StatusBadge status={s.status} />
                </td>
                {!readOnly ? (
                  <td className="px-4 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                      <RowActionButton
                        label={workflow === "draft" ? "Verify" : workflow === "verified" ? "Verified" : "Ready"}
                        onClick={() => onVerify("schemes", s.schemeId, s.name)}
                        icon={<IconCircleCheck className="h-3 w-3" />}
                        tone={workflow === "draft" ? "primary" : "neutral"}
                        disabled={workflow !== "draft"}
                      />
                      <RowActionButton
                        label={s.syncEnabled ? "Ready" : "Mark Ready"}
                        onClick={() => onSync("schemes", s.schemeId, s.name)}
                        icon={<IconRefresh className="h-3 w-3" />}
                        tone={s.syncEnabled ? "neutral" : "primary"}
                        disabled={workflow !== "verified"}
                      />
                      <EditButton onClick={() => onEdit(s.schemeId)} />
                      <RowActionButton
                        label="Delete"
                        onClick={() => onDelete("schemes", s.schemeId, s.name)}
                        icon={<IconTrash className="h-3 w-3" />}
                        tone="danger"
                      />
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

function CoursesTable({
  courses,
  isLoading,
  onDelete,
  onEdit,
  onPageChange,
  page,
  pageSize,
  sectorNameById,
  total,
}: {
  courses: CourseRecord[];
  isLoading: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  onPageChange: (page: number) => void;
  page: number;
  pageSize: number;
  sectorNameById: Map<string, string>;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div>
      <table className="w-full min-w-295 text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80">
            {[
              "Sector Name",
              "Course Name",
              "Course ID",
              "Associated QP/Job Role",
              "NSQF Level",
              "Training Per Day",
              "Status",
              "Approval Date",
              "Total Hours",
              "Validity",
              "Short Form",
              "",
            ].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {isLoading ? (
            <LoadingRow cols={12} />
          ) : courses.length === 0 ? (
            <EmptyRow
              cols={12}
              icon={<IconBook className="mx-auto h-8 w-8 text-slate-300" />}
              message="No courses found"
            />
          ) : (
            courses.map((course) => (
              <tr
                key={course.id}
                className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                onClick={() => onEdit(course.courseId)}
              >
                <td className="px-4 py-4 font-medium text-slate-700">
                  {sectorNameById.get(course.sectorId) ?? <span className="text-slate-300">NA</span>}
                </td>
                <td className="px-4 py-4 font-semibold text-slate-900">{course.courseName}</td>
                <td className="px-4 py-4 font-mono text-xs text-slate-600">{course.sidhCourseId || course.courseCode}</td>
                <td className="px-4 py-4 text-slate-600">{course.jobRole}</td>
                <td className="px-4 py-4 text-slate-600">{course.nsqfLevel || "NA"}</td>
                <td className="px-4 py-4 text-slate-600">{course.trainingPerDayHours ?? "NA"}</td>
                <td className="px-4 py-4">
                  <ApprovalBadge status={course.approvalStatus} />
                </td>
                <td className="px-4 py-4 text-slate-600">{formatDate(course.approvalDate)}</td>
                <td className="px-4 py-4 text-slate-600">{course.totalHours}</td>
                <td className="px-4 py-4 text-slate-600">{formatValidity(course)}</td>
                <td className="px-4 py-4 font-mono text-xs text-slate-600">{course.shortForm || "NA"}</td>
                <td className="px-4 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                    <EditButton onClick={() => onEdit(course.courseId)} />
                    <RowActionButton
                      label="Delete"
                      onClick={() => onDelete("courses", course.courseId, course.courseName)}
                      icon={<IconTrash className="h-3 w-3" />}
                      tone="danger"
                    />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-medium text-slate-500">
          Showing {start} to {end} of {total} courses
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">{page}</span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}


// ─── Modals ──────────────────────────────────────────────────────────────────

type ProgramForm = typeof emptyProgramForm;
type SectorForm = typeof emptySectorForm;
type SchemeForm = typeof emptySchemeForm;
type CourseForm = typeof emptyCourseForm;

const SIDH_BATCH_FIELD_LABELS: Record<SidhBatchFieldKey, string> = {
  assessmentMode: "Assessment Mode",
  batchType: "Batch Type",
  categoryType: "Batch Category (type)",
  feePaidBy: "Fee Paid By",
  createdSource: "Created Source",
};

function SidhBatchFieldOptionEditor({
  field,
  formValue,
  isSaving,
  onAddOption,
  onRemoveOption,
  options,
  setFormValue,
}: {
  field: SidhBatchFieldKey;
  formValue: string;
  isSaving: boolean;
  onAddOption: (field: SidhBatchFieldKey, label: string) => Promise<void>;
  onRemoveOption: (referenceValueId: string) => Promise<void>;
  options: SidhBatchFieldOptionsResponse[SidhBatchFieldKey]["options"];
  setFormValue: (value: string) => void;
}) {
  const [draftLabel, setDraftLabel] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleAddOption() {
    const label = draftLabel.trim();
    if (!label) {
      return;
    }

    setIsUpdating(true);
    try {
      await onAddOption(field, label);
      setDraftLabel("");
      setFormValue(label);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleRemoveOption(referenceValueId: string, label: string) {
    if (!window.confirm(`Remove "${label}" from ${SIDH_BATCH_FIELD_LABELS[field]} options?`)) {
      return;
    }

    setIsUpdating(true);
    try {
      await onRemoveOption(referenceValueId);
      if (formValue === label) {
        const remaining = options.filter((option) => option.referenceValueId !== referenceValueId);
        setFormValue(remaining[0]?.label ?? SIDH_BATCH_FIELD_OPTIONS[field][0]);
      }
    } finally {
      setIsUpdating(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-violet-100 bg-white/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700">Manage options</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <span
            key={option.referenceValueId}
            className="inline-flex items-center gap-1 rounded-full border border-violet-100 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-900"
          >
            {option.label}
            <button
              type="button"
              disabled={isSaving || isUpdating || options.length <= 1}
              onClick={() => void handleRemoveOption(option.referenceValueId, option.label)}
              className="rounded-full p-0.5 text-violet-500 transition hover:bg-violet-100 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Remove ${option.label}`}
            >
              <IconX className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draftLabel}
          onChange={(event) => setDraftLabel(event.target.value)}
          className={inputCls}
          placeholder={`Add ${SIDH_BATCH_FIELD_LABELS[field].toLowerCase()} option`}
          disabled={isSaving || isUpdating}
        />
        <button
          type="button"
          disabled={isSaving || isUpdating || !draftLabel.trim()}
          onClick={() => void handleAddOption()}
          className="shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function ProgramModal({
  form,
  isEdit,
  isSaving,
  onAddSidhFieldOption,
  onClose,
  onRemoveSidhFieldOption,
  onSubmit,
  setForm,
  sidhFieldOptionLabels,
  sidhFieldOptions,
}: {
  form: ProgramForm;
  isEdit: boolean;
  isSaving: boolean;
  onAddSidhFieldOption?: (field: SidhBatchFieldKey, label: string) => Promise<void>;
  onClose: () => void;
  onRemoveSidhFieldOption?: (referenceValueId: string) => Promise<void>;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<ProgramForm>>;
  sidhFieldOptionLabels: SidhBatchFieldOptionsMap;
  sidhFieldOptions?: SidhBatchFieldOptionsResponse | null;
}) {
  return (
    <Modal
      icon={<IconBriefcase className="h-5 w-5" />}
      iconBg="bg-violet-100 text-violet-600"
      subtitle={isEdit ? "Update the program details below." : "Add a new program to the platform."}
      title={isEdit ? "Edit Program" : "Create Program"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Program Name">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="NSDC Market Led Programme"
              required
            />
          </FormField>
          <FormField label="Program Code">
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className={inputCls}
              placeholder="NSQF"
              required
            />
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))
              }
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>
          <FormField label="Skilling Category ID">
            <input
              type="number"
              min="1"
              value={form.skillingCategoryId}
              onChange={(e) => setForm((f) => ({ ...f, skillingCategoryId: e.target.value }))}
              className={inputCls}
              placeholder="1"
              required
            />
          </FormField>
          <FormField label="Skilling Category Name">
            <input
              value={form.skillingCategoryName}
              onChange={(e) => setForm((f) => ({ ...f, skillingCategoryName: e.target.value }))}
              className={inputCls}
              placeholder="NSDC Market led programme"
            />
          </FormField>
          <FormField label="Skilling Category Scheme">
            <input
              value={form.skillingCategoryScheme}
              onChange={(e) => setForm((f) => ({ ...f, skillingCategoryScheme: e.target.value }))}
              className={inputCls}
              placeholder="Fee Based"
            />
          </FormField>
        </div>
        {isEdit ? (
          <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">SIDH Batch Payload Defaults</p>
            <p className="mb-4 text-xs text-slate-500">
              These values are used automatically when creating batches for courses linked to this program. You can also
              add or remove dropdown options here.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Assessment Mode">
                <select
                  value={form.assessmentMode}
                  onChange={(e) => setForm((f) => ({ ...f, assessmentMode: e.target.value }))}
                  className={inputCls}
                >
                  {sidhFieldOptionLabels.assessmentMode.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {sidhFieldOptions && onAddSidhFieldOption && onRemoveSidhFieldOption ? (
                  <SidhBatchFieldOptionEditor
                    field="assessmentMode"
                    formValue={form.assessmentMode}
                    isSaving={isSaving}
                    options={sidhFieldOptions.assessmentMode.options}
                    onAddOption={onAddSidhFieldOption}
                    onRemoveOption={onRemoveSidhFieldOption}
                    setFormValue={(value) => setForm((f) => ({ ...f, assessmentMode: value }))}
                  />
                ) : null}
              </FormField>
              <FormField label="Batch Type">
                <select
                  value={form.batchType}
                  onChange={(e) => setForm((f) => ({ ...f, batchType: e.target.value }))}
                  className={inputCls}
                >
                  {sidhFieldOptionLabels.batchType.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {sidhFieldOptions && onAddSidhFieldOption && onRemoveSidhFieldOption ? (
                  <SidhBatchFieldOptionEditor
                    field="batchType"
                    formValue={form.batchType}
                    isSaving={isSaving}
                    options={sidhFieldOptions.batchType.options}
                    onAddOption={onAddSidhFieldOption}
                    onRemoveOption={onRemoveSidhFieldOption}
                    setFormValue={(value) => setForm((f) => ({ ...f, batchType: value }))}
                  />
                ) : null}
              </FormField>
              <FormField label="Batch Category (type)">
                <select
                  value={form.batchCategoryType}
                  onChange={(e) => setForm((f) => ({ ...f, batchCategoryType: e.target.value }))}
                  className={inputCls}
                >
                  {sidhFieldOptionLabels.categoryType.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {sidhFieldOptions && onAddSidhFieldOption && onRemoveSidhFieldOption ? (
                  <SidhBatchFieldOptionEditor
                    field="categoryType"
                    formValue={form.batchCategoryType}
                    isSaving={isSaving}
                    options={sidhFieldOptions.categoryType.options}
                    onAddOption={onAddSidhFieldOption}
                    onRemoveOption={onRemoveSidhFieldOption}
                    setFormValue={(value) => setForm((f) => ({ ...f, batchCategoryType: value }))}
                  />
                ) : null}
              </FormField>
              <FormField label="Fee Paid By">
                <select
                  value={form.feePaidBy}
                  onChange={(e) => setForm((f) => ({ ...f, feePaidBy: e.target.value }))}
                  className={inputCls}
                >
                  {sidhFieldOptionLabels.feePaidBy.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {sidhFieldOptions && onAddSidhFieldOption && onRemoveSidhFieldOption ? (
                  <SidhBatchFieldOptionEditor
                    field="feePaidBy"
                    formValue={form.feePaidBy}
                    isSaving={isSaving}
                    options={sidhFieldOptions.feePaidBy.options}
                    onAddOption={onAddSidhFieldOption}
                    onRemoveOption={onRemoveSidhFieldOption}
                    setFormValue={(value) => setForm((f) => ({ ...f, feePaidBy: value }))}
                  />
                ) : null}
              </FormField>
              <FormField label="Created Source">
                <select
                  value={form.createdSource}
                  onChange={(e) => setForm((f) => ({ ...f, createdSource: e.target.value }))}
                  className={inputCls}
                >
                  {sidhFieldOptionLabels.createdSource.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {sidhFieldOptions && onAddSidhFieldOption && onRemoveSidhFieldOption ? (
                  <SidhBatchFieldOptionEditor
                    field="createdSource"
                    formValue={form.createdSource}
                    isSaving={isSaving}
                    options={sidhFieldOptions.createdSource.options}
                    onAddOption={onAddSidhFieldOption}
                    onRemoveOption={onRemoveSidhFieldOption}
                    setFormValue={(value) => setForm((f) => ({ ...f, createdSource: value }))}
                  />
                ) : null}
              </FormField>
            </div>
          </div>
        ) : null}
        <FormField label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={`${inputCls} min-h-20 py-2.5`}
            placeholder="Optional description…"
          />
        </FormField>
        <p className="text-xs text-slate-400">
          Save the program in the local database first. Use the table action to mark it ready for SIDH after verification.
        </p>
        <ModalFooter isEdit={isEdit} isSaving={isSaving} onClose={onClose} />
      </form>
    </Modal>
  );
}

function SectorModal({
  form,
  isEdit,
  isSaving,
  onClose,
  onSubmit,
  setForm,
}: {
  form: SectorForm;
  isEdit: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<SectorForm>>;
}) {
  return (
    <Modal
      icon={<IconStack2 className="h-5 w-5" />}
      iconBg="bg-sky-100 text-sky-600"
      subtitle={isEdit ? "Update the sector details below." : "Add a new sector to organise courses and schemes."}
      title={isEdit ? "Edit Sector" : "Create Sector"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Sector Name">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="IT-ITeS"
              required
            />
          </FormField>
          <FormField label="Sector Code">
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className={inputCls}
              placeholder="IT"
              required
            />
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))
              }
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>
        </div>
        <FormField label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={`${inputCls} min-h-20 py-2.5`}
            placeholder="Optional description…"
          />
        </FormField>
        <ModalFooter isEdit={isEdit} isSaving={isSaving} onClose={onClose} />
      </form>
    </Modal>
  );
}

function SchemeModal({
  form,
  isEdit,
  isSaving,
  onClose,
  onSubmit,
  setForm,
}: {
  form: SchemeForm;
  isEdit: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<SchemeForm>>;
}) {
  return (
    <Modal
      icon={<IconHierarchy className="h-5 w-5" />}
      iconBg="bg-emerald-100 text-emerald-600"
      subtitle={isEdit ? "Update scheme eligibility and sync settings." : "Add a new SIDH-linked scheme."}
      title={isEdit ? "Edit Scheme" : "Create Scheme"}
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Scheme Name">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputCls}
              placeholder="Fee Based"
              required
            />
          </FormField>
          <FormField label="Scheme Code">
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className={inputCls}
              placeholder="FEE_BASED"
              required
            />
          </FormField>
          <FormField label="SIDH Scheme ID">
            <input
              value={form.sidhSchemeId}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => ({ ...f, sidhSchemeId: value, sidhSchemeReferenceId: value }));
              }}
              className={inputCls}
              placeholder="Scheme_2"
            />
          </FormField>
          <FormField label="SIDH Scheme Reference ID">
            <input
              value={form.sidhSchemeReferenceId}
              onChange={(e) => {
                const value = e.target.value;
                setForm((f) => ({ ...f, sidhSchemeId: value, sidhSchemeReferenceId: value }));
              }}
              className={inputCls}
              placeholder="Scheme_2"
            />
          </FormField>
          <FormField label="Scheme Type">
            <input
              value={form.sidhSchemeType}
              onChange={(e) => setForm((f) => ({ ...f, sidhSchemeType: e.target.value }))}
              className={inputCls}
              placeholder="feeBased"
            />
          </FormField>
          <FormField label="Status">
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as "active" | "inactive" }))
              }
              className={inputCls}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormField>
          <FormField label="Funding Type">
            <input
              value={form.fundingType}
              onChange={(e) => setForm((f) => ({ ...f, fundingType: e.target.value }))}
              className={inputCls}
              placeholder="Optional internal label"
            />
          </FormField>
          <FormField label="Beneficiary Type">
            <input
              value={form.beneficiaryType}
              onChange={(e) => setForm((f) => ({ ...f, beneficiaryType: e.target.value }))}
              className={inputCls}
              placeholder="Individual"
            />
          </FormField>
          <FormField label="Valid From">
            <input
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              className={inputCls}
            />
          </FormField>
          <FormField label="Valid To">
            <input
              type="date"
              value={form.validTo}
              onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
              className={inputCls}
            />
          </FormField>
        </div>
        <FormField label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={`${inputCls} min-h-20 py-2.5`}
            placeholder="Optional description…"
          />
        </FormField>
        <p className="text-xs text-slate-400">
          Save the scheme in the local database first. After verification, use the table action to mark it ready for SIDH using the stored SIDH Scheme ID.
        </p>
        <ModalFooter isEdit={isEdit} isSaving={isSaving} onClose={onClose} />
      </form>
    </Modal>
  );
}

function CourseModal({
  form,
  isEdit,
  isSaving,
  onClose,
  onSubmit,
  programs,
  schemes,
  sectors,
  setForm,
}: {
  form: CourseForm;
  isEdit: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  programs: ProgramRecord[];
  schemes: SchemeRecord[];
  sectors: SectorRecord[];
  setForm: React.Dispatch<React.SetStateAction<CourseForm>>;
}) {
  return (
    <Modal
      icon={<IconBook className="h-5 w-5" />}
      iconBg="bg-indigo-100 text-indigo-600"
      subtitle={isEdit ? "Update the course details below." : "Add a course to the local master data."}
      title={isEdit ? "Edit Course" : "Add Course"}
      wide
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Sector Name">
            <select
              value={form.sectorId}
              onChange={(e) => setForm((current) => ({ ...current, sectorId: e.target.value }))}
              className={inputCls}
              required
            >
              <option value="">Select sector</option>
              {sectors.map((sector) => (
                <option key={sector.sectorId} value={sector.sectorId}>
                  {sector.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Linked Program">
            <select
              value={form.programId}
              onChange={(e) => setForm((current) => ({ ...current, programId: e.target.value }))}
              className={inputCls}
              required
            >
              <option value="">Select program</option>
              {programs.map((program) => (
                <option key={program.programId} value={program.programId}>
                  {program.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Linked Scheme">
            <select
              value={form.schemeId}
              onChange={(e) => setForm((current) => ({ ...current, schemeId: e.target.value }))}
              className={inputCls}
              required
            >
              <option value="">Select scheme</option>
              {schemes.map((scheme) => (
                <option key={scheme.schemeId} value={scheme.schemeId}>
                  {scheme.name}
                  {scheme.sidhSchemeId ? ` (${scheme.sidhSchemeId})` : ""}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Course Name">
            <input
              value={form.courseName}
              onChange={(e) => setForm((current) => ({ ...current, courseName: e.target.value }))}
              className={inputCls}
              placeholder="Maize Cultivator"
              required
            />
          </FormField>
          <FormField label="SIDH Course ID">
            <input
              value={form.sidhCourseId}
              onChange={(e) => setForm((current) => ({ ...current, sidhCourseId: e.target.value }))}
              className={inputCls}
              placeholder="FeeSchCor_48128"
              required
            />
          </FormField>
          <FormField label="Associated QP/Job Role">
            <input
              value={form.jobRole}
              onChange={(e) => setForm((current) => ({ ...current, jobRole: e.target.value }))}
              className={inputCls}
              placeholder="Kisan Drone Operator"
              required
            />
          </FormField>
          <FormField label="NSQF Level">
            <input
              value={form.nsqfLevel}
              onChange={(e) => setForm((current) => ({ ...current, nsqfLevel: e.target.value }))}
              className={inputCls}
              placeholder="NA"
              required
            />
          </FormField>
          <FormField label="Training Per Day (Hours)">
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={form.trainingPerDayHours}
              onChange={(e) => setForm((current) => ({ ...current, trainingPerDayHours: e.target.value }))}
              className={inputCls}
              placeholder="6"
              required
            />
          </FormField>
          <FormField label="Status">
            <select
              value={form.approvalStatus}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  approvalStatus: e.target.value as "approved" | "pending",
                }))
              }
              className={inputCls}
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          </FormField>
          <FormField label="Approval Date">
            <input
              type="date"
              value={form.approvalDate}
              onChange={(e) => setForm((current) => ({ ...current, approvalDate: e.target.value }))}
              className={inputCls}
            />
          </FormField>
          <FormField label="Total Hours">
            <input
              type="number"
              min="1"
              value={form.totalHours}
              onChange={(e) => setForm((current) => ({ ...current, totalHours: e.target.value }))}
              className={inputCls}
              placeholder="12"
              required
            />
          </FormField>
          <FormField label="Valid Until">
            <input
              type="date"
              value={form.validUntil}
              onChange={(e) => setForm((current) => ({ ...current, validUntil: e.target.value }))}
              className={inputCls}
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Single expiry date for the SIDH course mapping. Validity starts from the approval date (or today if blank).
            </p>
          </FormField>
          <FormField label="Short Form">
            <input
              value={form.shortForm}
              onChange={(e) => setForm((current) => ({ ...current, shortForm: e.target.value }))}
              className={inputCls}
              placeholder="MC"
              required
            />
          </FormField>
        </div>
        <ModalFooter isEdit={isEdit} isSaving={isSaving} onClose={onClose} />
      </form>
    </Modal>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function Modal({
  children,
  icon,
  iconBg,
  onClose,
  subtitle,
  title,
  wide = false,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  iconBg: string;
  onClose: () => void;
  subtitle: string;
  title: string;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${wide ? "max-w-3xl" : "max-w-xl"}`}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className={`rounded-xl p-2.5 ${iconBg}`}>{icon}</span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
        {/* Scrollable body */}
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ModalFooter({
  isEdit,
  isSaving,
  onClose,
}: {
  isEdit: boolean;
  isSaving: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={onClose}
        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSaving ? (
          <IconLoader2 className="h-4 w-4 animate-spin" />
        ) : isEdit ? (
          <Save className="h-4 w-4" />
        ) : (
          <IconPlus className="h-4 w-4" />
        )}
        {isEdit ? "Save Changes" : "Create"}
      </button>
    </div>
  );
}

function StatCard({
  active = false,
  icon,
  label,
  onClick,
  value,
}: {
  active?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  value: number | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col gap-3 rounded-3xl border bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md sm:p-5",
        active ? "border-sky-300 ring-1 ring-sky-200" : "border-slate-200"
      )}
    >
      <span className="text-neutral-400">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-neutral-900">
          {value === null ? (
            <span className="inline-block h-7 w-10 animate-pulse rounded bg-neutral-200" />
          ) : (
            value.toLocaleString()
          )}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">{label}</p>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", status === "active" ? "bg-emerald-500" : "bg-slate-400")} />
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

function ApprovalBadge({ status }: { status: CourseRecord["approvalStatus"] }) {
  const isApproved = status === "approved";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        isApproved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isApproved ? "bg-emerald-500" : "bg-amber-500"}`} />
      {isApproved ? "Approved" : "Pending"}
    </span>
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "NA";
  }

  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function formatValidity(course: CourseRecord) {
  if (course.validityEndDate) {
    const until = new Date(course.validityEndDate).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    if (course.validityStartDate) {
      const from = new Date(course.validityStartDate).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      return `${from} → ${until}`;
    }

    return `Until ${until}`;
  }

  return course.validity ? `${course.validity} days` : "NA";
}

function WorkflowBadge({ state }: { state: SidhWorkflowState }) {
  const className =
    state === "ready"
      ? "bg-sky-50 text-sky-700"
      : state === "verified"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-500";

  const label = state === "ready" ? "Ready for sync" : state === "verified" ? "Verified" : "Needs setup";

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {label}
    </span>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:border-sky-300 hover:text-sky-700"
    >
      <IconPencil className="h-3 w-3" />
      Edit
    </button>
  );
}

function RowActionButton({
  disabled = false,
  icon,
  label,
  onClick,
  tone = "neutral",
}: {
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "danger" | "neutral" | "primary";
}) {
  const toneClassName =
    tone === "danger"
      ? "border-rose-200 text-rose-600 hover:border-rose-300 hover:text-rose-700"
      : tone === "primary"
        ? "border-sky-200 text-sky-700 hover:border-sky-300 hover:text-sky-800"
        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-xs font-medium shadow-sm transition ${toneClassName} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {icon}
      {label}
    </button>
  );
}

function FormField({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function LoadingRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-16 text-center text-sm text-slate-400">
        <IconLoader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2">Loading…</p>
      </td>
    </tr>
  );
}

function EmptyRow({
  cols,
  hint,
  icon,
  message,
}: {
  cols: number;
  hint?: string;
  icon: React.ReactNode;
  message: string;
}) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-16 text-center">
        {icon}
        <p className="mt-2 text-sm font-medium text-slate-500">{message}</p>
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </td>
    </tr>
  );
}

const inputCls =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100";
