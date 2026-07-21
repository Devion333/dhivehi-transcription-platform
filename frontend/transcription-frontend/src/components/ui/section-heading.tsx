// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: section-heading.tsx
// Description: UI component: section-heading
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { ElementType, ReactNode } from "react";

import { sectionToneClasses, type SectionTone } from "@/lib/section-styles";
import { cn } from "@/lib/utils";

export function SectionHeading({
  title,
  description,
  icon: Icon,
  tone = "neutral",
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: ElementType;
  tone?: SectionTone;
  actions?: ReactNode;
  className?: string;
}) {
  const classes = sectionToneClasses[tone];

  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", classes.icon)}><Icon className="h-4 w-4" /></span>}
        <div className="min-w-0">
          <h2 className="font-semibold leading-6 text-foreground">{title}</h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
