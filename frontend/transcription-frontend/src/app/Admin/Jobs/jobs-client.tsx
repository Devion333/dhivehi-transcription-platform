"use client";

import { ChevronLeft, ChevronRight, Eye, RefreshCw, RotateCcw, Search, X } from "lucide-react";
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
import { getAdminJob, getAdminJobHealth, getAdminJobs, retryAdminJob } from "@/lib/api/admin-jobs";
import { ApiError } from "@/lib/api/client";
import type { AdminJobDetail, AdminJobHealthResponse, AdminJobSummary, Pagination } from "@/lib/api/types";
import { adminJobStages, adminJobStatuses, adminJobsPageSize, buildAdminJobsPath, canRetryJob, formatJobDate, jobStatusLabel, normalizeAdminJobDate, normalizeAdminJobPage, normalizeAdminJobSearch, normalizeAdminJobStage, normalizeAdminJobStatus, retryCopy, stageLabel, toJobRFC3339Date } from "@/lib/admin-jobs-utils";

type ListState = { items: AdminJobSummary[]; pagination: Pagination | null };

export function AdminJobsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = normalizeAdminJobPage(searchParams.get("page"));
  const search = normalizeAdminJobSearch(searchParams.get("search"));
  const status = normalizeAdminJobStatus(searchParams.get("status"));
  const stage = normalizeAdminJobStage(searchParams.get("stage"));
  const failedOnly = searchParams.get("failedOnly") === "true";
  const dateFrom = normalizeAdminJobDate(searchParams.get("dateFrom"));
  const dateTo = normalizeAdminJobDate(searchParams.get("dateTo"));
  const [searchDraft, setSearchDraft] = React.useState(search);
  const [data, setData] = React.useState<ListState>({ items: [], pagination: null });
  const [health, setHealth] = React.useState<AdminJobHealthResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<AdminJobDetail | null>(null);
  const [confirmRetry, setConfirmRetry] = React.useState<AdminJobSummary | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);

  React.useEffect(() => setSearchDraft(search), [search]);

  const loadKey = `${page}:${search}:${status}:${stage}:${failedOnly}:${dateFrom}:${dateTo}:${refreshToken}`;
  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      getAdminJobs({ page, pageSize: adminJobsPageSize, search, status, stage, failedOnly, dateFrom: toJobRFC3339Date(dateFrom), dateTo: toJobRFC3339Date(dateTo, true) }, controller.signal),
      getAdminJobHealth(controller.signal).catch(() => null),
    ]).then(([jobs, healthResponse]) => {
      setData({ items: jobs.items, pagination: jobs.pagination });
      setHealth(healthResponse);
    }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(jobErrorMessage(err));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [loadKey, page, search, status, stage, failedOnly, dateFrom, dateTo]);

  function navigate(next: { page?: number; search?: string; status?: typeof status; stage?: typeof stage; failedOnly?: boolean; dateFrom?: string; dateTo?: string }) {
    router.push(buildAdminJobsPath({ page, search, status, stage, failedOnly, dateFrom, dateTo, ...next }));
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ page: 1, search: searchDraft });
  }

  async function openDetail(job: AdminJobSummary) {
    setMessage(null);
    try {
      const response = await getAdminJob(job.jobId);
      setDetail(response.job);
    } catch (err) {
      setMessage(jobErrorMessage(err));
    }
  }

  async function submitRetry(job: AdminJobSummary) {
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await retryAdminJob(job.jobId, { stage: job.currentStage });
      setData((current) => ({ ...current, items: current.items.map((item) => item.jobId === response.job.jobId ? response.job : item) }));
      setConfirmRetry(null);
      setDetail(null);
      setMessage("Retry queued");
      setRefreshToken((value) => value + 1);
    } catch (err) {
      setMessage(jobErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const pagination = data.pagination;
  const totalPages = pagination?.totalPages ?? 0;
  const hasFilters = Boolean(search || status !== "all" || stage !== "all" || failedOnly || dateFrom || dateTo);

  return <PageContainer><PageHeader title="Jobs" actions={<Button variant="outline" onClick={() => setRefreshToken((value) => value + 1)}><RefreshCw className="h-4 w-4" /> Refresh</Button>} />
    <HealthSummary health={health} />
    <Card className="mb-5"><CardContent className="p-4"><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_170px_170px_130px_150px_150px_auto] lg:items-end"><form onSubmit={submitSearch} className="grid gap-2"><label htmlFor="job-search" className="text-sm font-medium">Search</label><div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="job-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="File, reference, job" className="pl-9" /></div><Button type="submit" variant="outline">Search</Button></div></form><SelectFilter id="job-status" label="Status" value={status} values={adminJobStatuses} onChange={(value) => navigate({ page: 1, status: value as typeof status })} /><SelectFilter id="job-stage" label="Stage" value={stage} values={adminJobStages} onChange={(value) => navigate({ page: 1, stage: value as typeof stage })} /><label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={failedOnly} onChange={(event) => navigate({ page: 1, failedOnly: event.target.checked })} /> Failed only</label><DateFilter id="job-from" label="From" value={dateFrom} onChange={(value) => navigate({ page: 1, dateFrom: value })} /><DateFilter id="job-to" label="To" value={dateTo} onChange={(value) => navigate({ page: 1, dateTo: value })} /><Button type="button" variant="ghost" onClick={() => router.push(pathname)} disabled={!hasFilters}><X className="h-4 w-4" /> Clear</Button></div></CardContent></Card>
    {message && <div className="mb-4 rounded-lg border bg-card px-4 py-3 text-sm">{message}</div>}
    {loading && <LoadingState label="Loading jobs" />}
    {!loading && error && <ErrorState title="Could not load jobs" description={error} onRetry={() => setRefreshToken((value) => value + 1)} />}
    {!loading && !error && data.items.length === 0 && (hasFilters ? <EmptyState title="No matching jobs" /> : <EmptyState title="No jobs" />)}
    {!loading && !error && data.items.length > 0 && <><JobTable items={data.items} onDetail={openDetail} onRetry={setConfirmRetry} /><JobCards items={data.items} onDetail={openDetail} onRetry={setConfirmRetry} /></>}
    {pagination && totalPages > 0 && !loading && !error && <nav className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Job pagination"><p className="text-sm text-muted-foreground">Page {pagination.page} of {Math.max(totalPages, 1)} - {pagination.total} total</p><div className="flex gap-2"><Button asChild variant="outline" aria-disabled={pagination.page <= 1} className={pagination.page <= 1 ? "pointer-events-none opacity-50" : ""}><Link href={buildAdminJobsPath({ page: pagination.page - 1, search, status, stage, failedOnly, dateFrom, dateTo })}><ChevronLeft className="h-4 w-4" /> Previous</Link></Button><Button asChild variant="outline" aria-disabled={!pagination.hasNextPage} className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : ""}><Link href={buildAdminJobsPath({ page: pagination.page + 1, search, status, stage, failedOnly, dateFrom, dateTo })}>Next <ChevronRight className="h-4 w-4" /></Link></Button></div></nav>}
    {detail && <JobDetailDialog job={detail} onClose={() => setDetail(null)} onRetry={(job) => setConfirmRetry(job)} />}
    {confirmRetry && <RetryDialog job={confirmRetry} submitting={submitting} onClose={() => setConfirmRetry(null)} onConfirm={() => submitRetry(confirmRetry)} />}
  </PageContainer>;
}

function HealthSummary({ health }: { health: AdminJobHealthResponse | null }) {
  if (!health) return null;
  return <div className="mb-5 grid gap-3 md:grid-cols-4"><HealthCard label="Redis" value={health.redis} /><HealthCard label="Qdrant" value={health.qdrant} /><HealthCard label="MinIO" value={health.minio} /><Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Queues</p><p className="mt-1 text-sm">{Object.entries(health.queues).map(([name, counts]) => `${stageLabel(name)} ${counts.queued}/${counts.processing}/${counts.failed}`).join(" · ")}</p></CardContent></Card></div>;
}

function HealthCard({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></CardContent></Card>;
}

function JobTable({ items, onDetail, onRetry }: JobActionsProps) {
  return <Card className="hidden overflow-hidden lg:block"><table className="w-full text-sm"><thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">File</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Updated</th><th className="px-4 py-3">Retries</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y">{items.map((job) => <tr key={job.jobId} className="bg-card"><td className="px-4 py-4 font-medium">{job.filename}</td><td className="px-4 py-4 text-muted-foreground">{job.referenceNumber}</td><td className="px-4 py-4">{stageLabel(job.currentStage)}</td><td className="px-4 py-4"><JobStatusBadge status={job.status} /></td><td className="px-4 py-4 text-muted-foreground">{formatJobDate(job.updatedAt)}</td><td className="px-4 py-4 text-muted-foreground">{job.retryable ? "Available" : "-"}</td><td className="px-4 py-4"><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => onDetail(job)}><Eye className="h-4 w-4" /> View</Button>{canRetryJob(job) && <Button size="sm" onClick={() => onRetry(job)}><RotateCcw className="h-4 w-4" /> Retry</Button>}</div></td></tr>)}</tbody></table></Card>;
}

function JobCards({ items, onDetail, onRetry }: JobActionsProps) {
  return <div className="grid gap-3 lg:hidden">{items.map((job) => <Card key={job.jobId}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{job.filename}</p><p className="text-xs text-muted-foreground">{job.referenceNumber}</p></div><JobStatusBadge status={job.status} /></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Stage</dt><dd>{stageLabel(job.currentStage)}</dd></div><div><dt className="text-muted-foreground">Updated</dt><dd>{formatJobDate(job.updatedAt)}</dd></div></dl><p className="text-sm">{job.retryable ? "Retry available" : "Retry unavailable"}</p><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => onDetail(job)}><Eye className="h-4 w-4" /> Details</Button>{canRetryJob(job) && <Button onClick={() => onRetry(job)}><RotateCcw className="h-4 w-4" /> Retry</Button>}</div></CardContent></Card>)}</div>;
}

