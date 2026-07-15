"use client";

import { Activity, BarChart3, CheckCircle2, Clock, FileText, Layers3, UploadCloud } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/lib/api/client";
import type { StatsResponse } from "@/lib/api/types";

const emptyStats: StatsResponse = {
  totalTranscripts: 0,
  uploaded: 0,
  diarized: 0,
  transcribed: 0,
  failed: 0,
  analysisComplete: 0,
  totalSegments: 0,
};

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = React.useState<StatsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadStats = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await apiClient.getStats());
    } catch (err) {
      setStats(emptyStats);
      setError(err instanceof Error ? err.message : "Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadStats();
  }, [loadStats]);

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <Button asChild variant="outline"><Link href="/Transcripts/List">View transcripts</Link></Button>
            <Button asChild><Link href="/Transcripts">Upload</Link></Button>
          </>
        }
      />

      {loading && <LoadingState label="Loading stats" />}
      {!loading && error && <ErrorState description={error} onRetry={loadStats} />}
      {!loading && !error && stats && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total transcripts" value={stats.totalTranscripts} icon={FileText} />
          <StatCard label="Uploaded" value={stats.uploaded} icon={UploadCloud} />
          <StatCard label="Diarized" value={stats.diarized} icon={Layers3} />
          <StatCard label="Transcribed" value={stats.transcribed} icon={CheckCircle2} />
          <StatCard label="Failed" value={stats.failed} icon={Activity} />
          <StatCard label="Analysis complete" value={stats.analysisComplete} icon={BarChart3} />
          <StatCard label="Segments" value={stats.totalSegments} icon={Clock} />
        </div>
      )}
    </PageContainer>
  );
}
