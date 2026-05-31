"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  BriefcaseBusiness,
  Layers3,
  LoaderCircle,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError } from "@/lib/client/api";

type MasterDataManagerProps = {
  portal: "admin" | "training_partner";
};

type ProgramRecord = {
  code: string;
  description: string | null;
  id: string;
  name: string;
  programId: string;
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
  beneficiaryType: string | null;
  code: string;
  description: string | null;
  fundingType: string | null;
  id: string;
  name: string;
  schemeId: string;
  sidhSchemeId: string | null;
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
  sectorId: string;
  shortForm: string | null;
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

const TABS: Array<{ icon: React.ReactNode; id: Tab; label: string }> = [
  { icon: <BriefcaseBusiness className="h-4 w-4" />, id: "programs", label: "Programs" },
  { icon: <Layers3 className="h-4 w-4" />, id: "sectors", label: "Sectors" },
  { icon: <Network className="h-4 w-4" />, id: "schemes", label: "Schemes" },
  { icon: <BookOpenText className="h-4 w-4" />, id: "courses", label: "Courses" },
];

// Default seed values from NsdcConstants.java / sidh-defaults.ts
const SIDH_SEED = {
  program: {
    code: "NSDC_MARKET_LED_PROGRAMME",
    description: "Default local program seeded from the legacy SIDH constants.",
    name: "NSDC Market led programme",
    status: "active" as const,
    syncToSidh: false,
  },
  sector: {
    code: "GENERAL",
    description: "Default local sector seeded for starter master data setup.",
    name: "General",
    status: "active" as const,
  },
  scheme: {
    beneficiaryType: "",
    code: "Scheme_2",
    description: "Default local scheme seeded from the legacy SIDH constants.",
    fundingType: "",
    name: "Fee Based",
    sidhSchemeId: "Scheme_2",
    status: "active" as const,
    syncEnabled: false,
  },
};

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

const emptyProgramForm = {
  code: "",
  description: "",
  name: "",
  status: "active" as "active" | "inactive",
  syncToSidh: false,
};

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
  status: "active" as "active" | "inactive",
  syncEnabled: false,
  validFrom: "",
  validTo: "",
};

const emptyCourseForm = {
  approvalDate: "",
  approvalStatus: "pending" as "approved" | "pending",
  courseCode: "",
  courseName: "",
  jobRole: "",
  nsqfLevel: "",
  sectorId: "",
  shortForm: "",
  totalHours: "",
  trainingPerDayHours: "",
  validity: "",
};

