"use client";

import { ExternalLink, RefreshCcw } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { AnalysisReviewStatusBadge } from "@/components/app/analysis-review-status-badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { TranscriptReassignmentDialog } from "@/components/transcripts/transcript-reassignment-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTranscripts } from "@/lib/api/transcripts";
import type { Pagination, TranscriptSummary } from "@/lib/api/types";

export function AdminTranscriptsClient() {
  const [items, setItems] = React.useState<TranscriptSummary[]>([]);
  const [pagination, setPagination] = React.useState<Pagination | null>(null);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = React.useState<TranscriptSummary | null>(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTranscripts({ page, pageSize: 20, search: query }, controller.signal)
      .then((response) => { setItems(response.items); setPagination(response.pagination); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Transcripts are unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, query, reload]);

  return (
    <PageContainer>
      <PageHeader title="Transcript Administration" actions={<Button variant="outline" onClick={() => setReload((value) => value + 1)}><RefreshCcw className="h-4 w-4" /> Refresh</Button>} />
      <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}>
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search filename, reference, owner, category" />
        <Button type="submit">Search</Button>
      </form>
      {message && <div className="mb-4 rounded-lg border bg-card px-4 py-3 text-sm">{message}</div>}
      {loading && <LoadingState label="Loading transcripts" />}
      {error && <ErrorState title="Could not load transcripts" description={error} />}
      {!loading && !error && items.length === 0 && <EmptyState title="No transcripts found" description="No transcripts match the current filters." />}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.jobId}>
              <CardContent className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="min-w-0 space-y-2">
                  <h2 className="break-words font-semibold">{item.filename}</h2>
                  <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
                    <span>Owner: {item.ownerDisplayName || "Unassigned"}</span>
                    <span>Created: {formatDate(item.createdAt)}</span>
                    <span><StatusBadge status={item.status} /></span>
                    <span className="inline-flex items-center gap-1">Transcript review: <AnalysisReviewStatusBadge status={item.analysisReviewStatus} /></span>
                    <span>Segments: {item.segmentCount}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm"><Link href={`/Transcripts/Details?job_id=${encodeURIComponent(item.jobId)}`}><ExternalLink className="h-4 w-4" /> Open</Link></Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setMessage(null); setReassignTarget(item); }}>Reassign</Button>
                  <Button asChild size="sm" variant="outline"><Link href={`/Transcripts/Details?job_id=${encodeURIComponent(item.jobId)}`}>Delete</Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {pagination && <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={!pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>}
        </div>
      )}
      {reassignTarget && (
        <TranscriptReassignmentDialog
          jobId={reassignTarget.jobId}
          filename={reassignTarget.filename}
          currentOwner={{ userId: reassignTarget.ownerUserId, displayName: reassignTarget.ownerDisplayName, email: reassignTarget.ownerEmail }}
          open={Boolean(reassignTarget)}
          onOpenChange={(open) => { if (!open) setReassignTarget(null); }}
          onReassigned={(response, newOwnerUserId) => {
            setItems((current) => current.map((item) => item.jobId === response.jobId ? { ...item, ownerUserId: newOwnerUserId, ownerDisplayName: response.newOwner.displayName, ownerEmail: response.newOwner.email } : item));
            setMessage("Transcript reassigned.");
            setReassignTarget(null);
          }}
        />
      )}
    </PageContainer>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}
