import Image from "next/image";

import { AUTH_BRAND_GALLERY_IMAGES } from "@/constants/platform-stats";
import { cn } from "@/lib/utils";

type AuthBrandGalleryProps = {
  className?: string;
  variant?: "light" | "dark";
};

export function AuthBrandGallery({ className, variant = "light" }: AuthBrandGalleryProps) {
  return (
    <div className={cn("mx-auto grid w-full max-w-[420px] grid-cols-2 gap-3 sm:max-w-[460px] sm:gap-4", className)}>
      {AUTH_BRAND_GALLERY_IMAGES.map((image) => (
        <div
          key={image.src}
          className={cn(
            "relative aspect-square w-full overflow-hidden rounded-xl border",
            variant === "light" ? "border-[#dbeafe] bg-white shadow-sm" : "border-white/10 bg-[#0c1f35]",
          )}
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className="object-cover object-center"
            sizes="(max-width: 640px) 200px, 220px"
          />
        </div>
      ))}
    </div>
  );
}
