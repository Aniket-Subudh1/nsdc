import Image from "next/image";

import { AUTH_BRAND_GALLERY_IMAGES } from "@/constants/platform-stats";
import { cn } from "@/lib/utils";

type AuthBrandGalleryProps = {
  className?: string;
  variant?: "light" | "dark";
};

export function AuthBrandGallery({ className, variant = "light" }: AuthBrandGalleryProps) {
  return (
    <div className={cn("mx-auto grid w-full max-w-[300px] grid-cols-3 gap-2", className)}>
      {AUTH_BRAND_GALLERY_IMAGES.map((image) => (
        <div
          key={image.src}
          className={cn(
            "relative aspect-square w-full overflow-hidden rounded-lg border",
            variant === "light" ? "border-[#dbeafe] bg-white shadow-sm" : "border-white/10 bg-[#0c1f35]",
          )}
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className="object-cover object-center"
            sizes="96px"
          />
        </div>
      ))}
    </div>
  );
}
