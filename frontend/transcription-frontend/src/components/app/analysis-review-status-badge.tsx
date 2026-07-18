import { Badge } from "@/components/ui/badge";
import { analysisReviewStatusBadgeClass, analysisReviewStatusLabel } from "@/lib/analysis-review-status";
import { cn } from "@/lib/utils";

export function AnalysisReviewStatusBadge({ status, className }: { status?: string | null; className?: string }) {
  return <Badge variant="outline" className={cn(analysisReviewStatusBadgeClass(status), className)}>{analysisReviewStatusLabel(status)}</Badge>;
}
