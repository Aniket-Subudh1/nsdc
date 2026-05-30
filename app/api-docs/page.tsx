import type { Metadata } from "next";

import SwaggerUi from "@/components/docs/swagger-ui";

export const metadata: Metadata = {
  title: "NSDC API Docs",
  description: "Interactive Swagger UI for the NSDC portal APIs",
};

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">API Documentation</h1>
          <p className="mt-2 text-sm text-slate-600">
            Interactive Swagger UI backed by the live OpenAPI document at <code>/api/v1/openapi</code>.
          </p>
        </div>
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <SwaggerUi />
        </div>
      </div>
    </main>
  );
}