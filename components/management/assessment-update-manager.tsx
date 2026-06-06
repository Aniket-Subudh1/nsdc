"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import {
  IconAlertTriangle,
  IconClipboardCheck,
  IconLoader2,
  IconRefresh,
  IconSend,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ClientApiError } from "@/lib/client/api";
import { cn } from "@/lib/utils";

type AssessmentUpdateManagerProps = {
  portal: "admin" | "training_partner";
};

type BatchListItem = {
  batchCode: string;
  batchId: string;
  batchName: string | null;
  candidateCount: number;
  courseId: string;
  sidhBatchId: string | null;
  syncState: {
    batchSync: { status: string };
  };
};

type PagedBatches = {
  items: BatchListItem[];
};

type CourseOption = {
  courseId: string;
  courseName: string;
};

type PagedCourses = {
  items: CourseOption[];
};

type AttendanceSummary = {
  assessmentEligibilityThreshold: number;
  batchId: string;
  candidates: Array<{
    attendancePercentage: number;
    candidateId: string;
    candidateName: string | null;
    eligibleForAssessment: boolean;
    enrollmentStatus: string;
    sidhCandidateId: string | null;
    trainingStatus: string | null;
  }>;
  totalSessions: number;
};

type SharedDefaults = {
  assessmentAgency: string;
  assessmentDataUploadedOn: string;
  assessorID: string;
  assessorName: string;
  certifyingAgency: string;
  certificationDate: string;
  certificationName: string;
};

type CandidateAssessmentRow = {
  candidateId: string;
  candidateName: string | null;
  eligibleForAssessment: boolean;
  selected: boolean;
  sidhCandidateId: string | null;
  assessmentDetails: {
    assessmentAgency: string;
    assessmentDataUploadedOn: string;
    assessmentPercentage: number;
    assessmentStatus: string;
    assessorID: string;
    assessorName: string;
    grade: string;
  };
  certificationDetails: {
    certificationDate: string;
    certificationName: string;
    certifyingAgency: string;
    isCertified: boolean;
  };
  trainingDetails: {
    attendance: number;
    trainingStatus: string;
  };
};

const portalContent = {
  admin: {
    description:
      "Submit training, assessment, and certification details to SIDH for enrolled learners in a synced batch.",
    heading: "Assessment Update",
  },
  training_partner: {
    description:
      "Record assessment results and certification details for your batch learners and push them to SIDH.",
    heading: "Assessment Update",
  },
} as const;

const ASSESSMENT_STATUS_OPTIONS = ["Pass", "Fail"] as const;
const TRAINING_STATUS_OPTIONS = ["completed", "ongoing", "dropout"] as const;

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function gradeFromPercentage(percentage: number) {
  if (percentage >= 80) return "A";
  if (percentage >= 60) return "B";
  if (percentage >= 40) return "C";
  return "D";
}

