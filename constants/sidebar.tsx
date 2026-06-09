import {
  IconBrandTabler,
  IconBuildingCommunity,
  IconCertificate,
  IconClipboardCheck,
  IconStack2,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";

export const ADMIN_SIDEBAR_LINKS = [
  {
    label: "Dashboard",
    href: "/admin/dashboard",
    icon: <IconBrandTabler className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Users",
    href: "/admin/users",
    icon: <IconUsers className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Training Centers",
    href: "/admin/training-centers",
    icon: <IconBuildingCommunity className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Master Data",
    href: "/admin/master-data",
    icon: <IconStack2 className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Candidates",
    href: "/admin/candidates",
    icon: <IconUserPlus className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Batches",
    href: "/admin/batches",
    icon: <IconStack2 className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Assessment Update",
    href: "/admin/assessment-update",
    icon: <IconClipboardCheck className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Certificates",
    href: "/admin/certificates",
    icon: <IconCertificate className="h-5 w-5 shrink-0" />,
  },
];

export const TRAINING_PARTNER_SIDEBAR_LINKS = [
  {
    label: "Dashboard",
    href: "/training-partner/dashboard",
    icon: <IconBrandTabler className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Training Centers",
    href: "/training-partner/training-centers",
    icon: <IconBuildingCommunity className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Master Data",
    href: "/training-partner/master-data",
    icon: <IconStack2 className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Candidates",
    href: "/training-partner/candidates",
    icon: <IconUserPlus className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Batches",
    href: "/training-partner/batches",
    icon: <IconStack2 className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Assessment Update",
    href: "/training-partner/assessment-update",
    icon: <IconClipboardCheck className="h-5 w-5 shrink-0" />,
  },
  {
    label: "Certificates",
    href: "/training-partner/certificates",
    icon: <IconCertificate className="h-5 w-5 shrink-0" />,
  },
];
