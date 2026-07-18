"use client";

import { HeartPulse, RefreshCcw, ServerCog } from "lucide-react";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { getAdminJobHealth } from "@/lib/api/admin-jobs";
import { getHealth } from "@/lib/api/health";
import type { AdminJobHealthResponse, HealthResponse } from "@/lib/api/types";

export function SystemHealthClient() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [jobs, setJobs] = React.useState<AdminJobHealthResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([getHealth(controller.signal), getAdminJobHealth(controller.signal)])
      .then(([nextHealth, nextJobs]) => { setHealth(nextHealth); setJobs(nextJobs); })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "System health is unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);

  const services = [
    { name: "Backend", status: health?.status ?? jobs?.backend ?? "unknown" },
    { name: "PostgreSQL", status: health?.dependencies.database ?? "unknown" },
    { name: "Redis", status: health?.dependencies.redis ?? jobs?.redis ?? "unknown" },
    { name: "Qdrant", status: health?.dependencies.qdrant ?? jobs?.qdrant ?? "unknown" },
    { name: "MinIO", status: health?.dependencies.minio ?? jobs?.minio ?? "unknown" },
  ];
  const stages = ["conversion", "diarization", "transcription", "analysis"];

  return (
    <PageContainer>
      <PageHeader title="System Health" actions={<Button variant="outline" onClick={() => setReload((value) => value + 1)}><RefreshCcw className="h-4 w-4" /> Refresh</Button>} />
      {loading && <LoadingState label="Loading system health" />}
      {error && <ErrorState title="Could not load system health" description={error} onRetry={() => setReload((value) => value + 1)} />}
      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card><CardHeader><SectionHeading title="Core Services" icon={HeartPulse} tone="admin" /></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{services.map((item) => <HealthRow key={item.name} name={item.name} status={item.status} />)}</CardContent></Card>
          <Card><CardHeader><SectionHeading title="Workers" icon={ServerCog} tone="admin" /></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2">{stages.map((stage) => <HealthRow key={stage} name={stage} status={jobs?.workers?.[stage]?.status ?? "unknown"} detail={`${jobs?.workers?.[stage]?.instances ?? 0} active`} />)}</CardContent></Card>
        </div>
      )}
    </PageContainer>
  );
}

function HealthRow({ name, status, detail }: { name: string; status: string; detail?: string }) {
  const normalized = status === "ok" || status === "available" ? "complete" : status === "degraded" || status === "unknown" ? "processing" : "failed";
  return <div className="rounded-lg border p-3"><div className="flex items-center justify-between gap-3"><span className="font-medium capitalize">{name}</span><StatusBadge status={normalized} /></div>{detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}</div>;
}
