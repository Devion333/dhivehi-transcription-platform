// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: analysis-review-status-badge.tsx
// Description: App component: analysis-review-status-badge
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { Badge } from "@/components/ui/badge";
import { analysisReviewStatusBadgeClass, analysisReviewStatusLabel } from "@/lib/analysis-review-status";
import { cn } from "@/lib/utils";

export function AnalysisReviewStatusBadge({ status, className }: { status?: string | null; className?: string }) {
  return <Badge variant="outline" className={cn(analysisReviewStatusBadgeClass(status), className)}>{analysisReviewStatusLabel(status)}</Badge>;
}
