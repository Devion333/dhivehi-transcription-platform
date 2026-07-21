"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: review-queue-client.tsx
// Description: Frontend page or component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTranscripts } from "@/lib/api/transcripts";
import type { TranscriptSummary } from "@/lib/api/types";
import {
  reviewProgressLabel,
  reviewProgressBadgeClass,
  reviewProgressTextClass,
} from "@/lib/analysis-review-status";
import { withReturnTo } from "@/lib/navigation-utils";
import { transcriptReferenceLabel } from "@/lib/transcript-identity";
import { segmentCountLabel } from "@/lib/transcript-list-utils";

type FilterKey = "all" | "not_reviewed" | "in_progress" | "fully_reviewed";

const filters: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "not_reviewed", label: "Not reviewed" },
  { key: "in_progress", label: "In progress" },
  { key: "fully_reviewed", label: "Fully reviewed" },
];

function matchesFilter(
  item: TranscriptSummary,
  filter: FilterKey,
): boolean {
  if (filter === "all") return true;
  const pct = item.reviewPercentage ?? 0;
  if (filter === "not_reviewed") return pct === 0;
  if (filter === "in_progress") return pct > 0 && pct < 100;
  if (filter === "fully_reviewed") return pct >= 100;
  return true;
}

function getPercentage(item: TranscriptSummary): number {
  return item.reviewPercentage ?? 0;
}

export function ReviewQueueClient() {
  const auth = useAuth();
  const [items, setItems] = React.useState<TranscriptSummary[]>([]);
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTranscripts({ page: 1, pageSize: 100 }, controller.signal)
      .then((response) =>
        setItems(
          response.items
            .filter((item) => item.analysisStatus === "complete")
            .sort((a, b) => getPercentage(a) - getPercentage(b)),
        ),
      )
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not load transcripts");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filtered = items.filter((item) => matchesFilter(item, filter));

  return (
    <PageContainer>
      <PageHeader title="Review Progress" />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            type="button"
            variant={filter === f.key ? "default" : "outline"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      {loading && <LoadingState label="Loading review progress" />}
      {error && <ErrorState title="Could not load review progress" description={error} />}
      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title="No matching transcripts"
          description="Transcripts matching this filter will appear here."
        />
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((item) => {
            const pct = getPercentage(item);
            const reviewed = item.reviewedSegmentCount ?? 0;
            const total = item.totalSegmentCount ?? item.segmentCount ?? 0;
            return (
              <Card key={item.jobId}>
                <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words font-semibold">
                        {transcriptReferenceLabel(item.referenceNumber)}
                      </h2>
                      <span className="text-sm text-muted-foreground">
                        {item.filename}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {auth.user?.role === "admin" && (
                        <span>Owner: {item.ownerDisplayName || "Unassigned"}</span>
                      )}
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${reviewProgressBadgeClass(pct)} ${reviewProgressTextClass(pct)}`}>
                        {item.status}
                      </span>
                      <span>{segmentCountLabel(total)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`whitespace-nowrap text-xs font-medium ${reviewProgressTextClass(pct)}`}>
                        {reviewProgressLabel(reviewed, total, pct)}
                      </span>
                    </div>
                  </div>
                  <Button asChild>
                    <Link
                      href={withReturnTo(
                        `/Transcripts/Details?job_id=${encodeURIComponent(item.jobId)}`,
                        "/Analysis/Review-Queue",
                      )}
                    >
                      <ExternalLink className="h-4 w-4" />
                      Review
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
