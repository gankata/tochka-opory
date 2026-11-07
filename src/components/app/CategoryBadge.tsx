import type { CSSProperties } from "react";
import { categoryTone } from "@/lib/category-colors";
import { cn } from "@/lib/utils";

export function CategoryBadge({ name, className }: { name: string; className?: string }) {
  const tone = categoryTone(name);
  return (
    <span
      className={cn("category-badge inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", className)}
      style={{ "--category-color": tone.dot } as CSSProperties}
      title={name}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone.dot }} aria-hidden="true" />
      <span className="truncate">{name}</span>
    </span>
  );
}
