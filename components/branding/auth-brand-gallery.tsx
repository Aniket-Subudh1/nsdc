import Image from "next/image";

import { AUTH_BRAND_GALLERY_IMAGES } from "@/constants/platform-stats";
import { cn } from "@/lib/utils";

type AuthBrandGalleryProps = {
  className?: string;
  variant?: "light" | "dark";
};

export function AuthBrandGallery({ className, variant = "light" }: AuthBrandGalleryProps) {
  return (
    <div className={cn("grid w-full grid-cols-3 gap-3", className)}>
      {AUTH_BRAND_GALLERY_IMAGES.map((image, index) => (
        <div
          key={image.src}
          className={cn(
            "relative aspect-4/3 w-full overflow-hidden rounded-xl border shadow-sm",
            variant === "light" ? "border-[#dbeafe] bg-white" : "border-white/15 bg-[#0c1f35]",
          )}
        >
          <Image
            src={image.src}
            alt={image.alt}
            fill
            priority={index === 0}
            quality={92}
            className="object-cover"
            style={{
              objectPosition: image.objectPosition,
              transform: `scale(${image.scale})`,
            }}
            sizes="(min-width: 1280px) 180px, (min-width: 1024px) 150px, 120px"
          />
        </div>
      ))}
    </div>
  );
}
