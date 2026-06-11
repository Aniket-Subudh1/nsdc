import type { Icon } from "@tabler/icons-react";
import {
  IconAntenna,
  IconArmchair,
  IconBolt,
  IconBriefcase,
  IconBuilding,
  IconBuildingBank,
  IconBuildingFactory2,
  IconCar,
  IconChefHat,
  IconCode,
  IconCpu,
  IconHanger,
  IconLeaf,
  IconPalette,
  IconPlaneTilt,
  IconPlant2,
  IconRun,
  IconSettings2,
  IconShirt,
  IconShoppingCart,
  IconSparkles,
  IconStethoscope,
  IconTruck,
} from "@tabler/icons-react";

export type LandingSector = {
  number: string;
  name: string;
  icon: Icon;
  color: string;
  bg: string;
};

export const LANDING_SECTORS: LandingSector[] = [
  { number: "01", name: "Agriculture",            icon: IconPlant2,          color: "#16a34a", bg: "#dcfce7" },
  { number: "02", name: "Healthcare",             icon: IconStethoscope,     color: "#dc2626", bg: "#fee2e2" },
  { number: "03", name: "BFSI",                   icon: IconBuildingBank,    color: "#2563eb", bg: "#dbeafe" },
  { number: "04", name: "Apparel",                icon: IconHanger,          color: "#9333ea", bg: "#f3e8ff" },
  { number: "05", name: "Strategic Manufacturing",icon: IconBuildingFactory2,color: "#0891b2", bg: "#cffafe" },
  { number: "06", name: "Capital Goods",          icon: IconSettings2,       color: "#ca8a04", bg: "#fef9c3" },
  { number: "07", name: "Management",             icon: IconBriefcase,       color: "#4f46e5", bg: "#e0e7ff" },
  { number: "08", name: "Telecom",                icon: IconAntenna,         color: "#0d9488", bg: "#ccfbf1" },
  { number: "09", name: "Power",                  icon: IconBolt,            color: "#ea580c", bg: "#ffedd5" },
  { number: "10", name: "Handicrafts and Carpet", icon: IconPalette,         color: "#b45309", bg: "#fef3c7" },
  { number: "11", name: "Construction",           icon: IconBuilding,        color: "#64748b", bg: "#f1f5f9" },
  { number: "12", name: "Furniture & Fittings",   icon: IconArmchair,        color: "#78716c", bg: "#f5f5f4" },
  { number: "13", name: "Retail",                 icon: IconShoppingCart,    color: "#db2777", bg: "#fce7f3" },
  { number: "14", name: "Beauty & Wellness",      icon: IconSparkles,        color: "#e11d48", bg: "#ffe4e6" },
  { number: "15", name: "Electronics",            icon: IconCpu,             color: "#0284c7", bg: "#e0f2fe" },
  { number: "16", name: "Textile",                icon: IconShirt,           color: "#7c3aed", bg: "#ede9fe" },
  { number: "17", name: "IT-ITeS",               icon: IconCode,            color: "#1d4ed8", bg: "#dbeafe" },
  { number: "18", name: "Sports",                 icon: IconRun,             color: "#059669", bg: "#d1fae5" },
  { number: "19", name: "Tourism & Hospitality",  icon: IconPlaneTilt,       color: "#0369a1", bg: "#e0f2fe" },
  { number: "20", name: "Automotive",             icon: IconCar,             color: "#1e40af", bg: "#dbeafe" },
  { number: "21", name: "Green Jobs",             icon: IconLeaf,            color: "#15803d", bg: "#dcfce7" },
  { number: "22", name: "Food Processing",        icon: IconChefHat,         color: "#a16207", bg: "#fef9c3" },
  { number: "23", name: "Logistics",              icon: IconTruck,           color: "#475569", bg: "#f1f5f9" },
];
