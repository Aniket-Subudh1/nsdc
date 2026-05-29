import {
  IconArrowLeft,
  IconBrandTabler,
  IconSettings,
  IconUserBolt,
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
    label: "Profile",
    href: "/admin/profile",
    icon: (
            <IconUserBolt className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
  },
  {
    label: "Settings",
    href: "/admin/settings",
    icon: (
            <IconSettings className="h-5 w-5 shrink-0 text-neutral-700" />
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
        label: "Profile",
        href: "/training-partner/profile",
        icon: (
            <IconUserBolt className="h-5 w-5 shrink-0 text-neutral-700" />
          ),
      },
      {
        label: "Settings",
        href: "/training-partner/settings",
        icon: (
            <IconSettings className="h-5 w-5 shrink-0 text-neutral-700" />
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