"use client";

import { ChevronLeft, ChevronRight, Eye, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAuditEvent, getAuditEvents } from "@/lib/api/admin-audit";
import { ApiError } from "@/lib/api/client";
import type { AuditEventDetail, AuditEventSummary, Pagination } from "@/lib/api/types";
import {
  auditActionLabel,
  auditActorLabel,
  auditCategories,
  auditCategoryLabel,
  auditOutcomeLabel,
  auditOutcomes,
  auditPageSize,
  auditResourceLabel,
  buildAuditPath,
  formatAuditDate,
  metadataEntries,
  normalizeAuditCategory,
  normalizeAuditDate,
  normalizeAuditOutcome,
  normalizeAuditPage,
  normalizeAuditSearch,
  toRFC3339Date,
} from "@/lib/admin-audit-utils";

type ListState = { items: AuditEventSummary[]; pagination: Pagination | null };

export function AdminAuditClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = normalizeAuditPage(searchParams.get("page"));
  const search = normalizeAuditSearch(searchParams.get("search"));
  const category = normalizeAuditCategory(searchParams.get("category"));
  const outcome = normalizeAuditOutcome(searchParams.get("outcome"));
  const dateFrom = normalizeAuditDate(searchParams.get("dateFrom"));
  const dateTo = normalizeAuditDate(searchParams.get("dateTo"));
  const [searchDraft, setSearchDraft] = React.useState(search);
  const [data, setData] = React.useState<ListState>({ items: [], pagination: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<AuditEventDetail | null>(null);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [retryToken, setRetryToken] = React.useState(0);

  React.useEffect(() => setSearchDraft(search), [search]);

  const loadKey = `${page}:${search}:${category}:${outcome}:${dateFrom}:${dateTo}:${retryToken}`;
  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getAuditEvents({ page, pageSize: auditPageSize, search, category, outcome, dateFrom: toRFC3339Date(dateFrom), dateTo: toRFC3339Date(dateTo, true) }, controller.signal)
      .then((response) => setData({ items: response.items, pagination: response.pagination }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(auditErrorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadKey, page, search, category, outcome, dateFrom, dateTo]);

  function navigate(next: { page?: number; search?: string; category?: typeof category; outcome?: typeof outcome; dateFrom?: string; dateTo?: string }) {
    router.push(buildAuditPath({ page, search, category, outcome, dateFrom, dateTo, ...next }));
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ page: 1, search: searchDraft });
  }

  async function openDetail(event: AuditEventSummary) {
    setDetailError(null);
    try {
      const response = await getAuditEvent(event.id);
      setDetail(response.event);
    } catch (err) {
      setDetailError(auditErrorMessage(err));
    }
  }

  const pagination = data.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  const hasFilters = Boolean(search || category !== "all" || outcome !== "all" || dateFrom || dateTo);

  return (
    <PageContainer>
      <PageHeader title="Audit" />

      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_170px_150px_160px_160px_auto] lg:items-end">
            <form onSubmit={submitSearch} className="grid gap-2">
              <label htmlFor="audit-search" className="text-sm font-medium">Search</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="audit-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Actor, action, resource" className="pl-9" />
                </div>
                <Button type="submit" variant="outline">Search</Button>
              </div>
            </form>
            <SelectFilter id="audit-category" label="Category" value={category} values={auditCategories} onChange={(value) => navigate({ page: 1, category: value as typeof category })} />
            <SelectFilter id="audit-outcome" label="Outcome" value={outcome} values={auditOutcomes} onChange={(value) => navigate({ page: 1, outcome: value as typeof outcome })} />
            <DateFilter id="audit-from" label="From" value={dateFrom} onChange={(value) => navigate({ page: 1, dateFrom: value })} />
            <DateFilter id="audit-to" label="To" value={dateTo} onChange={(value) => navigate({ page: 1, dateTo: value })} />
            <Button type="button" variant="ghost" onClick={() => router.push(pathname)} disabled={!hasFilters}><X className="h-4 w-4" /> Clear</Button>
          </div>
        </CardContent>
      </Card>

      {detailError && <div className="mb-4 rounded-lg border bg-card px-4 py-3 text-sm text-destructive">{detailError}</div>}
      {loading && <LoadingState label="Loading audit" />}
      {!loading && error && <ErrorState title="Could not load audit" description={error} onRetry={() => setRetryToken((value) => value + 1)} />}
      {!loading && !error && data.items.length === 0 && (hasFilters ? <EmptyState title="No matching events" /> : <EmptyState title="No audit events" />)}
      {!loading && !error && data.items.length > 0 && <><AuditTable items={data.items} onDetail={openDetail} /><AuditCards items={data.items} onDetail={openDetail} /></>}

      {pagination && totalPages > 0 && !loading && !error && (
        <nav className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Audit pagination">
          <p className="text-sm text-muted-foreground">Page {pagination.page} of {Math.max(totalPages, 1)} - {pagination.total} total</p>
          <div className="flex gap-2">
            <Button asChild variant="outline" aria-disabled={pagination.page <= 1} className={pagination.page <= 1 ? "pointer-events-none opacity-50" : ""}><Link href={buildAuditPath({ page: pagination.page - 1, search, category, outcome, dateFrom, dateTo })}><ChevronLeft className="h-4 w-4" /> Previous</Link></Button>
            <Button asChild variant="outline" aria-disabled={!pagination.hasNextPage} className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : ""}><Link href={buildAuditPath({ page: pagination.page + 1, search, category, outcome, dateFrom, dateTo })}>Next <ChevronRight className="h-4 w-4" /></Link></Button>
          </div>
        </nav>
      )}

      {detail && <AuditDetailDialog event={detail} onClose={() => setDetail(null)} />}
    </PageContainer>
  );
}

