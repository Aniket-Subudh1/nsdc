"use client";

import { startTransition, useEffect, useState } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  Layers3,
  LoaderCircle,
  Network,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { apiFetch, ClientApiError } from "@/lib/client/api";

type MasterDataManagerProps = {
  portal: "admin" | "training_partner";
};

type PagedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

type ProgramRecord = {
  code: string;
  description: string | null;
  id: string;
  name: string;
  programId: string;
  status: "active" | "inactive";
  syncToSidh: boolean;
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
};

type CourseRecord = {
  approvalDate: string | null;
  approvalStatus: "approved" | "pending" | "rejected" | "expired";
  associatedQpOrJobRole: string;
  courseId: string;
  courseName: string;
  gtUploadedDurationHours: number | null;
  id: string;
  internalCourseCode: string;
  jobRoleMappingType: "QP_NOS" | "JOB_ROLE" | "HYBRID";
  minimumAge: number;
  nsqfLevel: number;
  price: number;
  programIds: string[];
  qpCode: string;
  schemeIds: string[];
  sectorId: string;
  sidhCourseId: string;
  status: "active" | "inactive";
  trainingHours: number;
  validityEndDate: string;
  validityStartDate: string;
  version: number;
};

type CourseVersionRecord = {
  changeSummary: string | null;
  changedByUserId: string | null;
  courseId: string;
  createdAt: string | null;
  snapshot: Record<string, unknown>;
  version: number;
};

type CandidateReferenceData = {
  courses: CourseRecord[];
  enums: Record<string, Array<{ code: string; label: string }>>;
  programs: ProgramRecord[];
  schemes: SchemeRecord[];
  sectors: SectorRecord[];
  trainingCenters: Array<{
    centerCode: string;
    centerId: string;
    centerName: string;
    id: string;
  }>;
};

const portalContent = {
  admin: {
    eyebrow: "Sprint 02",
    heading: "Master Data Control Tower",
    description:
      "Manage programs, sectors, schemes, course mappings, and candidate dropdown sources through the internal NSDC APIs.",
  },
  training_partner: {
    eyebrow: "Sprint 02",
    heading: "Scoped Master Data Workspace",
    description:
      "Review and maintain the operational master data needed before candidate and batch flows are added.",
  },
} as const;

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
  approvalStatus: "pending" as "approved" | "pending" | "rejected" | "expired",
  associatedQpOrJobRole: "",
  courseName: "",
  gtUploadedDurationHours: "",
  internalCourseCode: "",
  jobRoleMappingType: "QP_NOS" as "QP_NOS" | "JOB_ROLE" | "HYBRID",
  minimumAge: "18",
  nsqfLevel: "4",
  price: "0",
  programIds: [] as string[],
  qpCode: "",
  schemeIds: [] as string[],
  sectorId: "",
  sidhCourseId: "",
  status: "active" as "active" | "inactive",
  trainingHours: "320",
  validityEndDate: "",
  validityStartDate: "",
};

