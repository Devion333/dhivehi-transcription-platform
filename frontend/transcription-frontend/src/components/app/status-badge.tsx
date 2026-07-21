// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: status-badge.tsx
// Description: App component: status-badge
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { Badge } from "@/components/ui/badge";
import { statusBadgeClass } from "@/lib/status-styles";
import { transcriptStatusLabel } from "@/lib/transcript-status";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", statusBadgeClass(status), className)}>
      {transcriptStatusLabel(status)}
    </Badge>
  );
}
