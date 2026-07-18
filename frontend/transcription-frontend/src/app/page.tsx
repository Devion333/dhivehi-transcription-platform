"use client";

import { Activity, BriefcaseBusiness, CheckCircle2, Clock, FileText, Search, UploadCloud, Users } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAdminJobHealth } from "@/lib/api/admin-jobs";
import { apiClient } from "@/lib/api/client";
import type { AdminJobHealthResponse, StatsResponse, TranscriptSummary } from "@/lib/api/types";
import type { SectionTone } from "@/lib/section-styles";
import { sectionToneClasses } from "@/lib/section-styles";
import { fallbackText, formatTranscriptDate, segmentCountLabel, transcriptDetailPath } from "@/lib/transcript-list-utils";
import { cn } from "@/lib/utils";

const emptyStats: StatsResponse = {
  totalTranscripts: 0,
  uploaded: 0,
  diarized: 0,
  transcribed: 0,
  failed: 0,
  analysisComplete: 0,
  totalSegments: 0,
};

type DashboardState = {
  stats: StatsResponse;
  recent: TranscriptSummary[];
  health: AdminJobHealthResponse | null;
};

export default function DashboardPage() {
  const auth = useAuth();
  const [data, setData] = React.useState<DashboardState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const isAdmin = auth.user?.role === "admin";

  const loadDashboard = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [stats, recent, health] = await Promise.all([
        apiClient.getStats(signal),
        apiClient.listTranscripts(1, 5, signal),
        isAdmin ? getAdminJobHealth(signal).catch(() => null) : Promise.resolve(null),
      ]);
      setData({ stats, recent: recent.items, health });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setData({ stats: emptyStats, recent: [], health: null });
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [isAdmin]);

  React.useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard]);

  return (
    <PageContainer>
      <PageHeader title="Dashboard" description="A quick view of transcript activity and operational status." />

      {loading && <LoadingState label="Loading dashboard" />}
      {!loading && error && <ErrorState description={error} onRetry={() => void loadDashboard()} />}
      {!loading && !error && data && (
        <div className="space-y-5">
          <MetricGrid stats={data.stats} />
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <RecentTranscripts items={data.recent} />
            <div className="grid content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
              <ProcessingOverview stats={data.stats} />
              <QuickActions isAdmin={isAdmin} />
              {isAdmin ? <WorkerStatus health={data.health} /> : <UserSummary stats={data.stats} />}
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function MetricGrid({ stats }: { stats: StatsResponse }) {
  const processing = Math.max(0, stats.uploaded + stats.diarized - stats.transcribed);
  const completed = stats.transcribed;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total transcripts" value={stats.totalTranscripts} detail={`${stats.totalSegments.toLocaleString()} segments`} icon={FileText} tone="transcript" />
      <MetricCard label="Processing" value={processing} detail="Uploaded or separated" icon={Clock} tone="warning" />
      <MetricCard label="Completed" value={completed} detail={`${stats.analysisComplete.toLocaleString()} analysed`} icon={CheckCircle2} tone="success" />
      <MetricCard label="Failed" value={stats.failed} detail="Needs review" icon={Activity} tone="danger" />
    </div>
  );
}

function MetricCard({ label, value, detail, icon: Icon, tone }: { label: string; value: number; detail: string; icon: React.ElementType; tone: SectionTone }) {
  const classes = sectionToneClasses[tone];
  return (
    <Card className={cn("border-l-4", classes.border)}>
      <CardContent className="flex min-h-[108px] items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={cn("mt-1 text-2xl font-semibold tracking-tight", classes.text)}>{value.toLocaleString()}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-md", classes.icon)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function RecentTranscripts({ items }: { items: TranscriptSummary[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-center justify-between gap-3 border-b py-4">
        <div>
          <SectionHeading title="Recent transcripts" description="Latest files and processing status." icon={FileText} tone="transcript" />
        </div>
        <Button asChild size="sm" variant="outline"><Link href="/Transcripts">View all</Link></Button>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No transcripts yet. Upload media to start processing.</div>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <Link key={item.jobId} href={transcriptDetailPath(item.jobId)} className="grid min-w-0 gap-3 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={item.filename}>{item.filename}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground" title={fallbackText(item.referenceNumber, "No reference")}>{fallbackText(item.referenceNumber, "No reference")} · {formatTranscriptDate(item.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <StatusBadge status={item.status} />
                  <span className="text-xs text-muted-foreground">{segmentCountLabel(item.segmentCount)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProcessingOverview({ stats }: { stats: StatsResponse }) {
  const rows = [
    ["Uploaded", stats.uploaded],
    ["Speaker separated", stats.diarized],
    ["Transcribed", stats.transcribed],
    ["Analysed", stats.analysisComplete],
    ["Failed", stats.failed],
  ].filter(([, value]) => Number(value) > 0 || stats.totalTranscripts === 0) as [string, number][];

  return (
    <Card>
      <CardHeader className="pb-3"><SectionHeading title="Processing overview" icon={Clock} tone="warning" /></CardHeader>
      <CardContent className="space-y-2">
        {rows.map(([label, value]) => <CountRow key={label} label={label} value={value} />)}
      </CardContent>
    </Card>
  );
}

function QuickActions({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3"><SectionHeading title="Quick actions" icon={UploadCloud} tone="primary" /></CardHeader>
      <CardContent className="grid gap-2">
        <ActionLink href="/Upload" label="Upload media" icon={UploadCloud} />
        <ActionLink href="/Transcripts" label="Browse transcripts" icon={FileText} />
        <ActionLink href="/Search" label="Search transcripts" icon={Search} />
        {isAdmin && <ActionLink href="/Admin/Jobs" label="View jobs" icon={BriefcaseBusiness} />}
        {isAdmin && <ActionLink href="/Admin/Users" label="Manage users" icon={Users} />}
      </CardContent>
    </Card>
  );
}

function WorkerStatus({ health }: { health: AdminJobHealthResponse | null }) {
  const workers = ["conversion", "diarization", "transcription", "analysis"];
  return (
    <Card>
      <CardHeader className="pb-3"><SectionHeading title="Worker status" icon={BriefcaseBusiness} tone="admin" /></CardHeader>
      <CardContent className="space-y-2">
        {!health ? <p className="text-sm text-muted-foreground">Worker status unavailable.</p> : workers.map((name) => <CountRow key={name} label={workerLabel(name)} value={workerStatusLabel(health.workers[name]?.status)} />)}
      </CardContent>
    </Card>
  );
}

function UserSummary({ stats }: { stats: StatsResponse }) {
  return (
    <Card>
      <CardHeader className="pb-3"><SectionHeading title="Workspace summary" icon={Users} tone="transcript" /></CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>{stats.totalTranscripts.toLocaleString()} transcripts are available in this workspace.</p>
        <p>Use search to find transcript text, references, or categories.</p>
      </CardContent>
    </Card>
  );
}

function CountRow({ label, value }: { label: string; value: number | string }) {
  return <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"><span className="truncate text-muted-foreground">{label}</span><Badge variant="secondary" className={cn(typeof value === "string" && value === "Unavailable" && "text-destructive")}>{typeof value === "number" ? value.toLocaleString() : value}</Badge></div>;
}

function ActionLink({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  return <Button asChild variant="outline" className="justify-start gap-2"><Link href={href}><Icon className="h-4 w-4" />{label}</Link></Button>;
}

function workerLabel(value: string) {
  if (value === "diarization") return "Diarization";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function workerStatusLabel(status: string | undefined) {
  if (status === "available") return "Available";
  if (status === "unavailable") return "Unavailable";
  return "Unknown";
}
