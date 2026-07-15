"use client";

import { ChevronLeft, ChevronRight, FileText, Search, X } from "lucide-react";
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
import { searchTranscripts } from "@/lib/api/search";
import type { Pagination, TranscriptSearchResult } from "@/lib/api/types";
import { highlightedText, normalizeSearchPage, normalizeSearchStatus, normalizeSearchText, searchPageSize, searchTextProps } from "@/lib/search-utils";
import { formatTimestamp, safeValue, speakerLabel } from "@/lib/transcript-details-utils";
import { transcriptStatusFilters } from "@/lib/transcript-list-utils";

type SearchState = {
  query: string;
  items: TranscriptSearchResult[];
  pagination: Pagination | null;
};

export function SearchClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = normalizeSearchText(searchParams.get("q"));
  const page = normalizeSearchPage(searchParams.get("page"));
  const status = normalizeSearchStatus(searchParams.get("status"));
  const category = normalizeSearchText(searchParams.get("category"));
  const [queryDraft, setQueryDraft] = React.useState(query);
  const [categoryDraft, setCategoryDraft] = React.useState(category);
  const [data, setData] = React.useState<SearchState>({ query, items: [], pagination: null });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryToken, setRetryToken] = React.useState(0);

  React.useEffect(() => setQueryDraft(query), [query]);
  React.useEffect(() => setCategoryDraft(category), [category]);

  React.useEffect(() => {
    if (!query) {
      setData({ query: "", items: [], pagination: null });
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchTranscripts({ q: query, page, pageSize: searchPageSize, status, category }, controller.signal)
      .then((response) => setData({ query: response.query, items: response.items, pagination: response.pagination }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, page, status, category, retryToken]);

  function updateUrl(next: { q?: string; page?: number; status?: string; category?: string }) {
    const params = new URLSearchParams();
    const nextQuery = next.q ?? query;
    const nextStatus = next.status ?? status;
    const nextCategory = next.category ?? category;
    const nextPage = next.page ?? page;
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
    if (nextCategory.trim()) params.set("category", nextCategory.trim());
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = queryDraft.trim();
    if (!trimmed) return;
    updateUrl({ q: trimmed, page: 1, status, category: categoryDraft.trim() });
  }

  function clearSearch() {
    router.push(pathname);
  }

  const pagination = data.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  const showPagination = !loading && !error && pagination && totalPages > 0;

  return (
    <PageContainer>
      <PageHeader title="Search" />

      <Card className="mb-5">
        <CardContent className="p-4">
          <form onSubmit={submitSearch} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto] lg:items-end">
            <div className="grid gap-2">
              <label htmlFor="transcript-search" className="text-sm font-medium">Search transcripts</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="transcript-search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Search text" dir="auto" className="pl-9" />
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="search-status" className="text-sm font-medium">Status</label>
              <select id="search-status" value={status} onChange={(event) => updateUrl({ q: query, page: 1, status: event.target.value, category })} className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                {transcriptStatusFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="search-category" className="text-sm font-medium">Category</label>
              <Input id="search-category" value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} placeholder="Any" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={!queryDraft.trim() || loading}><Search className="h-4 w-4" /> Search</Button>
              <Button type="button" variant="ghost" onClick={clearSearch} disabled={!query && !category && status === "all"}><X className="h-4 w-4" /> Clear</Button>
            </div>
          </form>
          {query && <p className="mt-3 text-sm text-muted-foreground">{loading ? "Searching" : `${total} result${total === 1 ? "" : "s"}`}</p>}
        </CardContent>
      </Card>

      {!query && <EmptyState title="Search transcripts" />}
      {query && loading && <LoadingState label="Searching" />}
      {query && !loading && error && <ErrorState title="Search failed" description={error} onRetry={() => setRetryToken((value) => value + 1)} />}
      {query && !loading && !error && data.items.length === 0 && <EmptyState title="No matches" description="Try another search." />}
      {query && !loading && !error && data.items.length > 0 && <SearchResults items={data.items} query={data.query} />}

      {showPagination && (
        <nav className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Search pagination">
          <p className="text-sm text-muted-foreground">Page {pagination.page} of {Math.max(totalPages, 1)} - {pagination.total} total</p>
          <div className="flex gap-2">
            <Button asChild variant="outline" aria-disabled={pagination.page <= 1} className={pagination.page <= 1 ? "pointer-events-none opacity-50" : ""}>
              <Link href={searchPath({ q: query, page: pagination.page - 1, status, category })}><ChevronLeft className="h-4 w-4" /> Previous</Link>
            </Button>
            <Button asChild variant="outline" aria-disabled={!pagination.hasNextPage} className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : ""}>
              <Link href={searchPath({ q: query, page: pagination.page + 1, status, category })}>Next <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </nav>
      )}
    </PageContainer>
  );
}

function SearchResults({ items, query }: { items: TranscriptSearchResult[]; query: string }) {
  return (
    <div className="grid gap-4">
      {items.map((item) => {
        const textProps = searchTextProps(item.matchExcerpt || item.transcriptText);
        return (
          <Card key={`${item.segmentId}-${item.segmentIndex}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base"><Link className="hover:underline" href={detailsPath(item.jobId)}>{item.filename}</Link></CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{safeValue(item.referenceNumber, "No reference")} · {safeValue(item.category, "Uncategorized")}</p>
                </div>
                <StatusBadge status={item.transcriptStatus} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>{speakerLabel(item.speaker)}</span>
                <span>{formatTimestamp(item.startTime)} - {formatTimestamp(item.endTime)}</span>
              </div>
              <p dir={textProps.dir} className={textProps.className}>{highlightedText(item.matchExcerpt || item.transcriptText, query)}</p>
              <Button asChild size="sm" variant="outline"><Link href={detailsPath(item.jobId)}>View transcript</Link></Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function searchPath(params: { q: string; page: number; status: string; category: string }) {
  const searchParams = new URLSearchParams({ q: params.q });
  if (params.page > 1) searchParams.set("page", String(params.page));
  if (params.status && params.status !== "all") searchParams.set("status", params.status);
  if (params.category.trim()) searchParams.set("category", params.category.trim());
  return `/Search?${searchParams}`;
}

function detailsPath(jobId: string) {
  return `/Transcripts/Details?job_id=${encodeURIComponent(jobId)}`;
}
