"use client";

import React, { useState } from "react";
import Image from "next/image";
import { motion } from "motion/react";

import { Sidebar, SidebarBody, SidebarLink, SidebarLogoutLink, useSidebar } from "../ui/sidebar";
import { cn } from "@/lib/utils";
import { SidebarProps } from "@/types/sidebar";

function SidebarContent({
  links,
  userName,
}: {
  links: SidebarProps["links"];
  userName?: string;
}) {
  const { open } = useSidebar();
  const avatarInitial = (userName ?? "Signed in user").trim().charAt(0).toUpperCase() || "U";

  return (
    <>
      <div
        className={cn(
          "flex flex-1 flex-col overflow-x-hidden overflow-y-auto",
          !open && "items-center"
        )}
      >
        <div className={cn("w-full", !open && "flex justify-center")}>
          {open ? <Logo /> : <LogoIcon />}
        </div>
        <div className={cn("mt-8 flex w-full flex-col gap-1", !open && "items-center")}>
          {links.map((link, idx) => (
            <SidebarLink key={idx} link={link} />
          ))}
        </div>
      </div>

      <div className={cn("shrink-0 space-y-2 border-t border-slate-200 pt-4", !open && "flex flex-col items-center")}>
        <SidebarLink
          link={{
            label: userName ?? "Signed in user",
            href: "#",
            icon: (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                {avatarInitial}
              </span>
            ),
          }}
        />
        <SidebarLogoutLink />
      </div>
    </>
  );
}

export function SidebarDemo({
  links,
  userName,
  children,
}: SidebarProps & { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("flex h-screen w-full flex-col overflow-hidden bg-slate-50 md:flex-row")}>
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-6">
          <SidebarContent links={links} userName={userName} />
        </SidebarBody>
      </Sidebar>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}

export const Logo = () => {
  return (
    <div className="relative z-20 flex items-center gap-2 py-1">
      <Image src="/logo.png" className="h-10 w-10 shrink-0" width={50} height={50} alt="Logo" />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="whitespace-pre font-semibold text-black text-sm"
      >
        Gram Tarang Training Center
      </motion.span>
    </div>
  );
};

export const LogoIcon = () => {
  return (
    <div className="relative z-20 flex items-center justify-center py-1">
      <Image src="/logo.png" className="h-8 w-8 shrink-0" width={50} height={50} alt="Logo" />
    </div>
  );
};
