# Gram Tarang- NSDC Skill Training Platform

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
- SMTP for forgot-password and admin login OTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `FROM_EMAIL` (aliases: `SMTP_FROM`, `EMAIL_USER`, `EMAIL_APP_PASSWORD`, `OWNER_EMAIL`)
- Seed admin: `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
- SIDH connector selection: `SIDH_ENV`
- SIDH UAT credentials: `SIDH_UAT_BASE_URL`, `SIDH_UAT_USERNAME`, `SIDH_UAT_PASSWORD`, `SIDH_UAT_TP_ID`
- SIDH production credentials: `SIDH_PROD_BASE_URL`, `SIDH_PROD_USERNAME`, `SIDH_PROD_PASSWORD`, `SIDH_PROD_TP_ID`

If SIDH credentials are blank, the queue and UI still work internally, but the worker will not be able to complete live SIDH registration successfully.

Use `SIDH_ENV="uat"` for `https://backend.itrackglobal.com` and `SIDH_ENV="production"` for `https://adminservices.skillindiadigital.gov.in`. The connector bootstraps SIDH auth through `HEAD /api/user/v1`, `GET /api/user/v1/getkey`, and `POST /api/user/v1/login`; login password encryption follows the NSDC guide: RSA-OAEP SHA-256 over the raw password, then append the returned secret key.

To check whether the current SIDH credentials are accepted without printing secrets, run:

```bash
npx tsx scripts/check-sidh-auth.ts
```

The script reports only environment, endpoint status, presence of CSRF/key values, and sanitized SIDH error text.

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

Start the pull-based worker in polling mode:

```bash
npm run sync:process
```

Start the same worker with an explicit limit:

```bash
npm run sync:process -- 10
```

Run the worker once instead of polling continuously:

```bash
npm run sync:process -- --once
```

Worker behavior:

- claims queued sync jobs with `nextRunAt <= now`
- runs as a pull-based polling worker by default
- processes up to 25 jobs per polling iteration
- uses the seeded admin or another active platform admin as the worker actor
- calls the SIDH connector server-side only, never from the browser
- sends the documented candidate registration payload only: `PersonalDetails` and `ContactDetails`
- writes attempt history and SIDH transaction logs to the sync job detail view
- marks non-retryable SIDH login rejection as `manual_review`; requeue the job after credential/account fixes to process it again

You can also trigger the same processing path from the UI in the Sprint 03 `Sync Queue` section through the `Process queued jobs` action.

### Worker Processing For Queued Batch And Enrollment Sync Jobs

Sprint 04 adds a dedicated worker loop for queued SIDH batch creation and candidate enrollment jobs.

Start the pull-based worker in polling mode:

```bash
npm run sync:batches:process
```

Start the same worker with an explicit limit:

```bash
npm run sync:batches:process -- --limit=10
```

Run the worker once instead of polling continuously:

```bash
npm run sync:batches:process -- --once
```

Worker behavior:

- polls the batch sync queue and enrollment sync queue in the same process
- runs as a pull-based polling worker by default, like the candidate sync worker
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
- `npm run sync:process -- [--once] [--limit=5]` starts the pull-based Sprint 03 candidate sync worker
- `npm run sync:batches:process -- [--once] [--limit=5]` processes queued Sprint 04 batch and enrollment sync jobs

## Current API Highlights

### Auth And Admin

- `/api/v1/auth/login`
- `/api/v1/auth/login/verify-otp`
- `/api/v1/auth/login/resend-otp`
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

Candidate registration is payload-first and no longer depends on active master program/training-center records. The create form and upload workbook collect the NSDC candidate registration fields plus local location fields.

Single-candidate create uses:

```json
{
	"personalDetails": {
		"namePrefix": "Mr",
		"firstName": "Rohit Kumar",
		"gender": "Male",
		"dob": "2005-06-10",
		"fatherName": "Suresh Kumar",
		"guardianName": ""
	},
	"contactDetails": {
		"email": "rohit@example.com",
		"phone": "9876543210",
		"countryCode": "91"
	},
	"locationDetails": {
		"state": "Odisha",
		"city": "Bhubaneswar",
		"centerName": "Center One"
	}
}
```

Bulk upload uses `public/candidate_details.xlsx` as the sample workbook. Accepted headers are `Name Prefix`, `Full Name`, `Gender`, `DOB`, `Father's Name`, `Guardian's Name`, `Email`, `Phone`, `Country Code`, `State`, `City`, and `Center Name`. `Full Name` is stored as `personalDetails.firstName` (legacy `First Name` headers are still accepted). `Name Prefix` must be one of `Mr`, `Mrs`, `Ms`, `Mx`. `Gender` must be one of `Male`, `Female`, `Transgender`. The template includes Excel dropdowns for both fields. Upload can be file-only; optional `programId`, `centerId`, and `registrationMode` form fields default internally when omitted.

Import commit saves valid candidate rows locally only. Operators then select candidates and queue them through `/api/v1/candidates/:candidateId/sync` or `/api/v1/candidates/sync/bulk`.

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
- Forgot-password and admin login use 6 digit OTPs delivered through SMTP via Nodemailer. Admin sign-in requires email/password first, then OTP verification before a session is issued.
- Default RBAC roles are seeded automatically when the backend first initializes.
- Audit logs are written for authentication, user management, master-data changes, and Sprint 03 sync processing.
- Candidate create, update, import staging, commit, queue sync, and retry are still internal-first actions; live SIDH calls only happen when the queue processor runs. Candidate import commit does not auto-queue candidates.
- Sprint 04 batch sync and enrollment sync follow the same internal-first pattern: operators queue work through the UI or API, and the dedicated worker performs the live SIDH calls.
- Attendance uploads are staged and validated before commit, and any future outbound attendance push is intentionally isolated behind `lib/server/services/attendance-connector.ts` until the final SIDH endpoint contract is confirmed.
