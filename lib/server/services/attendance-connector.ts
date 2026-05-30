import { ApiError } from "@/lib/server/http";

export type AttendanceSyncPayload = {
  attendanceDate: string;
  attendanceStatus: "present" | "absent";
  batchId: string;
  candidateId: string;
  sourceUploadId: string;
  trainingStatus?: "ongoing" | "completed" | "dropout" | null;
};

export type AttendanceSyncConnector = {
  syncAttendanceRecords: (input: {
    batchId: string;
    records: AttendanceSyncPayload[];
  }) => Promise<{
    acceptedCount: number;
    message: string;
  }>;
};

export function createAttendanceConnector(): AttendanceSyncConnector {
  return {
    async syncAttendanceRecords(input) {
      if (input.records.length === 0) {
        return {
          acceptedCount: 0,
          message: "No attendance records were supplied for sync",
        };
      }

      throw new ApiError(
        501,
        "ATTENDANCE_SYNC_NOT_IMPLEMENTED",
        "Attendance sync is intentionally routed through the internal connector interface until the final SIDH endpoint contract is confirmed",
      );
    },
  };
}