export default function MasterDataManager({ portal }: MasterDataManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>("programs");
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [sectors, setSectors] = useState<SectorRecord[]>([]);
  const [schemes, setSchemes] = useState<SchemeRecord[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [coursePage, setCoursePage] = useState(1);
  const [coursePageSize] = useState(10);
  const [courseTotal, setCourseTotal] = useState(0);

  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const [programForm, setProgramForm] = useState(emptyProgramForm);
  const [sectorForm, setSectorForm] = useState(emptySectorForm);
  const [schemeForm, setSchemeForm] = useState(emptySchemeForm);
  const [courseForm, setCourseForm] = useState(emptyCourseForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const selectedProgram = programs.find((p) => p.programId === selectedProgramId) ?? null;
  const selectedScheme = schemes.find((s) => s.schemeId === selectedSchemeId) ?? null;
  const selectedCourse = courses.find((course) => course.courseId === selectedCourseId) ?? null;

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    setSearchQuery("");
    setStatusFilter("all");
    if (tab === "courses") setCoursePage(1);
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

  const filteredSectors = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return sectors.filter((s) => {
      const match = !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q);
      const status = statusFilter === "all" || s.status === statusFilter;
      return match && status;
    });
  }, [sectors, searchQuery, statusFilter]);

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

  async function loadData() {
    setIsLoading(true);
    try {
      const [programData, sectorData, schemeData, courseData] = await Promise.all([
        apiFetch<PagedResponse<ProgramRecord>>("/api/v1/masters/programs?page=1&pageSize=100"),
        apiFetch<PagedResponse<SectorRecord>>("/api/v1/masters/sectors?page=1&pageSize=100"),
        apiFetch<PagedResponse<SchemeRecord>>("/api/v1/masters/schemes?page=1&pageSize=100"),
        apiFetch<PagedResponse<CourseRecord>>(`/api/v1/masters/courses?page=${coursePage}&pageSize=${coursePageSize}`),
      ]);
      setPrograms(programData.items);
      setSectors(sectorData.items);
      setSchemes(schemeData.items);
      setCourses(courseData.items);
      setCourseTotal(courseData.total);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load master data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [coursePage]);

  function openCreateModal() {
    if (activeTab === "programs") setProgramForm(emptyProgramForm);
    else if (activeTab === "sectors") setSectorForm(emptySectorForm);
    else if (activeTab === "schemes") setSchemeForm(emptySchemeForm);
    else setCourseForm({ ...emptyCourseForm, sectorId: sectors[0]?.sectorId ?? "" });
    setShowCreateModal(true);
  }

  function openEditModal(id: string) {
    if (activeTab === "programs") {
      const prog = programs.find((p) => p.programId === id);
      if (!prog) return;
      setSelectedProgramId(prog.programId);
      setProgramForm({
        code: prog.code,
        description: prog.description ?? "",
        name: prog.name,
        status: prog.status,
        syncToSidh: prog.syncToSidh,
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
        courseCode: course.courseCode,
        courseName: course.courseName,
        jobRole: course.jobRole,
        nsqfLevel: String(course.nsqfLevel ?? ""),
        sectorId: course.sectorId,
        shortForm: course.shortForm ?? "",
        totalHours: String(course.totalHours ?? ""),
        trainingPerDayHours: String(course.trainingPerDayHours ?? ""),
        validity: String(course.validity ?? ""),
      });
    }
    setShowEditModal(true);
  }

  async function handleProgramSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSaving(true);
    try {
      if (selectedProgram) {
        await apiFetch(`/api/v1/masters/programs/${selectedProgram.programId}`, {
          method: "PATCH",
          body: JSON.stringify(programForm),
        });
        toast.success("Program updated");
        setShowEditModal(false);
      } else {
        await apiFetch("/api/v1/masters/programs", {
          method: "POST",
          body: JSON.stringify(programForm),
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
      await apiFetch("/api/v1/masters/sectors", {
        method: "POST",
        body: JSON.stringify(sectorForm),
      });
      toast.success("Sector created");
      setSectorForm(emptySectorForm);
      setShowCreateModal(false);
      await loadData();
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to create sector");
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
    const payload = {
      ...courseForm,
      approvalDate: courseForm.approvalDate || undefined,
      totalHours: Number(courseForm.totalHours),
      trainingPerDayHours: Number(courseForm.trainingPerDayHours),
      validity: Number(courseForm.validity),
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

  async function handleSeedDefaults() {
    setIsSeeding(true);
    const results = await Promise.allSettled([
      apiFetch("/api/v1/masters/programs", {
        method: "POST",
        body: JSON.stringify(SIDH_SEED.program),
      }),
      apiFetch("/api/v1/masters/sectors", {
        method: "POST",
        body: JSON.stringify(SIDH_SEED.sector),
      }),
      apiFetch("/api/v1/masters/schemes", {
        method: "POST",
        body: JSON.stringify(SIDH_SEED.scheme),
      }),
    ]);
    const created = results.filter((r) => r.status === "fulfilled").length;
    const alreadyExist = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof ClientApiError && r.reason.status === 409,
    ).length;
    const errors = results.length - created - alreadyExist;
    if (created > 0) toast.success(`Seeded ${created} default SIDH record(s)`);
    if (alreadyExist > 0) toast.success(`${alreadyExist} default(s) already exist — no changes needed`);
    if (errors > 0) toast.error(`${errors} default(s) could not be created`);
    await loadData();
    setIsSeeding(false);
  }

  const addLabel =
    activeTab === "programs"
      ? "New Program"
      : activeTab === "sectors"
        ? "New Sector"
          : activeTab === "schemes"
            ? "New Scheme"
            : "Add Course";

  const statusCounts = {
    active: activeList.filter((i) => i.status === "active").length,
    all: activeList.length,
    inactive: activeList.filter((i) => i.status === "inactive").length,
  };

  return (
    <div className="flex min-h-full flex-col bg-slate-50">
      {/* ── Sticky header ───────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">
              {portal === "admin" ? "Operations" : "Scoped Operations"}
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900">Master Data</h1>
            <p className="mt-1 text-sm text-slate-500">
              Save records to the local database first, then explicitly mark eligible items ready for SIDH.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startTransition(() => void loadData())}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              title="Seeds the default local DB values from the legacy SIDH constants; mark them ready later after verification"
              onClick={() => void handleSeedDefaults()}
              disabled={isSeeding}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:border-amber-300 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSeeding ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Seed Defaults
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
            >
              <Plus className="h-4 w-4" />
              {addLabel}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-6">
        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            icon={<BriefcaseBusiness className="h-5 w-5" />}
            iconBg="bg-violet-100 text-violet-600"
            label="Programs"
            value={programs.length}
            accent="text-violet-600"
            active={activeTab === "programs"}
            onClick={() => switchTab("programs")}
          />
          <StatCard
            icon={<Layers3 className="h-5 w-5" />}
            iconBg="bg-sky-100 text-sky-600"
            label="Sectors"
            value={sectors.length}
            accent="text-sky-600"
            active={activeTab === "sectors"}
            onClick={() => switchTab("sectors")}
          />
          <StatCard
            icon={<Network className="h-5 w-5" />}
            iconBg="bg-emerald-100 text-emerald-600"
            label="Schemes"
            value={schemes.length}
            accent="text-emerald-600"
            active={activeTab === "schemes"}
            onClick={() => switchTab("schemes")}
          />
          <StatCard
            icon={<BookOpenText className="h-5 w-5" />}
            iconBg="bg-indigo-100 text-indigo-600"
            label="Courses"
            value={courseTotal}
            accent="text-indigo-600"
            active={activeTab === "courses"}
            onClick={() => switchTab("courses")}
          />
        </div>

        {/* ── Main table card ─────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Tab bar */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 px-5 pt-3">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => switchTab(tab.id)}
                className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  activeTab === tab.id
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab.icon}
                {tab.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    activeTab === tab.id
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {{ programs: programs.length, sectors: sectors.length, schemes: schemes.length, courses: courseTotal }[tab.id]}
                </span>
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-1">
              {(["all", "active", "inactive"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    statusFilter === s
                      ? "bg-slate-900 text-white"
                      : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  }`}
                >
                  {s}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      statusFilter === s ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {statusCounts[s]}
                  </span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name or code…"
                className="h-9 w-72 rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-8 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:bg-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Table content per tab */}
          <div className="overflow-x-auto">
            {activeTab === "programs" && (
              <ProgramsTable
                isLoading={isLoading}
                onDelete={handleDelete}
                programs={filteredPrograms}
                onEdit={(id) => openEditModal(id)}
                onVerify={handleVerify}
                onSync={handleSync}
              />
            )}
            {activeTab === "sectors" && (
              <SectorsTable isLoading={isLoading} onDelete={handleDelete} sectors={filteredSectors} />
            )}
            {activeTab === "schemes" && (
              <SchemesTable
                isLoading={isLoading}
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
                isLoading={isLoading}
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
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────── */}
      {showCreateModal && activeTab === "programs" && (
        <ProgramModal
          form={programForm}
          isEdit={false}
          isSaving={isSaving}
          setForm={setProgramForm}
          onClose={() => {
            setShowCreateModal(false);
            setProgramForm(emptyProgramForm);
          }}
          onSubmit={handleProgramSave}
        />
      )}
      {showEditModal && activeTab === "programs" && (
        <ProgramModal
          form={programForm}
          isEdit={true}
          isSaving={isSaving}
          setForm={setProgramForm}
          onClose={() => {
            setShowEditModal(false);
            setSelectedProgramId(null);
            setProgramForm(emptyProgramForm);
          }}
          onSubmit={handleProgramSave}
        />
      )}
      {showCreateModal && activeTab === "sectors" && (
        <SectorModal
          form={sectorForm}
          isSaving={isSaving}
          setForm={setSectorForm}
          onClose={() => {
            setShowCreateModal(false);
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
          sectors={sectors}
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
          sectors={sectors}
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

function ProgramsTable({
  isLoading,
  onDelete,
  onEdit,
  onVerify,
  onSync,
  programs,
}: {
  isLoading: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  onVerify: (tab: "programs" | "schemes", id: string, label: string) => void;
  onSync: (tab: "programs" | "schemes", id: string, label: string) => void;
  programs: ProgramRecord[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/80">
          {["Program", "Code", "Workflow", "Status", ""].map((h) => (
            <th
              key={h}
              className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {isLoading ? (
          <LoadingRow cols={5} />
        ) : programs.length === 0 ? (
          <EmptyRow
            cols={5}
            icon={<BriefcaseBusiness className="mx-auto h-8 w-8 text-slate-300" />}
            message="No programs found"
          />
        ) : (
          programs.map((p) => {
            const workflow = resolveSidhWorkflowState(p.verifiedForSidh, p.syncToSidh);

            return (
              <tr
                key={p.id}
                className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                onClick={() => onEdit(p.programId)}
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
                <td className="px-4 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                    <RowActionButton
                      label={workflow === "draft" ? "Verify" : workflow === "verified" ? "Verified" : "Ready"}
                      onClick={() => onVerify("programs", p.programId, p.name)}
                      icon={<Save className="h-3 w-3" />}
                      tone={workflow === "draft" ? "primary" : "neutral"}
                      disabled={workflow !== "draft"}
                    />
                    <RowActionButton
                      label={p.syncToSidh ? "Ready" : "Mark Ready"}
                      onClick={() => onSync("programs", p.programId, p.name)}
                      icon={<RefreshCw className="h-3 w-3" />}
                      tone={p.syncToSidh ? "neutral" : "primary"}
                      disabled={workflow !== "verified"}
                    />
                    <EditButton onClick={() => onEdit(p.programId)} />
                    <RowActionButton
                      label="Delete"
                      onClick={() => onDelete("programs", p.programId, p.name)}
                      icon={<Trash2 className="h-3 w-3" />}
                      tone="danger"
                    />
                  </div>
                </td>
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
  onDelete,
  sectors,
}: {
  isLoading: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  sectors: SectorRecord[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/80">
          {["Sector", "Code", "Description", "Status", ""].map((h) => (
            <th
              key={h}
              className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {isLoading ? (
          <LoadingRow cols={5} />
        ) : sectors.length === 0 ? (
          <EmptyRow
            cols={5}
            icon={<Layers3 className="mx-auto h-8 w-8 text-slate-300" />}
            message="No sectors found"
          />
        ) : (
          sectors.map((s) => (
            <tr key={s.id} className="group transition-colors hover:bg-slate-50/80">
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
              <td className="px-4 py-4 text-right">
                <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                  <RowActionButton
                    label="Delete"
                    onClick={() => onDelete("sectors", s.sectorId, s.name)}
                    icon={<Trash2 className="h-3 w-3" />}
                    tone="danger"
                  />
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function SchemesTable({
  isLoading,
  onDelete,
  onEdit,
  onVerify,
  onSync,
  schemes,
}: {
  isLoading: boolean;
  onDelete: (tab: Tab, id: string, label: string) => void;
  onEdit: (id: string) => void;
  onVerify: (tab: "programs" | "schemes", id: string, label: string) => void;
  onSync: (tab: "programs" | "schemes", id: string, label: string) => void;
  schemes: SchemeRecord[];
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 bg-slate-50/80">
          {["Scheme", "Code", "SIDH Scheme ID", "Workflow", "Valid Until", "Status", ""].map((h) => (
            <th
              key={h}
              className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-500 last:text-right"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {isLoading ? (
          <LoadingRow cols={7} />
        ) : schemes.length === 0 ? (
          <EmptyRow
            cols={7}
            icon={<Network className="mx-auto h-8 w-8 text-slate-300" />}
            message="No schemes found"
            hint='Use "Seed Defaults" to create the default Fee Based scheme from the legacy constants'
          />
        ) : (
          schemes.map((s) => {
            const workflow = resolveSidhWorkflowState(s.verifiedForSidh, s.syncEnabled);

            return (
              <tr
                key={s.id}
                className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                onClick={() => onEdit(s.schemeId)}
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
                <td className="px-4 py-4 text-right">
                  <div className="flex justify-end gap-2 opacity-0 transition group-hover:opacity-100">
                    <RowActionButton
                      label={workflow === "draft" ? "Verify" : workflow === "verified" ? "Verified" : "Ready"}
                      onClick={() => onVerify("schemes", s.schemeId, s.name)}
                      icon={<Save className="h-3 w-3" />}
                      tone={workflow === "draft" ? "primary" : "neutral"}
                      disabled={workflow !== "draft"}
                    />
                    <RowActionButton
                      label={s.syncEnabled ? "Ready" : "Mark Ready"}
                      onClick={() => onSync("schemes", s.schemeId, s.name)}
                      icon={<RefreshCw className="h-3 w-3" />}
                      tone={s.syncEnabled ? "neutral" : "primary"}
                      disabled={workflow !== "verified"}
                    />
                    <EditButton onClick={() => onEdit(s.schemeId)} />
                    <RowActionButton
                      label="Delete"
                      onClick={() => onDelete("schemes", s.schemeId, s.name)}
                      icon={<Trash2 className="h-3 w-3" />}
                      tone="danger"
                    />
                  </div>
                </td>
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
              "Job Role",
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
              icon={<BookOpenText className="mx-auto h-8 w-8 text-slate-300" />}
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
                <td className="px-4 py-4 font-mono text-xs text-slate-600">{course.courseCode}</td>
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
                      icon={<Trash2 className="h-3 w-3" />}
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

function ProgramModal({
  form,
  isEdit,
  isSaving,
  onClose,
  onSubmit,
  setForm,
}: {
  form: ProgramForm;
  isEdit: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<ProgramForm>>;
}) {
  return (
    <Modal
      icon={<BriefcaseBusiness className="h-5 w-5" />}
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
          Save the program in the local database first. Use the table action to mark it ready for SIDH after verification.
        </p>
        <ModalFooter isEdit={isEdit} isSaving={isSaving} onClose={onClose} />
      </form>
    </Modal>
  );
}

function SectorModal({
  form,
  isSaving,
  onClose,
  onSubmit,
  setForm,
}: {
  form: SectorForm;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<SectorForm>>;
}) {
  return (
    <Modal
      icon={<Layers3 className="h-5 w-5" />}
      iconBg="bg-sky-100 text-sky-600"
      subtitle="Add a new sector to organise courses and schemes."
      title="Create Sector"
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
        <ModalFooter isEdit={false} isSaving={isSaving} onClose={onClose} />
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
      icon={<Network className="h-5 w-5" />}
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
              onChange={(e) => setForm((f) => ({ ...f, sidhSchemeId: e.target.value }))}
              className={inputCls}
              placeholder="Scheme_2"
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
              placeholder="Self-Paid"
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
  sectors,
  setForm,
}: {
  form: CourseForm;
  isEdit: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  sectors: SectorRecord[];
  setForm: React.Dispatch<React.SetStateAction<CourseForm>>;
}) {
  return (
    <Modal
      icon={<BookOpenText className="h-5 w-5" />}
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
          <FormField label="Course Name">
            <input
              value={form.courseName}
              onChange={(e) => setForm((current) => ({ ...current, courseName: e.target.value }))}
              className={inputCls}
              placeholder="Maize Cultivator"
              required
            />
          </FormField>
          <FormField label="Course ID">
            <input
              value={form.courseCode}
              onChange={(e) => setForm((current) => ({ ...current, courseCode: e.target.value }))}
              className={inputCls}
              placeholder="FeeSchCor_48128"
              required
            />
          </FormField>
          <FormField label="Job Role">
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
          <FormField label="Validity">
            <input
              type="number"
              min="1"
              value={form.validity}
              onChange={(e) => setForm((current) => ({ ...current, validity: e.target.value }))}
              className={inputCls}
              placeholder="365"
              required
            />
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
            <X className="h-4 w-4" />
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
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : isEdit ? (
          <Save className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        {isEdit ? "Save Changes" : "Create"}
      </button>
    </div>
  );
}

function StatCard({
  accent = "text-slate-900",
  active,
  icon,
  iconBg,
  label,
  onClick,
  value,
}: {
  accent?: string;
  active?: boolean;
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  onClick?: () => void;
  value: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-5 text-left shadow-sm transition ${
        active
          ? "border-slate-300 bg-white ring-2 ring-slate-900/10"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className={`rounded-xl p-2 ${iconBg}`}>{icon}</span>
      </div>
      <p className={`mt-3 text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
    </button>
  );
}

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-emerald-500" : "bg-slate-400"}`}
      />
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
  if (course.validityStartDate && course.validityEndDate) {
    return `${new Date(course.validityStartDate).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })} - ${new Date(course.validityEndDate).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })}`;
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

  const label = state === "ready" ? "Ready for SIDH" : state === "verified" ? "Verified" : "Draft";

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
      <Pencil className="h-3 w-3" />
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
        <LoaderCircle className="mx-auto h-6 w-6 animate-spin" />
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
