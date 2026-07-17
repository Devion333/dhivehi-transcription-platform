"use client";

import { ChevronLeft, ChevronRight, FileText, Search, SlidersHorizontal, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth/auth-provider";
import { getTranscripts } from "@/lib/api/transcripts";
import type { Pagination, TranscriptSummary } from "@/lib/api/types";
import { isProcessingTranscriptStatus } from "@/lib/transcript-status";
import {
  buildTranscriptListPath,
  fallbackText,
  formatTranscriptDate,
  normalizePageParam,
  normalizeSearchParam,
  normalizeStatusParam,
  resultSummary,
  segmentCountLabel,
  transcriptDetailPath,
  transcriptPageSize,
  transcriptStatusFilters,
} from "@/lib/transcript-list-utils";

type ListState = {
  items: TranscriptSummary[];
  pagination: Pagination | null;
};

export function TranscriptListClient() {
	const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = normalizePageParam(searchParams.get("page"));
  const search = normalizeSearchParam(searchParams.get("search"));
  const status = normalizeStatusParam(searchParams.get("status"));
  const [searchDraft, setSearchDraft] = React.useState(search);
  const [data, setData] = React.useState<ListState>({ items: [], pagination: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [retryToken, setRetryToken] = React.useState(0);

  React.useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  const loadKey = `${page}:${search}:${status}:${retryToken}`;

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getTranscripts({ page, pageSize: transcriptPageSize, search, status }, controller.signal)
      .then((response) => {
        setData({ items: response.items, pagination: response.pagination });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load transcripts");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [loadKey, page, search, status]);

  React.useEffect(() => {
    if (loading || error || !data.items.some((item) => isProcessingTranscriptStatus(item.status))) return;

    let disposed = false;
    let inFlight = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    async function refresh() {
      if (disposed || inFlight) return;
      if (document.visibilityState === "hidden") {
        schedule();
        return;
      }
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await getTranscripts({ page, pageSize: transcriptPageSize, search, status }, controller.signal);
        if (!disposed) setData({ items: response.items, pagination: response.pagination });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "Failed to refresh transcripts");
      } finally {
        inFlight = false;
        controller = null;
        if (!disposed) schedule();
      }
    }

    function schedule() {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(refresh, 3000);
    }

    schedule();
    return () => {
      disposed = true;
      if (timeoutId) clearTimeout(timeoutId);
      controller?.abort();
    };
  }, [data.items, error, loading, page, search, status]);

  function navigate(next: { page?: number; search?: string; status?: string }) {
    router.push(buildTranscriptListPath({ page, search, status, ...next }));
  }

  function retry() {
    setRetryToken((value) => value + 1);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ page: 1, search: searchDraft.trim(), status });
  }

  function clearFilters() {
    router.push(pathname);
  }

  const pagination = data.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  const hasFilters = Boolean(search || status !== "all");
  const showPagination = !loading && !error && pagination && totalPages > 0;
  const isAdmin = auth.user?.role === "admin";

  return (
    <PageContainer>
      <PageHeader
        title="Transcripts"
        actions={<Button asChild><Link href="/Upload"><UploadCloud className="h-4 w-4" /> Upload</Link></Button>}
      />

      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-end">
            <form onSubmit={submitSearch} className="grid gap-2">
              <label htmlFor="transcript-search" className="text-sm font-medium">Search</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="transcript-search"
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    placeholder="Filename, reference, or category"
                    className="pl-9"
                  />
                </div>
                <Button type="submit" variant="outline">Search</Button>
              </div>
            </form>

            <div className="grid gap-2">
              <label htmlFor="status-filter" className="text-sm font-medium">Status</label>
              <div className="relative">
                <SlidersHorizontal className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  id="status-filter"
                  value={status}
                  onChange={(event) => navigate({ page: 1, status: event.target.value, search })}
                  className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {transcriptStatusFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
            </div>

            <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasFilters}>
              <X className="h-4 w-4" /> Clear filters
            </Button>
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            <span>{loading ? "Refreshing" : resultSummary(total, search, status)}</span>
          </div>
        </CardContent>
      </Card>

      {loading && <LoadingState label="Loading transcripts" />}
      {!loading && error && <ErrorState title="Could not load transcripts" description={error} onRetry={retry} />}
      {!loading && !error && data.items.length === 0 && (
        hasFilters ? (
          <EmptyState title="No matching transcripts" description="Clear filters to view all transcripts." />
        ) : (
          <EmptyState title="No transcripts yet" description="Upload a file to get started." action={<Button asChild><Link href="/Upload"><UploadCloud className="h-4 w-4" /> Upload</Link></Button>} />
        )
      )}
      {!loading && !error && data.items.length > 0 && (
        <>
          <TranscriptTable items={data.items} isAdmin={isAdmin} />
          <TranscriptCards items={data.items} isAdmin={isAdmin} />
        </>
      )}

      {showPagination && (
        <nav className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Transcript pagination">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {Math.max(totalPages, 1)} - {pagination.total} total
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" aria-disabled={pagination.page <= 1} className={pagination.page <= 1 ? "pointer-events-none opacity-50" : ""}>
              <Link href={buildTranscriptListPath({ page: pagination.page - 1, search, status })}><ChevronLeft className="h-4 w-4" /> Previous</Link>
            </Button>
            <Button asChild variant="outline" aria-disabled={!pagination.hasNextPage} className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : ""}>
              <Link href={buildTranscriptListPath({ page: pagination.page + 1, search, status })}>Next <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </nav>
      )}
    </PageContainer>
  );
}

