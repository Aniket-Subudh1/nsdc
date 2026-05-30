import {
  IconArrowLeft,
  IconBrandTabler,
  IconBuildingCommunity,
  IconCode,
  IconStack2,
  IconUsers,
} from "@tabler/icons-react";

export const ADMIN_SIDEBAR_LINKS = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: (
            <IconBrandTabler className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
  },
  {
      label: "Users",
      href: "/admin/users",
    icon: (
        <IconUsers className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
  },
  {
      label: "Training Centers",
      href: "/admin/training-centers",
    icon: (
        <IconBuildingCommunity className="h-5 w-5 shrink-0 text-neutral-700" />
      ),
    },
    {
      label: "Master Data",
      href: "/admin/master-data",
      icon: (
        <IconStack2 className="h-5 w-5 shrink-0 text-neutral-700" />
      ),
    },
    {
      label: "API Docs",
      href: "/api-docs",
      icon: (
        <IconCode className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
  },
  {
    label: "Logout",
    href: "/logout",
    icon: (
            <IconArrowLeft className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
  },
];

export const TRAINING_PARTNER_SIDEBAR_LINKS = [
    {
        label: "Dashboard",
        href: "/training-partner/dashboard",
        icon: (
            <IconBrandTabler className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
      },
      {
        label: "Users",
        href: "/training-partner/users",
        icon: (
            <IconUsers className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
      },
      {
        label: "Training Centers",
        href: "/training-partner/training-centers",
        icon: (
            <IconBuildingCommunity className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
      },
      {
        label: "Master Data",
        href: "/training-partner/master-data",
        icon: (
            <IconStack2 className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
      },
      {
        label: "API Docs",
        href: "/api-docs",
        icon: (
            <IconCode className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
      },
      {
        label: "Logout",
        href: "/logout",
        icon: (
            <IconArrowLeft className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
    }
]