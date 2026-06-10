import { PLATFORM_NAME_LINE1, PLATFORM_NAME_LINE2 } from "@/constants/branding";
import { cn } from "@/lib/utils";

type PlatformNameProps = {
  className?: string;
  line1ClassName?: string;
  line2ClassName?: string;
};

export function PlatformName({ className, line1ClassName, line2ClassName }: PlatformNameProps) {
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span className={line1ClassName}>{PLATFORM_NAME_LINE1}</span>
      <span className={line2ClassName}>{PLATFORM_NAME_LINE2}</span>
    </span>
  );
}
