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
