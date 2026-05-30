# NSDC Portal

This repository contains the NSDC training management portal built on Next.js, MongoDB, and internal `/api/v1` APIs. The current workspace includes Sprint 01 authentication and user management, Sprint 02 master data, Sprint 03 candidate intake and sync queueing, and Sprint 04 batch creation, enrollment sync, and attendance staging.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local`.
3. Fill in the required values in `.env.local`.
4. Start MongoDB locally or point `DATABASE_URL` to a reachable MongoDB or MongoDB Atlas cluster.
5. Seed the initial platform admin:

```bash
npm run seed:admin
```

6. Start the app:

```bash
npm run dev
```

7. Open `http://localhost:3000`.

## Required Environment Areas

The app expects these groups of environment values in `.env.local`:

- Core app: `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`
- SMTP for forgot-password: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- Seed admin: `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
- SIDH connector selection: `SIDH_ENV`
- SIDH UAT credentials: `SIDH_UAT_BASE_URL`, `SIDH_UAT_USERNAME`, `SIDH_UAT_PASSWORD`, `SIDH_UAT_TP_ID`
- SIDH production credentials: `SIDH_PROD_BASE_URL`, `SIDH_PROD_USERNAME`, `SIDH_PROD_PASSWORD`, `SIDH_PROD_TP_ID`

If SIDH credentials are blank, the queue and UI still work internally, but the worker will not be able to complete live SIDH registration successfully.

## Running The Backend And Worker

### App Server

Run the Next.js app server:

```bash
npm run dev
```

Main local URLs:

- App: `http://localhost:3000`
- Admin portal: `http://localhost:3000/admin/login`
- Training-partner portal: `http://localhost:3000/training-partner/login`
- Swagger UI: `http://localhost:3000/api-docs`
- OpenAPI JSON: `http://localhost:3000/api/v1/openapi`

### Seed Admin

If you need the initial admin again:

```bash
npm run seed:admin
```

This uses `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` from `.env.local`.

### Worker Processing For Queued Candidate Sync Jobs

Sprint 03 adds a server-side worker for queued SIDH registration jobs.

Run the worker once with the default batch size:

```bash
npm run sync:process
```

Run the worker once with an explicit limit:

```bash
npm run sync:process -- 10
```

Worker behavior:

- claims queued sync jobs with `nextRunAt <= now`
- processes up to 25 jobs per run
- uses the seeded admin or another active platform admin as the worker actor
- calls the SIDH connector server-side only, never from the browser
- writes attempt history and SIDH transaction logs to the sync job detail view

You can also trigger the same processing path from the UI in the Sprint 03 `Sync Queue` section through the `Process queued jobs` action.

### Worker Processing For Queued Batch And Enrollment Sync Jobs

Sprint 04 adds a dedicated worker loop for queued SIDH batch creation and candidate enrollment jobs.

Run the worker once with the default limit:

```bash
npm run sync:batches:process -- --once
```

Run the worker continuously with an explicit limit:

```bash
npm run sync:batches:process -- --limit=10
```

Worker behavior:

- polls the batch sync queue and enrollment sync queue in the same process
- uses the same active platform-admin worker actor pattern as the candidate sync worker
- processes up to 25 queued batch jobs and 25 queued enrollment jobs per iteration
- writes SIDH transaction logs through the shared connector layer
- marks remote cancelled-batch enrollment failures as terminal cancelled states instead of retrying blindly

## Validation Commands

- `npm run dev` starts the Next.js app
- `npm run build` creates a production build
- `npm run lint` runs ESLint across the repo
- `npm run typecheck` runs TypeScript without emitting
- `npm run test` runs the Vitest suite
- `npm run seed:admin` creates or updates the initial platform admin in MongoDB
- `npm run sync:process -- [limit]` processes queued Sprint 03 sync jobs
- `npm run sync:batches:process -- [--once] [--limit=5]` processes queued Sprint 04 batch and enrollment sync jobs

