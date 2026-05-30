# NSDC Portal

This repository now includes the Sprint 01 backend foundation on top of the existing Next.js UI shell, using MongoDB for persistence.

## Local Setup

1. Copy `.env.example` to `.env.local` and fill in the secrets.
2. Start MongoDB locally or point `DATABASE_URL` to your MongoDB Atlas cluster.
3. Install dependencies with `npm install`.
4. Seed the initial platform admin with `npm run seed:admin`.
5. Start the app with `npm run dev`.

## Available Scripts

- `npm run dev` starts the Next.js app.
- `npm run lint` runs ESLint.
- `npm run typecheck` runs TypeScript without emitting.
- `npm run test` runs the Vitest suite.
- `npm run seed:admin` creates or updates the initial platform admin in MongoDB.

## Sprint 01 API Surface

- `/api/v1/auth/login`
- `/api/v1/auth/logout`
- `/api/v1/auth/me`
- `/api/v1/admin/users`
- `/api/v1/admin/users/:userId`
- `/api/v1/admin/users/:userId/roles`
- `/api/v1/admin/users/:userId/centers`
- `/api/v1/masters/training-centers`
- `/api/v1/health`
- `/api/v1/health/ready`
- `/api/v1/openapi`

## Notes

- Authentication uses an HttpOnly cookie plus persisted MongoDB sessions.
- Default RBAC roles are seeded automatically when the backend first initializes.
- Audit logs are written for login, logout, user creation, role assignment, center assignment, and training-center creation.
