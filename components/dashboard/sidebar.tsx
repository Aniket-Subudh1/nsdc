"use client";
import React, { useState } from "react";
import { Sidebar, SidebarBody, SidebarLink } from "../ui/sidebar";
import Image from "next/image";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import {SidebarProps} from "@/types/sidebar";

export function SidebarDemo({
 links,
 userName,
 children,
}: SidebarProps & { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const avatarInitial = (userName ?? "Signed in user").trim().charAt(0).toUpperCase() || "U";

  return (
    <div
      className={cn(
        "flex w-full flex-1 overflow-hidden bg-gray-100 md:flex-row",
        "h-screen",
      )}
    >
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-10">
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            {open ? <Logo /> : <LogoIcon />}
            <div className="mt-8 flex flex-col gap-2">
              {links.map((link, idx) => (
                <SidebarLink key={idx} link={link} />
              ))}
            </div>
          </div>
          <div>
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
          </div>
        </SidebarBody>
      </Sidebar>
      <main className="flex flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
export const Logo = () => {
  return (
    <a
      href="#"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <Image src="/logo.png" className="h-10 w-10 shrink-0" width={50} height={50} alt="Logo" />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="font-medium whitespace-pre text-black"
      >
        GT Training Center
      </motion.span>
    </a>
  );
};
export const LogoIcon = () => {
  return (
    <a
      href="#"
      className="relative z-20 flex items-center space-x-2 py-1 text-sm font-normal text-black"
    >
      <Image src="/logo.png" className="h-5 w-5 shrink-0" width={50} height={50} alt="Logo" />
    </a>
  );
};