function AuditTable({ items, onDetail }: { items: AuditEventSummary[]; onDetail: (event: AuditEventSummary) => void }) {
  return <Card className="hidden overflow-hidden lg:block"><table className="w-full text-sm"><thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Resource</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">IP</th><th className="px-4 py-3 text-right">Details</th></tr></thead><tbody className="divide-y">{items.map((event) => <tr key={event.id} className="bg-card"><td className="px-4 py-4 text-muted-foreground">{formatAuditDate(event.createdAt)}</td><td className="px-4 py-4">{auditActorLabel(event.actor)}</td><td className="px-4 py-4"><div className="font-medium">{auditActionLabel(event.action)}</div><CategoryBadge category={event.category} /></td><td className="px-4 py-4 text-muted-foreground">{auditResourceLabel(event.resourceType, event.resourceId)}</td><td className="px-4 py-4"><OutcomeBadge outcome={event.outcome} /></td><td className="px-4 py-4 text-muted-foreground">{event.ipAddress || "-"}</td><td className="px-4 py-4 text-right"><Button size="sm" variant="outline" onClick={() => onDetail(event)}><Eye className="h-4 w-4" /> View</Button></td></tr>)}</tbody></table></Card>;
}

function AuditCards({ items, onDetail }: { items: AuditEventSummary[]; onDetail: (event: AuditEventSummary) => void }) {
  return <div className="grid gap-3 lg:hidden">{items.map((event) => <Card key={event.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-medium">{auditActionLabel(event.action)}</p><p className="text-xs text-muted-foreground">{formatAuditDate(event.createdAt)}</p></div><OutcomeBadge outcome={event.outcome} /></div><div className="flex flex-wrap gap-2"><CategoryBadge category={event.category} /></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Actor</dt><dd>{auditActorLabel(event.actor)}</dd></div><div><dt className="text-muted-foreground">Resource</dt><dd>{auditResourceLabel(event.resourceType, event.resourceId)}</dd></div></dl><Button className="w-full" variant="outline" onClick={() => onDetail(event)}><Eye className="h-4 w-4" /> Details</Button></CardContent></Card>)}</div>;
}

function AuditDetailDialog({ event, onClose }: { event: AuditEventDetail; onClose: () => void }) {
  const entries = metadataEntries(event.metadata);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border bg-card p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="Audit details"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Event details</h2><Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Time" value={formatAuditDate(event.createdAt)} /><Detail label="Actor" value={auditActorLabel(event.actor)} /><Detail label="Action" value={`${auditActionLabel(event.action)} (${event.action})`} /><Detail label="Category" value={auditCategoryLabel(event.category)} /><Detail label="Outcome" value={auditOutcomeLabel(event.outcome)} /><Detail label="Resource" value={auditResourceLabel(event.resourceType, event.resourceId)} /><Detail label="IP address" value={event.ipAddress} /><Detail label="User agent" value={event.userAgent} /></dl>{entries.length > 0 && <div className="mt-5"><h3 className="mb-2 text-sm font-medium">Metadata</h3><dl className="grid gap-2 text-sm">{entries.map(([key, value]) => <Detail key={key} label={key} value={formatMetadataValue(value)} />)}</dl></div>}</div></div>;
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>;
}

function SelectFilter({ id, label, value, values, onChange }: { id: string; label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return <div className="grid gap-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">{values.map((item) => <option key={item} value={item}>{item === "all" ? "All" : auditCategoryLabel(item)}</option>)}</select></div>;
}

function DateFilter({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div className="grid gap-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><Input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function CategoryBadge({ category }: { category: string }) {
  return <Badge variant="secondary">{auditCategoryLabel(category)}</Badge>;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  return <Badge variant={outcome === "failure" ? "destructive" : "default"}>{auditOutcomeLabel(outcome)}</Badge>;
}

function formatMetadataValue(value: unknown) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object" && value !== null) return Object.entries(value).map(([key, nested]) => `${key}: ${String(nested)}`).join(", ");
  return String(value);
}

function auditErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Administrator access required.";
    if (error.status === 401) return "Sign in required.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Request failed.";
}