export default function MasterDataManager({ portal }: MasterDataManagerProps) {
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [sectors, setSectors] = useState<SectorRecord[]>([]);
  const [schemes, setSchemes] = useState<SchemeRecord[]>([]);
  const [courses, setCourses] = useState<CourseRecord[]>([]);
  const [courseVersions, setCourseVersions] = useState<CourseVersionRecord[]>([]);
  const [referenceData, setReferenceData] = useState<CandidateReferenceData | null>(null);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [programForm, setProgramForm] = useState(emptyProgramForm);
  const [sectorForm, setSectorForm] = useState(emptySectorForm);
  const [schemeForm, setSchemeForm] = useState(emptySchemeForm);
  const [courseForm, setCourseForm] = useState(emptyCourseForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const content = portalContent[portal];
  const selectedProgram = programs.find((program) => program.programId === selectedProgramId) ?? null;
  const selectedScheme = schemes.find((scheme) => scheme.schemeId === selectedSchemeId) ?? null;
  const selectedCourse = courses.find((course) => course.courseId === selectedCourseId) ?? null;

  useEffect(() => {
    if (errorMessage) {
      toast.error(errorMessage);
    }
  }, [errorMessage]);

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage);
    }
  }, [successMessage]);

  function resolveSectorName(sectorId: string) {
    return sectors.find((sector) => sector.sectorId === sectorId)?.name ?? sectorId;
  }

  function applyProgram(program: ProgramRecord | null) {
    if (!program) {
      setSelectedProgramId(null);
      setProgramForm(emptyProgramForm);
      return;
    }

    setSelectedProgramId(program.programId);
    setProgramForm({
      code: program.code,
      description: program.description ?? "",
      name: program.name,
      status: program.status,
      syncToSidh: program.syncToSidh,
    });
  }

  function applyScheme(scheme: SchemeRecord | null) {
    if (!scheme) {
      setSelectedSchemeId(null);
      setSchemeForm(emptySchemeForm);
      return;
    }

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
  }

  async function applyCourse(course: CourseRecord | null) {
    if (!course) {
      setSelectedCourseId(null);
      setCourseForm(emptyCourseForm);
      setCourseVersions([]);
      return;
    }

    setSelectedCourseId(course.courseId);
    setCourseForm({
      approvalDate: course.approvalDate ? course.approvalDate.slice(0, 10) : "",
      approvalStatus: course.approvalStatus,
      associatedQpOrJobRole: course.associatedQpOrJobRole,
      courseName: course.courseName,
      gtUploadedDurationHours: course.gtUploadedDurationHours?.toString() ?? "",
      internalCourseCode: course.internalCourseCode,
      jobRoleMappingType: course.jobRoleMappingType,
      minimumAge: course.minimumAge.toString(),
      nsqfLevel: course.nsqfLevel.toString(),
      price: course.price.toString(),
      programIds: course.programIds,
      qpCode: course.qpCode,
      schemeIds: course.schemeIds,
      sectorId: course.sectorId,
      sidhCourseId: course.sidhCourseId,
      status: course.status,
      trainingHours: course.trainingHours.toString(),
      validityEndDate: course.validityEndDate.slice(0, 10),
      validityStartDate: course.validityStartDate.slice(0, 10),
    });

    try {
      const versions = await apiFetch<CourseVersionRecord[]>(`/api/v1/masters/courses/${course.courseId}/versions`);
      setCourseVersions(versions);
    } catch {
      setCourseVersions([]);
    }
  }

  async function loadData() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [programData, sectorData, schemeData, courseData, candidateData] = await Promise.all([
        apiFetch<PagedResponse<ProgramRecord>>("/api/v1/masters/programs?page=1&pageSize=100"),
        apiFetch<PagedResponse<SectorRecord>>("/api/v1/masters/sectors?page=1&pageSize=100"),
        apiFetch<PagedResponse<SchemeRecord>>("/api/v1/masters/schemes?page=1&pageSize=100"),
        apiFetch<PagedResponse<CourseRecord>>("/api/v1/masters/courses?page=1&pageSize=100"),
        apiFetch<CandidateReferenceData>("/api/v1/reference-data/candidate"),
      ]);

      setPrograms(programData.items);
      setSectors(sectorData.items);
      setSchemes(schemeData.items);
      setCourses(courseData.items);
      setReferenceData(candidateData);

      if (selectedProgramId) {
        applyProgram(programData.items.find((item) => item.programId === selectedProgramId) ?? null);
      }
      if (selectedSchemeId) {
        applyScheme(schemeData.items.find((item) => item.schemeId === selectedSchemeId) ?? null);
      }
      if (selectedCourseId) {
        await applyCourse(courseData.items.find((item) => item.courseId === selectedCourseId) ?? null);
      }
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to load master data");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleProgramSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (selectedProgram) {
        await apiFetch<ProgramRecord>(`/api/v1/masters/programs/${selectedProgram.programId}`, {
          method: "PATCH",
          body: JSON.stringify(programForm),
        });
        setSuccessMessage("Program updated successfully");
      } else {
        await apiFetch<ProgramRecord>("/api/v1/masters/programs", {
          method: "POST",
          body: JSON.stringify(programForm),
        });
        setSuccessMessage("Program created successfully");
      }

      applyProgram(null);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to save program");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSectorSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await apiFetch<SectorRecord>("/api/v1/masters/sectors", {
        method: "POST",
        body: JSON.stringify(sectorForm),
      });
      setSectorForm(emptySectorForm);
      setSuccessMessage("Sector created successfully");
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to create sector");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSchemeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (selectedScheme) {
        await apiFetch<SchemeRecord>(`/api/v1/masters/schemes/${selectedScheme.schemeId}`, {
          method: "PATCH",
          body: JSON.stringify(schemeForm),
        });
        setSuccessMessage("Scheme updated successfully");
      } else {
        await apiFetch<SchemeRecord>("/api/v1/masters/schemes", {
          method: "POST",
          body: JSON.stringify(schemeForm),
        });
        setSuccessMessage("Scheme created successfully");
      }

      applyScheme(null);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to save scheme");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCourseSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const payload = {
      ...courseForm,
      gtUploadedDurationHours: courseForm.gtUploadedDurationHours ? Number(courseForm.gtUploadedDurationHours) : undefined,
      minimumAge: Number(courseForm.minimumAge),
      nsqfLevel: Number(courseForm.nsqfLevel),
      price: Number(courseForm.price),
      trainingHours: Number(courseForm.trainingHours),
      ...(selectedCourse ? { currentVersion: selectedCourse.version } : {}),
    };

    try {
      if (selectedCourse) {
        await apiFetch<CourseRecord>(`/api/v1/masters/courses/${selectedCourse.courseId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setSuccessMessage("Course updated successfully");
      } else {
        await apiFetch<CourseRecord>("/api/v1/masters/courses", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccessMessage("Course created successfully");
      }

      await applyCourse(null);
      await loadData();
    } catch (error) {
      setErrorMessage(error instanceof ClientApiError ? error.message : "Unable to save course");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">{content.eyebrow}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{content.heading}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{content.description}</p>
          </div>
          <button
            type="button"
            onClick={() => startTransition(() => void loadData())}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-700"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard icon={<BriefcaseBusiness className="h-5 w-5" />} label="Programs" value={programs.length} />
          <MetricCard icon={<Layers3 className="h-5 w-5" />} label="Sectors" value={sectors.length} />
          <MetricCard icon={<Network className="h-5 w-5" />} label="Schemes" value={schemes.length} />
          <MetricCard icon={<BookOpen className="h-5 w-5" />} label="Courses" value={courses.length} />
          <MetricCard
            icon={<Sparkles className="h-5 w-5" />}
            label="Enum catalogs"
            value={referenceData ? Object.keys(referenceData.enums).length : 0}
          />
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title={selectedProgram ? "Edit Program" : "Create Program"} description="Backed by GET/POST/PATCH /api/v1/masters/programs" />
          <form className="mt-6 space-y-4" onSubmit={handleProgramSubmit}>
            <Field label="Program Name">
              <input className={inputClassName} value={programForm.name} onChange={(event) => setProgramForm((current) => ({ ...current, name: event.target.value }))} required />
            </Field>
            <Field label="Program Code">
              <input className={inputClassName} value={programForm.code} onChange={(event) => setProgramForm((current) => ({ ...current, code: event.target.value }))} required />
            </Field>
            <Field label="Description">
              <textarea className={`${inputClassName} min-h-24 py-3`} value={programForm.description} onChange={(event) => setProgramForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Status">
                <select className={inputClassName} value={programForm.status} onChange={(event) => setProgramForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                <input type="checkbox" checked={programForm.syncToSidh} onChange={(event) => setProgramForm((current) => ({ ...current, syncToSidh: event.target.checked }))} />
                Sync to SIDH
              </label>
            </div>
            <FormActions clearLabel="Clear program" isSaving={isSaving} onClear={() => applyProgram(null)} submitLabel={selectedProgram ? "Save Program" : "Create Program"} />
          </form>
          <ListBlock
            emptyMessage="No programs found yet."
            isLoading={isLoading}
            items={programs}
            renderItem={(program) => (
              <SelectableCard key={program.programId} badge={program.status} meta={program.syncToSidh ? "SIDH sync enabled" : "Internal only"} selected={program.programId === selectedProgramId} subtitle={program.code} title={program.name} onClick={() => applyProgram(program)} />
            )}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title="Create Sector" description="Backed by GET/POST /api/v1/masters/sectors" />
          <form className="mt-6 space-y-4" onSubmit={handleSectorSubmit}>
            <Field label="Sector Name">
              <input className={inputClassName} value={sectorForm.name} onChange={(event) => setSectorForm((current) => ({ ...current, name: event.target.value }))} required />
            </Field>
            <Field label="Sector Code">
              <input className={inputClassName} value={sectorForm.code} onChange={(event) => setSectorForm((current) => ({ ...current, code: event.target.value }))} required />
            </Field>
            <Field label="Description">
              <textarea className={`${inputClassName} min-h-24 py-3`} value={sectorForm.description} onChange={(event) => setSectorForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <Field label="Status">
              <select className={inputClassName} value={sectorForm.status} onChange={(event) => setSectorForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
            <FormActions clearLabel="Clear sector" isSaving={isSaving} onClear={() => setSectorForm(emptySectorForm)} submitLabel="Create Sector" />
          </form>
          <ListBlock
            emptyMessage="No sectors found yet."
            isLoading={isLoading}
            items={sectors}
            renderItem={(sector) => (
              <SelectableCard key={sector.sectorId} badge={sector.status} meta={sector.description ?? "No description"} selected={false} subtitle={sector.code} title={sector.name} onClick={() => setSectorForm({ code: sector.code, description: sector.description ?? "", name: sector.name, status: sector.status })} />
            )}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title={selectedScheme ? "Edit Scheme" : "Create Scheme"} description="Backed by GET/POST/PATCH /api/v1/masters/schemes" />
          <form className="mt-6 space-y-4" onSubmit={handleSchemeSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Scheme Name">
                <input className={inputClassName} value={schemeForm.name} onChange={(event) => setSchemeForm((current) => ({ ...current, name: event.target.value }))} required />
              </Field>
              <Field label="Scheme Code">
                <input className={inputClassName} value={schemeForm.code} onChange={(event) => setSchemeForm((current) => ({ ...current, code: event.target.value }))} required />
              </Field>
            </div>
            <Field label="Description">
              <textarea className={`${inputClassName} min-h-24 py-3`} value={schemeForm.description} onChange={(event) => setSchemeForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SIDH Scheme ID">
                <input className={inputClassName} value={schemeForm.sidhSchemeId} onChange={(event) => setSchemeForm((current) => ({ ...current, sidhSchemeId: event.target.value }))} />
              </Field>
              <Field label="Status">
                <select className={inputClassName} value={schemeForm.status} onChange={(event) => setSchemeForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Funding Type">
                <input className={inputClassName} value={schemeForm.fundingType} onChange={(event) => setSchemeForm((current) => ({ ...current, fundingType: event.target.value }))} />
              </Field>
              <Field label="Beneficiary Type">
                <input className={inputClassName} value={schemeForm.beneficiaryType} onChange={(event) => setSchemeForm((current) => ({ ...current, beneficiaryType: event.target.value }))} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Valid From">
                <input type="date" className={inputClassName} value={schemeForm.validFrom} onChange={(event) => setSchemeForm((current) => ({ ...current, validFrom: event.target.value }))} />
              </Field>
              <Field label="Valid To">
                <input type="date" className={inputClassName} value={schemeForm.validTo} onChange={(event) => setSchemeForm((current) => ({ ...current, validTo: event.target.value }))} />
              </Field>
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
              <input type="checkbox" checked={schemeForm.syncEnabled} onChange={(event) => setSchemeForm((current) => ({ ...current, syncEnabled: event.target.checked }))} />
              Sync-enabled scheme
            </label>
            <FormActions clearLabel="Clear scheme" isSaving={isSaving} onClear={() => applyScheme(null)} submitLabel={selectedScheme ? "Save Scheme" : "Create Scheme"} />
          </form>
          <ListBlock
            emptyMessage="No schemes found yet."
            isLoading={isLoading}
            items={schemes}
            renderItem={(scheme) => (
              <SelectableCard key={scheme.schemeId} badge={scheme.status} meta={scheme.syncEnabled ? `SIDH ${scheme.sidhSchemeId ?? "metadata pending"}` : "Internal scheme"} selected={scheme.schemeId === selectedSchemeId} subtitle={scheme.code} title={scheme.name} onClick={() => applyScheme(scheme)} />
            )}
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionHeader title={selectedCourse ? "Edit Course Mapping" : "Create Course Mapping"} description="Backed by GET/POST/PATCH /api/v1/masters/courses and GET /api/v1/masters/courses/{courseId}/versions" />
          <form className="mt-6 space-y-4" onSubmit={handleCourseSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Course Name">
                <input className={inputClassName} value={courseForm.courseName} onChange={(event) => setCourseForm((current) => ({ ...current, courseName: event.target.value }))} required />
              </Field>
              <Field label="Internal Course Code">
                <input className={inputClassName} value={courseForm.internalCourseCode} onChange={(event) => setCourseForm((current) => ({ ...current, internalCourseCode: event.target.value }))} required />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SIDH Course ID">
                <input className={inputClassName} value={courseForm.sidhCourseId} onChange={(event) => setCourseForm((current) => ({ ...current, sidhCourseId: event.target.value }))} required />
              </Field>
              <Field label="Sector">
                <select className={inputClassName} value={courseForm.sectorId} onChange={(event) => setCourseForm((current) => ({ ...current, sectorId: event.target.value }))} required>
                  <option value="">Select sector</option>
                  {sectors.map((sector) => (
                    <option key={sector.sectorId} value={sector.sectorId}>{sector.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Program scope">
              <select multiple className={`${inputClassName} h-32 py-3`} value={courseForm.programIds} onChange={(event) => setCourseForm((current) => ({ ...current, programIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>
                {programs.map((program) => (
                  <option key={program.programId} value={program.programId}>{program.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Scheme scope">
              <select multiple className={`${inputClassName} h-32 py-3`} value={courseForm.schemeIds} onChange={(event) => setCourseForm((current) => ({ ...current, schemeIds: Array.from(event.target.selectedOptions, (option) => option.value) }))}>
                {schemes.map((scheme) => (
                  <option key={scheme.schemeId} value={scheme.schemeId}>{scheme.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Associated QP or job role">
              <input className={inputClassName} value={courseForm.associatedQpOrJobRole} onChange={(event) => setCourseForm((current) => ({ ...current, associatedQpOrJobRole: event.target.value }))} required />
            </Field>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="QP Code">
                <input className={inputClassName} value={courseForm.qpCode} onChange={(event) => setCourseForm((current) => ({ ...current, qpCode: event.target.value }))} required />
              </Field>
              <Field label="NSQF Level">
                <input type="number" min={1} max={10} className={inputClassName} value={courseForm.nsqfLevel} onChange={(event) => setCourseForm((current) => ({ ...current, nsqfLevel: event.target.value }))} required />
              </Field>
              <Field label="Minimum Age">
                <input type="number" min={0} className={inputClassName} value={courseForm.minimumAge} onChange={(event) => setCourseForm((current) => ({ ...current, minimumAge: event.target.value }))} required />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Training Hours">
                <input type="number" min={1} className={inputClassName} value={courseForm.trainingHours} onChange={(event) => setCourseForm((current) => ({ ...current, trainingHours: event.target.value }))} required />
              </Field>
              <Field label="GT Uploaded Duration Hours">
                <input type="number" min={1} className={inputClassName} value={courseForm.gtUploadedDurationHours} onChange={(event) => setCourseForm((current) => ({ ...current, gtUploadedDurationHours: event.target.value }))} />
              </Field>
              <Field label="Price">
                <input type="number" min={0} className={inputClassName} value={courseForm.price} onChange={(event) => setCourseForm((current) => ({ ...current, price: event.target.value }))} required />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Approval Status">
                <select className={inputClassName} value={courseForm.approvalStatus} onChange={(event) => setCourseForm((current) => ({ ...current, approvalStatus: event.target.value as "approved" | "pending" | "rejected" | "expired" }))}>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                  <option value="expired">Expired</option>
                </select>
              </Field>
              <Field label="Approval Date">
                <input type="date" className={inputClassName} value={courseForm.approvalDate} onChange={(event) => setCourseForm((current) => ({ ...current, approvalDate: event.target.value }))} />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Validity Start">
                <input type="date" className={inputClassName} value={courseForm.validityStartDate} onChange={(event) => setCourseForm((current) => ({ ...current, validityStartDate: event.target.value }))} required />
              </Field>
              <Field label="Validity End">
                <input type="date" className={inputClassName} value={courseForm.validityEndDate} onChange={(event) => setCourseForm((current) => ({ ...current, validityEndDate: event.target.value }))} required />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Mapping Type">
                <select className={inputClassName} value={courseForm.jobRoleMappingType} onChange={(event) => setCourseForm((current) => ({ ...current, jobRoleMappingType: event.target.value as "QP_NOS" | "JOB_ROLE" | "HYBRID" }))}>
                  <option value="QP_NOS">QP/NOS</option>
                  <option value="JOB_ROLE">Job Role</option>
                  <option value="HYBRID">Hybrid</option>
                </select>
              </Field>
              <Field label="Status">
                <select className={inputClassName} value={courseForm.status} onChange={(event) => setCourseForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>
            <FormActions clearLabel="Clear course" isSaving={isSaving} onClear={() => void applyCourse(null)} submitLabel={selectedCourse ? "Save Course Mapping" : "Create Course Mapping"} />
          </form>
          <ListBlock
            emptyMessage="No courses found yet."
            isLoading={isLoading}
            items={courses}
            renderItem={(course) => (
              <SelectableCard key={course.courseId} badge={course.approvalStatus} meta={`Version ${course.version} • ${course.sidhCourseId}`} selected={course.courseId === selectedCourseId} subtitle={`${course.internalCourseCode} • ${resolveSectorName(course.sectorId)}`} title={course.courseName} onClick={() => void applyCourse(course)} />
            )}
          />
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">Version history</div>
            <div className="mt-3 space-y-3">
              {courseVersions.length === 0 ? (
                <div className="text-sm text-slate-500">Select a course to inspect its stored versions.</div>
              ) : (
                courseVersions.map((version) => (
                  <div key={version.version} className="rounded-2xl border border-white bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-semibold text-slate-900">Version {version.version}</span>
                      <span className="text-slate-500">{version.createdAt ? new Date(version.createdAt).toLocaleString() : "Unknown time"}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">{version.changeSummary ?? "Course mapping updated"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <SectionHeader title="Candidate Reference Snapshot" description="Backed by GET /api/v1/reference-data/candidate" />
        {referenceData ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ReferenceGroup title="Programs" values={referenceData.programs.map((item) => item.name)} />
            <ReferenceGroup title="Training centers" values={referenceData.trainingCenters.map((item) => item.centerName)} />
            <ReferenceGroup title="Approved courses" values={referenceData.courses.map((item) => item.courseName)} />
            <ReferenceGroup title="Enum catalogs" values={Object.entries(referenceData.enums).map(([key, value]) => `${key} (${value.length})`)} />
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
            {isLoading ? "Loading candidate reference data..." : "No reference data available."}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function FormActions({ clearLabel, isSaving, onClear, submitLabel }: { clearLabel: string; isSaving: boolean; onClear: () => void; submitLabel: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button type="submit" disabled={isSaving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
        {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {submitLabel}
      </button>
      <button type="button" onClick={onClear} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600">
        {clearLabel}
      </button>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-center gap-2 text-sky-600">{icon}</div>
      <div className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function ListBlock<T>({ emptyMessage, isLoading, items, renderItem }: { emptyMessage: string; isLoading: boolean; items: T[]; renderItem: (item: T) => React.ReactNode; }) {
  return (
    <div className="mt-6 space-y-3">
      {isLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Loading records...</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">{emptyMessage}</div>
      ) : (
        items.map((item) => renderItem(item))
      )}
    </div>
  );
}

function ReferenceGroup({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {values.length === 0 ? <span className="text-sm text-slate-500">No values</span> : values.slice(0, 10).map((value) => <span key={value} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">{value}</span>)}
      </div>
    </div>
  );
}

function SectionHeader({ description, title }: { description: string; title: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}

function SelectableCard({ badge, meta, onClick, selected, subtitle, title }: { badge: string; meta: string; onClick: () => void; selected: boolean; subtitle: string; title: string; }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${selected ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-600">{subtitle}</div>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-700">{badge}</span>
      </div>
      <div className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">{meta}</div>
    </button>
  );
}

const inputClassName = "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none transition-colors focus:border-sky-300";