function FieldSelect({
  children,
  id,
  onChange,
  value,
}: {
  children: React.ReactNode;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <select
      id={id}
      className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-sky-300 focus:bg-white focus:ring-2 focus:ring-sky-100"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}

function buildRowFromSummary(
  candidate: AttendanceSummary["candidates"][number],
  defaults: SharedDefaults,
  eligibilityThreshold: number,
): CandidateAssessmentRow {
  const trainingStatus = candidate.trainingStatus ?? "completed";
  const passed =
    trainingStatus !== "dropout" && candidate.attendancePercentage >= eligibilityThreshold;

  return {
    candidateId: candidate.candidateId,
    candidateName: candidate.candidateName,
    eligibleForAssessment: candidate.eligibleForAssessment,
    selected: candidate.eligibleForAssessment && Boolean(candidate.sidhCandidateId),
    sidhCandidateId: candidate.sidhCandidateId,
    trainingDetails: {
      attendance: Math.round(candidate.attendancePercentage),
      trainingStatus,
    },
    assessmentDetails: {
      assessmentAgency: defaults.assessmentAgency,
      assessmentDataUploadedOn: defaults.assessmentDataUploadedOn,
      assessmentPercentage: passed ? 75 : 0,
      assessmentStatus: passed ? "Pass" : "Fail",
      assessorID: defaults.assessorID,
      assessorName: defaults.assessorName,
      grade: gradeFromPercentage(passed ? 75 : 0),
    },
    certificationDetails: {
      certificationDate: defaults.certificationDate,
      certificationName: defaults.certificationName,
      certifyingAgency: defaults.certifyingAgency,
      isCertified: passed,
    },
  };
}

export default function AssessmentUpdateManager({ portal }: AssessmentUpdateManagerProps) {
  const content = portalContent[portal];
  const [batches, setBatches] = useState<BatchListItem[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  const [rows, setRows] = useState<CandidateAssessmentRow[]>([]);
  const [defaults, setDefaults] = useState<SharedDefaults>({
    assessmentAgency: "Self",
    assessmentDataUploadedOn: todayIsoDate(),
    assessorID: "",
    assessorName: "",
    certifyingAgency: "Self",
    certificationDate: todayIsoDate(),
    certificationName: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOnlyEligible, setShowOnlyEligible] = useState(true);

  const selectedBatch = useMemo(
    () => batches.find((batch) => batch.batchId === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  const courseMap = useMemo(() => new Map(courses.map((course) => [course.courseId, course])), [courses]);

  const visibleRows = useMemo(
    () => (showOnlyEligible ? rows.filter((row) => row.eligibleForAssessment) : rows),
    [rows, showOnlyEligible],
  );

  const selectedRows = useMemo(() => rows.filter((row) => row.selected), [rows]);

  async function loadBatches() {
    setIsLoading(true);

    try {
      const [batchPage, coursePage] = await Promise.all([
        apiFetch<PagedBatches>("/api/v1/batches?page=1&pageSize=100"),
        apiFetch<PagedCourses>("/api/v1/masters/courses?page=1&pageSize=100&status=active&approvalStatus=approved"),
      ]);
      setBatches(batchPage.items);
      setCourses(coursePage.items);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load batches");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadBatchSummary(batchId: string) {
    if (!batchId) {
      setSummary(null);
      setRows([]);
      return;
    }

    setIsLoadingSummary(true);

    try {
      const attendanceSummary = await apiFetch<AttendanceSummary>(`/api/v1/batches/${batchId}/attendance-summary`);
      const batch = batches.find((item) => item.batchId === batchId);
      const courseName = batch ? courseMap.get(batch.courseId)?.courseName ?? "" : "";
      const nextDefaults: SharedDefaults = {
        assessmentAgency: "Self",
        assessmentDataUploadedOn: todayIsoDate(),
        assessorID: defaults.assessorID,
        assessorName: defaults.assessorName,
        certifyingAgency: "Self",
        certificationDate: todayIsoDate(),
        certificationName: courseName,
      };

      setDefaults(nextDefaults);
      setSummary(attendanceSummary);
      setRows(
        attendanceSummary.candidates.map((candidate) =>
          buildRowFromSummary(candidate, nextDefaults, attendanceSummary.assessmentEligibilityThreshold),
        ),
      );
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to load batch learners");
      setSummary(null);
      setRows([]);
    } finally {
      setIsLoadingSummary(false);
    }
  }

  useEffect(() => {
    void loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      void loadBatchSummary(selectedBatchId);
    }
  }, [selectedBatchId]);

  function updateRow(candidateId: string, patch: Partial<CandidateAssessmentRow>) {
    setRows((current) =>
      current.map((row) => {
        if (row.candidateId !== candidateId) {
          return row;
        }

        if (patch.assessmentDetails) {
          return {
            ...row,
            ...patch,
            assessmentDetails: {
              ...row.assessmentDetails,
              ...patch.assessmentDetails,
            },
          };
        }

        if (patch.certificationDetails) {
          return {
            ...row,
            ...patch,
            certificationDetails: {
              ...row.certificationDetails,
              ...patch.certificationDetails,
            },
          };
        }

        if (patch.trainingDetails) {
          return {
            ...row,
            ...patch,
            trainingDetails: {
              ...row.trainingDetails,
              ...patch.trainingDetails,
            },
          };
        }

        return { ...row, ...patch };
      }),
    );
  }

  function applyDefaultsToSelected() {
    setRows((current) =>
      current.map((row) =>
        row.selected
          ? {
              ...row,
              assessmentDetails: {
                ...row.assessmentDetails,
                assessmentAgency: defaults.assessmentAgency,
                assessmentDataUploadedOn: defaults.assessmentDataUploadedOn,
                assessorID: defaults.assessorID,
                assessorName: defaults.assessorName,
              },
              certificationDetails: {
                ...row.certificationDetails,
                certificationDate: defaults.certificationDate,
                certificationName: defaults.certificationName,
                certifyingAgency: defaults.certifyingAgency,
              },
            }
          : row,
      ),
    );
    toast.success("Shared values applied to selected learners");
  }

  function toggleAllVisible(checked: boolean) {
    const visibleIds = new Set(visibleRows.map((row) => row.candidateId));
    setRows((current) => current.map((row) => (visibleIds.has(row.candidateId) ? { ...row, selected: checked } : row)));
  }

  async function handleSubmit() {
    if (!selectedBatchId) {
      toast.error("Select a batch before submitting assessment data");
      return;
    }

    if (!selectedBatch?.sidhBatchId) {
      toast.error("This batch is not synced to SIDH yet. Sync the batch before submitting assessments.");
      return;
    }

    const payloadCandidates = selectedRows
      .filter((row) => row.sidhCandidateId)
      .map((row) => ({
        candidateID: row.sidhCandidateId as string,
        trainingDetails: row.trainingDetails,
        assessmentDetails: row.assessmentDetails,
        certificationDetails: row.certificationDetails,
      }));

    if (payloadCandidates.length === 0) {
      toast.error("Select at least one learner with a verified SIDH candidate ID");
      return;
    }

    if (!defaults.assessorID.trim() || !defaults.assessorName.trim()) {
      toast.error("Assessor ID and assessor name are required");
      return;
    }

    const missingAssessor = payloadCandidates.some(
      (candidate) => !candidate.assessmentDetails.assessorID.trim() || !candidate.assessmentDetails.assessorName.trim(),
    );
    if (missingAssessor) {
      toast.error("Every selected learner needs assessor ID and assessor name");
      return;
    }

    setIsSubmitting(true);

    try {
      await apiFetch(`/api/v1/batches/${selectedBatchId}/assessment`, {
        body: JSON.stringify({
          batchId: selectedBatch.sidhBatchId,
          candidates: payloadCandidates,
        }),
        method: "POST",
      });
      toast.success(`Assessment data submitted for ${payloadCandidates.length} learner(s)`);
    } catch (error) {
      toast.error(error instanceof ClientApiError ? error.message : "Unable to submit assessment data to SIDH");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-100 py-24 text-slate-400">
        <IconLoader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 bg-slate-100 px-4 py-4 md:gap-6 md:px-8 md:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Operations</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{content.heading}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{content.description}</p>
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => void loadBatches())}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-sky-300 sm:w-auto sm:shrink-0"
        >
          <IconRefresh className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label htmlFor="batchId">Training batch</Label>
            <FieldSelect
              id="batchId"
              value={selectedBatchId}
              onChange={(value) => {
                setSelectedBatchId(value);
              }}
            >
              <option value="">Select a batch with enrolled learners</option>
              {batches.map((batch) => {
                const course = courseMap.get(batch.courseId);
                return (
                  <option key={batch.batchId} value={batch.batchId}>
                    {batch.batchName ?? batch.batchCode}
                    {course ? ` · ${course.courseName}` : ""} · {batch.candidateCount} learners
                    {batch.sidhBatchId ? ` · SIDH ${batch.sidhBatchId}` : " · not synced"}
                  </option>
                );
              })}
            </FieldSelect>
          </div>

          {selectedBatch ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-medium text-slate-900">{selectedBatch.batchName ?? selectedBatch.batchCode}</p>
              <p className="mt-1 text-xs">
                SIDH batch ID:{" "}
                <span className="font-semibold text-slate-800">{selectedBatch.sidhBatchId ?? "Not synced yet"}</span>
              </p>
              {summary ? (
                <p className="mt-1 text-xs">
                  Attendance threshold: {summary.assessmentEligibilityThreshold}% · {summary.totalSessions} session(s)
                  recorded
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {selectedBatch && !selectedBatch.sidhBatchId ? (
          <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Sync this batch to SIDH before submitting assessment data. Assessment updates require a government batch ID.</p>
          </div>
        ) : null}
      </section>

      {selectedBatchId ? (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
              <h2 className="text-sm font-semibold text-slate-900">Shared assessment settings</h2>
              <p className="text-xs text-slate-500">
                Set common assessor and certification values, then apply them to selected learners.
              </p>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 sm:p-5">
              <div className="space-y-2">
                <Label htmlFor="assessorID">Assessor ID</Label>
                <Input
                  id="assessorID"
                  value={defaults.assessorID}
                  onChange={(event) => setDefaults((current) => ({ ...current, assessorID: event.target.value }))}
                  placeholder="ASSR_001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessorName">Assessor name</Label>
                <Input
                  id="assessorName"
                  value={defaults.assessorName}
                  onChange={(event) => setDefaults((current) => ({ ...current, assessorName: event.target.value }))}
                  placeholder="Assessor One"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessmentAgency">Assessment agency</Label>
                <Input
                  id="assessmentAgency"
                  value={defaults.assessmentAgency}
                  onChange={(event) => setDefaults((current) => ({ ...current, assessmentAgency: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assessmentDataUploadedOn">Assessment uploaded on</Label>
                <Input
                  id="assessmentDataUploadedOn"
                  type="date"
                  value={defaults.assessmentDataUploadedOn}
                  onChange={(event) =>
                    setDefaults((current) => ({ ...current, assessmentDataUploadedOn: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificationName">Certification name</Label>
                <Input
                  id="certificationName"
                  value={defaults.certificationName}
                  onChange={(event) => setDefaults((current) => ({ ...current, certificationName: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certifyingAgency">Certifying agency</Label>
                <Input
                  id="certifyingAgency"
                  value={defaults.certifyingAgency}
                  onChange={(event) => setDefaults((current) => ({ ...current, certifyingAgency: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="certificationDate">Certification date</Label>
                <Input
                  id="certificationDate"
                  type="date"
                  value={defaults.certificationDate}
                  onChange={(event) => setDefaults((current) => ({ ...current, certificationDate: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-4 sm:px-5">
              <button
                type="button"
                onClick={applyDefaultsToSelected}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-sky-300"
              >
                Apply to selected learners
              </button>
            </div>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Learner assessment records</h2>
                <p className="text-xs text-slate-500">
                  Review attendance, enter assessment scores, and submit selected learners to SIDH.
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <label className="inline-flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:w-auto">
                  <input
                    type="checkbox"
                    checked={showOnlyEligible}
                    onChange={(event) => setShowOnlyEligible(event.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Show eligible only
                </label>
                <button
                  type="button"
                  disabled={isSubmitting || selectedRows.length === 0}
                  onClick={() => void handleSubmit()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                >
                  {isSubmitting ? <IconLoader2 className="h-4 w-4 animate-spin" /> : <IconSend className="h-4 w-4" />}
                  Submit {selectedRows.length > 0 ? selectedRows.length : ""} to SIDH
                </button>
              </div>
            </div>

            {isLoadingSummary ? (
              <div className="flex items-center justify-center py-16 text-slate-400">
                <IconLoader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-slate-500 sm:px-5">
                {rows.length === 0
                  ? "No learners enrolled in this batch yet."
                  : "No eligible learners match the current filter."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[1100px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/90 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={visibleRows.length > 0 && visibleRows.every((row) => row.selected)}
                          onChange={(event) => toggleAllVisible(event.target.checked)}
                          aria-label="Select all visible learners"
                        />
                      </th>
                      <th className="px-3 py-3">Learner</th>
                      <th className="px-3 py-3">Training</th>
                      <th className="px-3 py-3">Assessment</th>
                      <th className="px-3 py-3">Certification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleRows.map((row) => (
                      <tr key={row.candidateId} className={cn(!row.eligibleForAssessment && "bg-amber-50/40")}>
                        <td className="px-3 py-3 align-top">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            disabled={!row.sidhCandidateId}
                            onChange={(event) => updateRow(row.candidateId, { selected: event.target.checked })}
                            aria-label={`Select ${row.candidateName ?? row.candidateId}`}
                          />
                        </td>
                        <td className="px-3 py-3 align-top">
                          <p className="font-medium text-slate-900">{row.candidateName ?? "Unnamed learner"}</p>
                          <p className="text-xs text-slate-500">{row.sidhCandidateId ?? "No SIDH ID"}</p>
                          {!row.eligibleForAssessment ? (
                            <p className="mt-1 text-[11px] font-medium text-amber-700">Below attendance threshold</p>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="grid gap-2">
                            <FieldSelect
                              id={`trainingStatus-${row.candidateId}`}
                              value={row.trainingDetails.trainingStatus}
                              onChange={(value) =>
                                updateRow(row.candidateId, {
                                  trainingDetails: { ...row.trainingDetails, trainingStatus: value },
                                })
                              }
                            >
                              {TRAINING_STATUS_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </FieldSelect>
                            <Input
                              min={0}
                              max={100}
                              type="number"
                              value={row.trainingDetails.attendance}
                              onChange={(event) =>
                                updateRow(row.candidateId, {
                                  trainingDetails: {
                                    ...row.trainingDetails,
                                    attendance: Number(event.target.value),
                                  },
                                })
                              }
                              aria-label="Attendance percentage"
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="grid min-w-[220px] gap-2">
                            <FieldSelect
                              id={`assessmentStatus-${row.candidateId}`}
                              value={row.assessmentDetails.assessmentStatus}
                              onChange={(value) =>
                                updateRow(row.candidateId, {
                                  assessmentDetails: { ...row.assessmentDetails, assessmentStatus: value },
                                })
                              }
                            >
                              {ASSESSMENT_STATUS_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </FieldSelect>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                min={0}
                                max={100}
                                type="number"
                                value={row.assessmentDetails.assessmentPercentage}
                                onChange={(event) =>
                                  updateRow(row.candidateId, {
                                    assessmentDetails: {
                                      ...row.assessmentDetails,
                                      assessmentPercentage: Number(event.target.value),
                                    },
                                  })
                                }
                                aria-label="Assessment percentage"
                              />
                              <Input
                                value={row.assessmentDetails.grade}
                                onChange={(event) =>
                                  updateRow(row.candidateId, {
                                    assessmentDetails: { ...row.assessmentDetails, grade: event.target.value },
                                  })
                                }
                                aria-label="Grade"
                                placeholder="Grade"
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="grid min-w-[180px] gap-2">
                            <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={row.certificationDetails.isCertified}
                                onChange={(event) =>
                                  updateRow(row.candidateId, {
                                    certificationDetails: {
                                      ...row.certificationDetails,
                                      isCertified: event.target.checked,
                                    },
                                  })
                                }
                              />
                              Certified
                            </label>
                            <Input
                              value={row.certificationDetails.certificationName}
                              onChange={(event) =>
                                updateRow(row.candidateId, {
                                  certificationDetails: {
                                    ...row.certificationDetails,
                                    certificationName: event.target.value,
                                  },
                                })
                              }
                              aria-label="Certification name"
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
          <span className="mx-auto inline-flex rounded-2xl bg-sky-50 p-3 text-sky-600">
            <IconClipboardCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Choose a batch to begin</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            Select a synced batch with enrolled learners to load attendance data and submit assessment results to SIDH.
          </p>
        </section>
      )}
    </div>
  );
}
