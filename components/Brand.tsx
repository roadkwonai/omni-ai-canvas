import Image from "next/image";
import { asset } from "@/lib/site";

export function BrandMark({ className, size = 32 }: { className: string; size?: number }) {
  return <Image className={className} src={asset("/brand/mark-tile.svg")} alt="" width={size} height={size} unoptimized />;
}

export function Mascot({ pose, size, className }: {
  pose: "wave" | "guide" | "lost" | "empty" | "plan" | "direct";
  size: number;
  className?: string;
}) {
  return <Image className={className} src={asset(`/brand/omi-${pose}.webp`)} alt="" width={size} height={size} unoptimized />;
}
