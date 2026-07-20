"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getAccountActivity } from "@/lib/api/account";
import type { AccountActivityItem, Pagination } from "@/lib/api/types";
import { withReturnTo } from "@/lib/navigation-utils";
import { transcriptReferenceLabel } from "@/lib/transcript-identity";

export function ActivityClient() {
  const [items, setItems] = React.useState<AccountActivityItem[]>([]);
  const [pagination, setPagination] = React.useState<Pagination | null>(null);
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getAccountActivity({ page, pageSize: 20 }, controller.signal)
      .then((response) => {
        setItems(response.items);
        setPagination(response.pagination);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Activity is unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page]);

  return (
    <PageContainer>
      <PageHeader title="Activity" />
      {loading && <LoadingState label="Loading activity" />}
      {error && <ErrorState title="Could not load activity" description={error} />}
      {!loading && !error && items.length === 0 && <EmptyState title="No activity yet" description="Your recent uploads, transcript views, edits, reviews, and downloads will appear here." />}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="font-semibold">{item.title}</h2>
                  {item.resourceType === "transcript" ? (
                    <>
                      <p className="mt-1 font-medium">{transcriptReferenceLabel(item.referenceNumber)}</p>
                      {item.filename && <p className="mt-1 truncate text-sm text-muted-foreground" title={item.filename}>{item.filename}</p>}
                    </>
                  ) : <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail || item.description} · {formatDate(item.createdAt)}</p>
                </div>
                {item.resourceType === "transcript" && item.resourceId && (
                  <Button asChild variant="outline" size="sm"><Link href={withReturnTo(`/Transcripts/Details?job_id=${encodeURIComponent(item.resourceId)}`, activityPath(page))}><ExternalLink className="h-4 w-4" /> Open transcript</Link></Button>
                )}
              </CardContent>
            </Card>
          ))}
          {pagination && (
            <div className="flex items-center justify-between gap-3 pt-2 text-sm text-muted-foreground">
              <span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <Button type="button" variant="outline" size="sm" disabled={!pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </PageContainer>
  );
}

function activityPath(page: number) {
  return page > 1 ? `/Activity?page=${page}` : "/Activity";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}