type JobActionsProps = { items: AdminJobSummary[]; onDetail: (job: AdminJobSummary) => void; onRetry: (job: AdminJobSummary) => void };

function JobDetailDialog({ job, onClose, onRetry }: { job: AdminJobDetail; onClose: () => void; onRetry: (job: AdminJobSummary) => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border bg-card p-5 shadow-xl" role="dialog" aria-modal="true" aria-label="Job details"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Job details</h2><Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="File" value={job.filename} /><Detail label="Job ID" value={job.jobId} /><Detail label="Reference" value={job.referenceNumber} /><Detail label="Category" value={job.category} /><Detail label="Status" value={jobStatusLabel(job.status)} /><Detail label="Stage" value={stageLabel(job.currentStage)} /><Detail label="Created" value={formatJobDate(job.createdAt)} /><Detail label="Updated" value={formatJobDate(job.updatedAt)} /><Detail label="Segments" value={String(job.segmentCount)} /><Detail label="Analysis" value={job.analysisStatus} /><Detail label="Retry count" value={String(job.retryCount)} /><Detail label="Queue" value={[job.queueState.queued && "queued", job.queueState.processing && "processing", job.queueState.failed && "failed"].filter(Boolean).join(", ") || "not queued"} />{job.failureMessage && <Detail label="Failure" value={job.failureMessage} />}</dl><div className="mt-5"><h3 className="mb-2 text-sm font-medium">Pipeline</h3><div className="grid gap-2">{job.pipelineStages.map((stage) => <div key={stage.name} className="rounded-lg border p-3 text-sm"><div className="flex items-center justify-between"><span>{stageLabel(stage.name)}</span><JobStatusBadge status={stage.status} /></div>{stage.failureMessage && <p className="mt-2 text-destructive">{stage.failureMessage}</p>}</div>)}</div></div><div className="mt-5 flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/Transcripts/Details?job_id=${encodeURIComponent(job.jobId)}`}>View transcript</Link></Button>{job.status === "transcribed" || job.analysisStatus === "complete" ? <Button asChild variant="outline"><Link href={`/Transcripts/Analysis?job_id=${encodeURIComponent(job.jobId)}`}>View analysis</Link></Button> : null}{job.retryable && <Button onClick={() => onRetry(job)}><RotateCcw className="h-4 w-4" /> Retry</Button>}</div></div></div>;
}

function RetryDialog({ job, submitting, onClose, onConfirm }: { job: AdminJobSummary; submitting: boolean; onClose: () => void; onConfirm: () => void }) {
  const copy = retryCopy(job);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl" role="dialog" aria-modal="true" aria-label={copy.title}><h2 className="text-lg font-semibold">{copy.title}</h2><p className="mt-2 text-sm text-muted-foreground">{copy.body}</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button><Button onClick={onConfirm} disabled={submitting}>{submitting ? "Retrying" : "Retry"}</Button></div></div></div>;
}

function SelectFilter({ id, label, value, values, onChange }: { id: string; label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return <div className="grid gap-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">{values.map((item) => <option key={item} value={item}>{item === "all" ? "All" : jobStatusLabel(item)}</option>)}</select></div>;
}

function DateFilter({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return <div className="grid gap-2"><label htmlFor={id} className="text-sm font-medium">{label}</label><Input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function JobStatusBadge({ status }: { status: string }) {
  const failed = status.includes("failed") || status === "failed";
  return <Badge variant={failed ? "destructive" : status.includes("processing") || status.endsWith("ing") ? "default" : "secondary"}>{jobStatusLabel(status)}</Badge>;
}

function Detail({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return <div><dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="break-words">{value}</dd></div>;
}

function jobErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Administrator access required.";
    if (error.status === 401) return "Sign in required.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Request failed.";
}
