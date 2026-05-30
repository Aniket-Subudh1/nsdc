"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function performLogout() {
      try {
        await fetch("/api/v1/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } finally {
        if (isMounted) {
          router.replace("/admin/login");
          router.refresh();
        }
      }
    }

    void performLogout();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f8fbff] px-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">
        Signing you out...
      </div>
    </main>
  );
}