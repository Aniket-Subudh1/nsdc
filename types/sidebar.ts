import {ReactNode} from "react";

export type SidebarLinkType = {
  label: string;
  href: string;
  icon: ReactNode;
};

export type SidebarProps = {
  links: SidebarLinkType[];
};