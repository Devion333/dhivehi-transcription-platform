"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTranscripts } from "@/lib/api/transcripts";
import type { AnalysisReviewStatus, TranscriptSummary } from "@/lib/api/types";

const reviewStatuses: Array<"all" | AnalysisReviewStatus> = ["all", "unreviewed", "reviewed", "approved", "rejected"];

export function ReviewQueueClient() {
  const auth = useAuth();
  const [items, setItems] = React.useState<TranscriptSummary[]>([]);
  const [status, setStatus] = React.useState<"all" | AnalysisReviewStatus>("unreviewed");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTranscripts({ page: 1, pageSize: 100 }, controller.signal)
      .then((response) => setItems(response.items.filter((item) => item.analysisStatus === "complete")))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Review queue is unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filtered = status === "all" ? items : items.filter((item) => item.analysisReviewStatus === status);

  return (
    <PageContainer>
      <PageHeader title="Analysis Review Queue" description="Review generated analysis for transcripts you can access." />
      <div className="mb-4 flex flex-wrap gap-2">
        {reviewStatuses.map((item) => <Button key={item} type="button" variant={status === item ? "default" : "outline"} onClick={() => setStatus(item)}>{label(item)}</Button>)}
      </div>
      {loading && <LoadingState label="Loading review queue" />}
      {error && <ErrorState title="Could not load review queue" description={error} />}
      {!loading && !error && filtered.length === 0 && <EmptyState title="No matching analyses" description="Completed analyses matching this review filter will appear here." />}
      {!loading && !error && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((item) => (
            <Card key={item.jobId}>
              <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words font-semibold">{item.filename}</h2>
                    <StatusBadge status={item.analysisReviewStatus} />
                  </div>
                  <div className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <span>Reference: {item.referenceNumber || "N/A"}</span>
                    <span>Updated: {formatDate(item.updatedAt || item.createdAt)}</span>
                    {auth.user?.role === "admin" && <span>Owner: {item.ownerDisplayName || "Unassigned"}</span>}
                    <span>Transcript: {item.status}</span>
                  </div>
                </div>
                <Button asChild><Link href={`/Transcripts/Analysis?job_id=${encodeURIComponent(item.jobId)}`}><ExternalLink className="h-4 w-4" /> Open Analysis</Link></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

function label(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}
