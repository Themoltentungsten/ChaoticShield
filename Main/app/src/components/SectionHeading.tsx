import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = "left",
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <div className={cn("flex items-center gap-3", align === "center" && "justify-center")}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-400">
          {eyebrow}
        </span>
        <span className="h-px w-10 bg-gradient-to-r from-gold-500/60 to-transparent" />
      </div>
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-stone-100 sm:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 text-[15px] leading-relaxed text-stone-400">{sub}</p>}
    </div>
  );
}