function TranscriptTable({ items, isAdmin }: { items: TranscriptSummary[]; isAdmin: boolean }) {
  return (
    <Card className="hidden overflow-hidden lg:block">
      <table className="w-full table-fixed text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-[30%] px-4 py-3 font-medium">Filename</th>
            <th className="w-[16%] px-4 py-3 font-medium">Reference</th>
            <th className="hidden w-[12%] px-4 py-3 font-medium xl:table-cell">Category</th>
            <th className="w-[13%] px-4 py-3 font-medium">Status</th>
            <th className="w-[10%] px-4 py-3 font-medium">Segments</th>
            <th className="hidden w-[12%] px-4 py-3 font-medium 2xl:table-cell">Analysis</th>
            {isAdmin && <th className="hidden w-[14%] px-4 py-3 font-medium 2xl:table-cell">Owner</th>}
            <th className="w-[14%] px-4 py-3 font-medium">Created</th>
            <th className="w-[9%] px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {items.map((item) => (
            <tr key={item.jobId} className="bg-card">
              <td className="min-w-0 px-4 py-4">
                <Link className="block truncate font-medium hover:underline" href={transcriptDetailPath(item.jobId)} title={item.filename}>{item.filename}</Link>
                <p className="mt-1 truncate text-xs text-muted-foreground xl:hidden">{fallbackText(item.category, "Uncategorized")}</p>
                {item.notes && <p className="mt-1 truncate text-xs text-muted-foreground" title={item.notes}>{item.notes}</p>}
              </td>
              <td className="min-w-0 px-4 py-4 text-muted-foreground"><div className="truncate" title={fallbackText(item.referenceNumber, "No reference")}>{fallbackText(item.referenceNumber, "No reference")}</div></td>
              <td className="hidden px-4 py-4 text-muted-foreground xl:table-cell"><div className="truncate" title={fallbackText(item.category, "Uncategorized")}>{fallbackText(item.category, "Uncategorized")}</div></td>
              <td className="px-4 py-4"><StatusBadge status={item.status} /></td>
              <td className="px-4 py-4 text-muted-foreground">{segmentCountLabel(item.segmentCount)}</td>
              <td className="hidden px-4 py-4 2xl:table-cell"><StatusBadge status={item.analysisStatus} /></td>
              {isAdmin && <td className="hidden min-w-0 px-4 py-4 text-muted-foreground 2xl:table-cell"><div className="truncate" title={ownerLabel(item)}>{ownerLabel(item)}</div></td>}
              <td className="px-4 py-4 text-muted-foreground">{formatTranscriptDate(item.createdAt)}</td>
              <td className="px-4 py-4 text-right"><Button asChild size="sm" variant="outline"><Link href={transcriptDetailPath(item.jobId)}>View</Link></Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function TranscriptCards({ items, isAdmin }: { items: TranscriptSummary[]; isAdmin: boolean }) {
  return (
    <div className="grid gap-3 lg:hidden">
      {items.map((item) => (
        <Card key={item.jobId}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="truncate text-base"><Link className="hover:underline" href={transcriptDetailPath(item.jobId)}>{item.filename}</Link></CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{formatTranscriptDate(item.createdAt)}</p>
              </div>
              <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2"><StatusBadge status={item.status} /><StatusBadge status={item.analysisStatus} /></div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted-foreground">Reference</dt><dd>{fallbackText(item.referenceNumber, "No reference")}</dd></div>
              <div><dt className="text-muted-foreground">Category</dt><dd>{fallbackText(item.category, "Uncategorized")}</dd></div>
              <div><dt className="text-muted-foreground">Segments</dt><dd>{segmentCountLabel(item.segmentCount)}</dd></div>
              {isAdmin && <div><dt className="text-muted-foreground">Owner</dt><dd>{ownerLabel(item)}</dd></div>}
            </dl>
            {item.notes && <p className="line-clamp-2 text-sm text-muted-foreground">{item.notes}</p>}
            <Button asChild className="w-full" variant="outline"><Link href={transcriptDetailPath(item.jobId)}>View transcript</Link></Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ownerLabel(item: Pick<TranscriptSummary, "ownerDisplayName" | "ownerEmail" | "ownerUserId">) {
  return item.ownerDisplayName || item.ownerEmail || item.ownerUserId || "Legacy ownerless";
}
