// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: page-container.tsx
// Description: App component: page-container
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8", className)}>{children}</div>;
}