## Current API Highlights

### Auth And Admin

- `/api/v1/auth/login`
- `/api/v1/auth/forgot-password/request`
- `/api/v1/auth/forgot-password/reset`
- `/api/v1/auth/logout`
- `/api/v1/auth/me`
- `/api/v1/admin/users`
- `/api/v1/admin/users/:userId`
- `/api/v1/admin/users/:userId/roles`
- `/api/v1/admin/users/:userId/centers`

### Master Data

- `/api/v1/masters/programs`
- `/api/v1/masters/sectors`
- `/api/v1/masters/schemes`
- `/api/v1/masters/courses`
- `/api/v1/masters/training-centers`

### Sprint 03 Candidate And Sync APIs

- `/api/v1/candidates`
- `/api/v1/candidates/:candidateId`
- `/api/v1/candidates/:candidateId/sync`
- `/api/v1/candidates/link-existing-sidh`
- `/api/v1/candidates/imports`
- `/api/v1/candidates/imports/:jobId`
- `/api/v1/candidates/imports/:jobId/rows`
- `/api/v1/candidates/imports/:jobId/commit`
- `/api/v1/sync/jobs`
- `/api/v1/sync/jobs/:jobId`
- `/api/v1/sync/jobs/:jobId/retry`
- `/api/v1/sync/jobs/process`

### Sprint 04 Batch, Enrollment, And Attendance APIs

- `/api/v1/batches`
- `/api/v1/batches/:batchId`
- `/api/v1/batches/:batchId/candidates`
- `/api/v1/batches/:batchId/candidates/:candidateId`
- `/api/v1/batches/:batchId/sync`
- `/api/v1/batches/:batchId/enrollment-sync`
- `/api/v1/batches/:batchId/status`
- `/api/v1/batches/:batchId/attendance-summary`
- `/api/v1/attendance/imports`
- `/api/v1/attendance/imports/:jobId`
- `/api/v1/attendance/imports/:jobId/commit`

### Health And Docs

- `/api/v1/health`
- `/api/v1/health/ready`
- `/api/v1/openapi`
- `/api-docs`

## OpenAPI And Swagger

The OpenAPI document is generated by the backend and now includes the Sprint 04 batch and attendance routes in addition to the Sprint 03 sync processing route.

- Machine-readable OpenAPI JSON: `/api/v1/openapi`
- Interactive Swagger UI: `/api-docs`
- Confirmed Sprint 03 processing route in OpenAPI: `/api/v1/sync/jobs/process`
- Sprint 04 batch routes are also documented under `/api/v1/batches*` and `/api/v1/attendance/imports*`

## Current UI Surface

### Admin

- `/admin/dashboard`
- `/admin/users`
- `/admin/training-centers`
- `/admin/master-data`
- `/admin/candidates`
- `/admin/batches`

### Training Partner

- `/training-partner/dashboard`
- `/training-partner/users`
- `/training-partner/training-centers`
- `/training-partner/master-data`
- `/training-partner/candidates`
- `/training-partner/batches`

## Notes

- Authentication uses an HttpOnly cookie plus persisted MongoDB sessions.
- Forgot-password uses 6 digit OTPs delivered through SMTP via Nodemailer.
- Default RBAC roles are seeded automatically when the backend first initializes.
- Audit logs are written for authentication, user management, master-data changes, and Sprint 03 sync processing.
- Candidate create, update, import staging, commit, queue sync, and retry are still internal-first actions; live SIDH calls only happen when the queue processor runs.
- Sprint 04 batch sync and enrollment sync follow the same internal-first pattern: operators queue work through the UI or API, and the dedicated worker performs the live SIDH calls.
- Attendance uploads are staged and validated before commit, and any future outbound attendance push is intentionally isolated behind `lib/server/services/attendance-connector.ts` until the final SIDH endpoint contract is confirmed.
