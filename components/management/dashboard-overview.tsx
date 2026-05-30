"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, ShieldCheck, Users, Workflow } from "lucide-react";

import { apiFetch, ClientApiError } from "@/lib/client/api";

type DashboardOverviewProps = {
  portal: "admin" | "training_partner";
};

type AuthMeResponse = {
  permissions: string[];
  user: {
    centerIds: string[];
    email: string;
    name: string;
    roles: string[];
  };
};

type PagedUsers = {
  items: Array<{ id: string }>;
  page: number;
  pageSize: number;
  total: number;
};

type PagedCenters = {
  items: Array<{ id: string }>;
  page: number;
  pageSize: number;
  total: number;
};

const portalContent = {
  admin: {
    heading: "Admin Command Center",
    description: "Manage internal users, role assignments, and training centers from the platform side.",
    links: [
      { href: "/admin/users", label: "Manage Users" },
      { href: "/admin/training-centers", label: "Manage Training Centers" },
      { href: "/api-docs", label: "Open API Docs" },
    ],
  },
  training_partner: {
    heading: "Training Partner Operations",
    description: "Work within your assigned scope to manage operational users and training centers.",
    links: [
      { href: "/training-partner/users", label: "Scoped Users" },
      { href: "/training-partner/training-centers", label: "Scoped Training Centers" },
      { href: "/api-docs", label: "Open API Docs" },
    ],
  },
} as const;

export default function DashboardOverview({ portal }: DashboardOverviewProps) {
  const [state, setState] = useState<{
    centerCount: number;
    error: string | null;
    permissionsCount: number;
    roleCount: number;
    userCount: number;
    userName: string;
  }>({
    centerCount: 0,
    error: null,
    permissionsCount: 0,
    roleCount: 0,
    userCount: 0,
    userName: "",
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setIsLoading(true);

      try {
        const [auth, users, centers] = await Promise.all([
          apiFetch<AuthMeResponse>("/api/v1/auth/me"),
          apiFetch<PagedUsers>("/api/v1/admin/users?page=1&pageSize=1"),
          apiFetch<PagedCenters>("/api/v1/masters/training-centers?page=1&pageSize=1"),
        ]);

        if (!isMounted) {
          return;
        }

        setState({
          centerCount: centers.total,
          error: null,
          permissionsCount: auth.permissions.length,
          roleCount: auth.user.roles.length,
          userCount: users.total,
          userName: auth.user.name,
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setState((current) => ({
          ...current,
          error: error instanceof ClientApiError ? error.message : "Unable to load dashboard data",
        }));
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const content = portalContent[portal];

  return (
    <div className="flex flex-1 flex-col gap-6 bg-slate-100 px-4 py-4 md:px-8 md:py-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">Sprint 01</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{content.heading}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{content.description}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Signed in as <span className="font-semibold text-slate-900">{state.userName || "Loading user"}</span>
          </div>
        </div>
      </section>

      {state.error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {state.error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Visible Users"
          value={isLoading ? "..." : String(state.userCount)}
          description="Users you can manage through the current scope"
          icon={<Users className="h-5 w-5 text-sky-600" />}
        />
        <MetricCard
          label="Visible Centers"
          value={isLoading ? "..." : String(state.centerCount)}
          description="Training centers returned by the scoped master API"
          icon={<Building2 className="h-5 w-5 text-emerald-600" />}
        />
        <MetricCard
          label="Assigned Roles"
          value={isLoading ? "..." : String(state.roleCount)}
          description="Number of roles on the active user session"
          icon={<ShieldCheck className="h-5 w-5 text-violet-600" />}
        />
        <MetricCard
          label="Permissions"
          value={isLoading ? "..." : String(state.permissionsCount)}
          description="Permissions returned by the auth/me API"
          icon={<Workflow className="h-5 w-5 text-amber-600" />}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">What is available now</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {content.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm font-medium text-slate-700 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Current Sprint UI Scope</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li>Authentication and forgot-password are live.</li>
            <li>User management UI is backed by create, list, patch, role, and center assignment APIs.</li>
            <li>Training center UI is backed by create and list APIs.</li>
            <li>Health and OpenAPI remain docs/operator surfaces rather than dashboard widgets.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  description,
  icon,
  label,
  value,
}: {
  description: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-600">{label}</span>
        <span className="rounded-xl bg-slate-100 p-2">{icon}</span>
      </div>
      <div className="mt-5 text-3xl font-semibold tracking-tight text-slate-900">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}