"use client";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useState, createContext, useContext, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { IconMenu2, IconLogout, IconX } from "@tabler/icons-react";

interface Links {
  label: string;
  href: string;
  icon: React.JSX.Element | React.ReactNode;
  badgeCount?: number;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(
  undefined
);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);

  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate: animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  return (
    <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
      {children}
    </SidebarProvider>
  );
};

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<"div">)} />
    </>
  );
};

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  useEffect(() => {
    const check = () => {
      const large = window.innerWidth >= 1280;
      setIsLargeScreen(large);
      if (large) {
        setOpen(true);
      }
    };

    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [setOpen]);

  return (
    <motion.div
      className={cn(
        "h-screen sticky top-0 hidden md:flex md:flex-col bg-neutral-100 shrink-0 overflow-hidden py-4",
        open ? "px-3" : "px-1.5",
        className
      )}
      animate={{
        width: animate ? (open ? "280px" : "68px") : "280px",
      }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      onMouseEnter={() => !isLargeScreen && setOpen(true)}
      onMouseLeave={() => !isLargeScreen && setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) => {
  const { open, setOpen } = useSidebar();

  return (
    <>
      <div
        className="flex h-14 w-full flex-row items-center justify-between bg-neutral-100 px-4 md:hidden"
        {...props}
      >
        <IconMenu2
          className="h-5 w-5 cursor-pointer text-neutral-800"
          onClick={() => setOpen(!open)}
        />
      </div>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-99 bg-black/40 md:hidden"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className={cn(
                "fixed inset-y-0 left-0 z-100 flex w-72 flex-col justify-between bg-neutral-100 px-4 py-4 shadow-xl md:hidden",
                className
              )}
            >
              <div
                className="absolute right-3 top-3 z-50 cursor-pointer rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-200/70"
                onClick={() => setOpen(false)}
              >
                <IconX className="h-5 w-5" />
              </div>
              {children}
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </>
  );
};

export const SidebarLink = ({
  link,
  className,
  ...props
}: {
  link: Links;
  className?: string;
}) => {
  const { open, animate, setOpen } = useSidebar();
  const pathname = usePathname();
  const isActive =
    pathname === link.href ||
    (link.href !== "#" && link.href !== "/logout" && pathname.startsWith(`${link.href}/`));

  return (
    <Link
      href={link.href}
      onClick={() => setOpen(false)}
      title={!open ? link.label : undefined}
      className={cn(
        "group/sidebar flex min-w-0 items-center rounded-lg transition-colors",
        open ? "w-full justify-start gap-2 px-2 py-2" : "w-full justify-center py-1",
        open && isActive && "bg-sky-100 font-semibold text-sky-700",
        open && !isActive && "text-neutral-700 hover:bg-neutral-200/70",
        className
      )}
      {...props}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center [&_svg]:h-5 [&_svg]:w-5",
          !open && "h-10 w-10 rounded-lg transition-colors",
          !open && isActive && "bg-sky-100 text-sky-700",
          !open && !isActive && "text-neutral-700 group-hover/sidebar:bg-neutral-200/70"
        )}
      >
        {link.icon}
      </span>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
          width: animate ? (open ? "auto" : 0) : "auto",
        }}
        className="overflow-hidden whitespace-nowrap text-sm transition duration-150"
      >
        {link.label}
      </motion.span>
      {link.badgeCount && link.badgeCount > 0 ? (
        <motion.span
          animate={{
            display: animate ? (open ? "inline-flex" : "none") : "inline-flex",
            opacity: animate ? (open ? 1 : 0) : 1,
          }}
          className="ml-auto h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white"
        >
          {link.badgeCount > 99 ? "99+" : link.badgeCount}
        </motion.span>
      ) : null}
    </Link>
  );
};

export const SidebarLogoutLink = ({
  label = "Logout",
  className,
}: {
  label?: string;
  className?: string;
}) => {
  const { open, animate, setOpen } = useSidebar();

  return (
    <Link
      href="/logout"
      onClick={() => setOpen(false)}
      title={!open ? label : undefined}
      className={cn(
        "group/sidebar flex min-w-0 items-center rounded-lg font-medium text-red-600 transition-colors hover:bg-red-50",
        open ? "w-full justify-start gap-2 px-2 py-2" : "w-full justify-center py-1",
        className
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center text-red-600 [&_svg]:h-5 [&_svg]:w-5",
          !open && "h-10 w-10 rounded-lg transition-colors group-hover/sidebar:bg-red-50"
        )}
      >
        <IconLogout />
      </span>
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
          width: animate ? (open ? "auto" : 0) : "auto",
        }}
        className="overflow-hidden whitespace-nowrap text-sm transition duration-150"
      >
        {label}
      </motion.span>
    </Link>
  );
};
