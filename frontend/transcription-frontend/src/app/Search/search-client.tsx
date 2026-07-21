"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: search-client.tsx
// Description: Frontend page or component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { ChevronLeft, ChevronRight, FileText, Search, SlidersHorizontal, X } from "lucide-react";
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
import { reviewProgressBadgeClass, reviewProgressLabel } from "@/lib/analysis-review-status";
import { listFolders } from "@/lib/api/folders";
import { searchTranscripts } from "@/lib/api/search";
import type { Folder, Pagination, TranscriptSearchResult } from "@/lib/api/types";
import { withReturnTo } from "@/lib/navigation-utils";
import { highlightedText, normalizeSearchPage, normalizeSearchStatus, normalizeSearchText, searchPageSize, searchTextProps } from "@/lib/search-utils";
import { transcriptReferenceLabel } from "@/lib/transcript-identity";
import { formatTimestamp, safeValue, speakerLabel } from "@/lib/transcript-details-utils";
import { transcriptStatusFilters } from "@/lib/transcript-list-utils";

type SearchState = {
  query: string;
  items: TranscriptSearchResult[];
  pagination: Pagination | null;
};

export function SearchClient() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = normalizeSearchText(searchParams.get("q"));
  const page = normalizeSearchPage(searchParams.get("page"));
  const status = normalizeSearchStatus(searchParams.get("status"));
  const category = normalizeSearchText(searchParams.get("category"));
  const createdFrom = normalizeSearchText(searchParams.get("createdFrom"));
  const createdTo = normalizeSearchText(searchParams.get("createdTo"));
  const ownerUserId = normalizeSearchText(searchParams.get("ownerUserId"));
  const folderId = normalizeSearchText(searchParams.get("folderId"));
  const filename = normalizeSearchText(searchParams.get("filename"));
  const reference = normalizeSearchText(searchParams.get("reference"));
  const speaker = normalizeSearchText(searchParams.get("speaker"));
  const [queryDraft, setQueryDraft] = React.useState(query);
  const [categoryDraft, setCategoryDraft] = React.useState(category);
  const [createdFromDraft, setCreatedFromDraft] = React.useState(createdFrom);
  const [createdToDraft, setCreatedToDraft] = React.useState(createdTo);
  const [ownerDraft, setOwnerDraft] = React.useState(ownerUserId);
  const [folders, setFolders] = React.useState<Folder[]>([]);
  const [filenameDraft, setFilenameDraft] = React.useState(filename);
  const [referenceDraft, setReferenceDraft] = React.useState(reference);
  const [speakerDraft, setSpeakerDraft] = React.useState(speaker);
  const [moreOpen, setMoreOpen] = React.useState(Boolean(filename || reference || speaker));
  const [data, setData] = React.useState<SearchState>({ query, items: [], pagination: null });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryToken, setRetryToken] = React.useState(0);

  React.useEffect(() => setQueryDraft(query), [query]);
  React.useEffect(() => setCategoryDraft(category), [category]);
  React.useEffect(() => setCreatedFromDraft(createdFrom), [createdFrom]);
  React.useEffect(() => setCreatedToDraft(createdTo), [createdTo]);
  React.useEffect(() => setOwnerDraft(ownerUserId), [ownerUserId]);
  React.useEffect(() => { const controller = new AbortController(); listFolders({ page: 1, pageSize: 100 }, controller.signal).then((response) => setFolders(response.items)).catch(() => undefined); return () => controller.abort(); }, []);
  React.useEffect(() => setFilenameDraft(filename), [filename]);
  React.useEffect(() => setReferenceDraft(reference), [reference]);
  React.useEffect(() => setSpeakerDraft(speaker), [speaker]);

  React.useEffect(() => {
    if (!hasSearchFilters({ query, status, category, createdFrom, createdTo, ownerUserId, folderId, filename, reference, speaker })) {
      setData({ query: "", items: [], pagination: null });
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    searchTranscripts({ q: query, page, pageSize: searchPageSize, status, category, createdFrom, createdTo, ownerUserId, folderId, filename, reference, speaker }, controller.signal)
      .then((response) => setData({ query: response.query, items: response.items, pagination: response.pagination }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Search failed");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, page, status, category, createdFrom, createdTo, ownerUserId, folderId, filename, reference, speaker, retryToken]);

  function updateUrl(next: { q?: string; page?: number; status?: string; category?: string; createdFrom?: string; createdTo?: string; ownerUserId?: string; folderId?: string; filename?: string; reference?: string; speaker?: string }) {
    const params = new URLSearchParams();
    const nextQuery = next.q ?? query;
    const nextStatus = next.status ?? status;
    const nextCategory = next.category ?? category;
    const nextCreatedFrom = next.createdFrom ?? createdFrom;
    const nextCreatedTo = next.createdTo ?? createdTo;
    const nextOwnerUserId = next.ownerUserId ?? ownerUserId;
    const nextFolderId = next.folderId ?? folderId;
    const nextFilename = next.filename ?? filename;
    const nextReference = next.reference ?? reference;
    const nextSpeaker = next.speaker ?? speaker;
    const nextPage = next.page ?? page;
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextPage > 1) params.set("page", String(nextPage));
    if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
    if (nextCategory.trim()) params.set("category", nextCategory.trim());
    if (nextCreatedFrom.trim()) params.set("createdFrom", nextCreatedFrom.trim());
    if (nextCreatedTo.trim()) params.set("createdTo", nextCreatedTo.trim());
    if (auth.user?.role === "admin" && nextOwnerUserId.trim()) params.set("ownerUserId", nextOwnerUserId.trim());
    if (nextFolderId.trim()) params.set("folderId", nextFolderId.trim());
    if (nextFilename.trim()) params.set("filename", nextFilename.trim());
    if (nextReference.trim()) params.set("reference", nextReference.trim());
    if (nextSpeaker.trim()) params.set("speaker", nextSpeaker.trim());
    router.push(params.toString() ? `${pathname}?${params}` : pathname);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateUrl({ q: queryDraft.trim(), page: 1, status, category: categoryDraft.trim(), createdFrom: createdFromDraft, createdTo: createdToDraft, ownerUserId: ownerDraft, folderId, filename: filenameDraft, reference: referenceDraft, speaker: speakerDraft });
  }

  function clearSearch() {
    router.push(pathname);
  }

  const pagination = data.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  const showPagination = !loading && !error && pagination && totalPages > 0;
  const hasFilters = hasSearchFilters({ query, status, category, createdFrom, createdTo, ownerUserId, folderId, filename, reference, speaker });

  return (
    <PageContainer>
      <PageHeader title="Search" />

      <Card className="mb-5">
        <CardContent className="p-4">
          <form onSubmit={submitSearch} className="grid gap-4 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
            <div className="grid min-w-0 gap-2 md:col-span-2 xl:col-span-4">
              <label htmlFor="transcript-search" className="text-sm font-medium">Search transcripts</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="transcript-search" value={queryDraft} onChange={(event) => setQueryDraft(event.target.value)} placeholder="Search text or metadata" dir="auto" className="pl-9" />
              </div>
            </div>
            <div className="grid min-w-0 gap-2 xl:col-span-2">
              <label htmlFor="search-status" className="text-sm font-medium">Status</label>
              <select id="search-status" value={status} onChange={(event) => updateUrl({ q: query, page: 1, status: event.target.value, category })} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                {transcriptStatusFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="grid min-w-0 gap-2 xl:col-span-2">
              <label htmlFor="search-category" className="text-sm font-medium">Category</label>
              <Input id="search-category" value={categoryDraft} onChange={(event) => setCategoryDraft(event.target.value)} placeholder="Any" />
            </div>
            <div className="grid min-w-0 gap-2 md:col-span-2 xl:col-span-2">
              <label className="text-sm font-medium">Date range</label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={createdFromDraft} onChange={(event) => setCreatedFromDraft(event.target.value)} aria-label="Created from" />
                <Input type="date" value={createdToDraft} onChange={(event) => setCreatedToDraft(event.target.value)} aria-label="Created to" />
              </div>
            </div>
            <div className="grid min-w-0 gap-2 xl:col-span-2"><label htmlFor="search-folder" className="text-sm font-medium">Folder</label><select id="search-folder" value={folderId} onChange={(event) => updateUrl({ q: query, page: 1, folderId: event.target.value })} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="">All folders</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></div>
            <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-full">
              <Button type="submit" disabled={loading}><Search className="h-4 w-4" /> Search</Button>
              <Button type="button" variant="ghost" onClick={clearSearch} disabled={!hasFilters}><X className="h-4 w-4" /> Reset</Button>
            </div>
            {auth.user?.role === "admin" && (
              <div className="grid min-w-0 gap-2 md:col-span-2 xl:col-span-4">
                <label htmlFor="search-owner" className="text-sm font-medium">Owner</label>
                <Input id="search-owner" value={ownerDraft} onChange={(event) => setOwnerDraft(event.target.value)} placeholder="Owner user ID" />
              </div>
            )}
            <div className="md:col-span-2 xl:col-span-full">
              <Button type="button" variant="ghost" size="sm" onClick={() => setMoreOpen((value) => !value)}><SlidersHorizontal className="h-4 w-4" /> More filters</Button>
            </div>
            {moreOpen && (
              <div className="grid gap-4 md:col-span-2 md:grid-cols-3 xl:col-span-full">
                <div className="grid min-w-0 gap-2"><label htmlFor="search-filename" className="text-sm font-medium">Filename</label><Input id="search-filename" value={filenameDraft} onChange={(event) => setFilenameDraft(event.target.value)} /></div>
                <div className="grid min-w-0 gap-2"><label htmlFor="search-reference" className="text-sm font-medium">Reference</label><Input id="search-reference" value={referenceDraft} onChange={(event) => setReferenceDraft(event.target.value)} /></div>
                <div className="grid min-w-0 gap-2"><label htmlFor="search-speaker" className="text-sm font-medium">Speaker</label><Input id="search-speaker" value={speakerDraft} onChange={(event) => setSpeakerDraft(event.target.value)} /></div>
              </div>
            )}
          </form>
          {hasFilters && <p className="mt-3 text-sm text-muted-foreground">{loading ? "Searching" : `${total} result${total === 1 ? "" : "s"}`}</p>}
        </CardContent>
      </Card>

      {!hasFilters && <EmptyState title="Search transcripts" />}
      {hasFilters && loading && <LoadingState label="Searching" />}
      {hasFilters && !loading && error && <ErrorState title="Search failed" description={error} onRetry={() => setRetryToken((value) => value + 1)} />}
      {hasFilters && !loading && !error && data.items.length === 0 && <EmptyState title="No matches" description="Try another search." />}
      {hasFilters && !loading && !error && data.items.length > 0 && <SearchResults items={data.items} query={data.query} returnTo={`${pathname}${searchParams.toString() ? `?${searchParams}` : ""}`} />}

      {showPagination && (
        <nav className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Search pagination">
          <p className="text-sm text-muted-foreground">Page {pagination.page} of {Math.max(totalPages, 1)} - {pagination.total} total</p>
          <div className="flex gap-2">
            <Button asChild variant="outline" aria-disabled={pagination.page <= 1} className={pagination.page <= 1 ? "pointer-events-none opacity-50" : ""}>
              <Link href={searchPath({ q: query, page: pagination.page - 1, status, category, createdFrom, createdTo, ownerUserId, folderId, filename, reference, speaker })}><ChevronLeft className="h-4 w-4" /> Previous</Link>
            </Button>
            <Button asChild variant="outline" aria-disabled={!pagination.hasNextPage} className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : ""}>
              <Link href={searchPath({ q: query, page: pagination.page + 1, status, category, createdFrom, createdTo, ownerUserId, folderId, filename, reference, speaker })}>Next <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </nav>
      )}
    </PageContainer>
  );
}

function SearchResults({ items, query, returnTo }: { items: TranscriptSearchResult[]; query: string; returnTo: string }) {
  return (
    <div className="grid gap-4">
      {items.map((item) => {
        const text = item.matchExcerpt || item.matchedText || item.transcriptText || "Metadata match";
        const textProps = searchTextProps(text);
        return (
          <Card key={`${item.jobId}-${item.segmentId ?? "metadata"}-${item.segmentIndex}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="truncate text-base"><Link className="hover:underline" href={withReturnTo(detailsPath(item.jobId, item.segmentId), returnTo)}>{transcriptReferenceLabel(item.referenceNumber)}</Link></CardTitle>
                  <p className="mt-1 truncate text-sm text-muted-foreground" title={item.filename}>{item.filename}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{safeValue(item.category, "Uncategorized")}{item.folderName ? ` Â· Folder: ${item.folderName}` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={item.transcriptStatus} />
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${reviewProgressBadgeClass(item.reviewPercentage)}`}>{reviewProgressLabel(item.reviewedSegmentCount, item.totalSegmentCount, item.reviewPercentage)}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <FileText className="h-4 w-4" />
                {item.segmentId ? <span>{item.speakerDisplayName || speakerLabel(item.speaker)}</span> : <span>Metadata match</span>}
                {item.segmentId && <span>{formatTimestamp(item.startTime)} - {formatTimestamp(item.endTime)}</span>}
              </div>
              <p dir={textProps.dir} className={textProps.className}>{highlightedText(text, query)}</p>
              <Button asChild size="sm" variant="outline"><Link href={withReturnTo(detailsPath(item.jobId, item.segmentId), returnTo)}>{item.segmentId ? "Open matching segment" : "View transcript"}</Link></Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function searchPath(params: { q: string; page: number; status: string; category: string; createdFrom: string; createdTo: string; ownerUserId: string; folderId: string; filename: string; reference: string; speaker: string }) {
  const searchParams = new URLSearchParams();
  if (params.q.trim()) searchParams.set("q", params.q.trim());
  if (params.page > 1) searchParams.set("page", String(params.page));
  if (params.status && params.status !== "all") searchParams.set("status", params.status);
  if (params.category.trim()) searchParams.set("category", params.category.trim());
  if (params.createdFrom.trim()) searchParams.set("createdFrom", params.createdFrom.trim());
  if (params.createdTo.trim()) searchParams.set("createdTo", params.createdTo.trim());
  if (params.ownerUserId.trim()) searchParams.set("ownerUserId", params.ownerUserId.trim());
  if (params.folderId.trim()) searchParams.set("folderId", params.folderId.trim());
  if (params.filename.trim()) searchParams.set("filename", params.filename.trim());
  if (params.reference.trim()) searchParams.set("reference", params.reference.trim());
  if (params.speaker.trim()) searchParams.set("speaker", params.speaker.trim());
  return `/Search?${searchParams}`;
}

function detailsPath(jobId: string, segmentId?: string) {
  const params = new URLSearchParams({ job_id: jobId });
  if (segmentId) params.set("segment_id", segmentId);
  return `/Transcripts/Details?${params}`;
}

function hasSearchFilters(filters: Record<string, string>) {
  return Object.entries(filters).some(([key, value]) => key === "status" ? value !== "all" : Boolean(value.trim()));
}
