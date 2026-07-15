"use client";

import { ArrowLeft, FileDown, FileText, Loader2, RefreshCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { PdfExportDialog } from "@/components/transcripts/pdf-export-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { analyseTranscript, getTranscript, getTranscriptAnalysis } from "@/lib/api/transcripts";
import type { TranscriptAnalysis, TranscriptDetail } from "@/lib/api/types";
import { analysisTextProps, canRunAnalysis, hasAnalysisContent, normalizeEntities } from "@/lib/transcript-analysis-utils";
import { formatDetailDate, safeValue } from "@/lib/transcript-details-utils";
import { hasUsableAnalysis } from "@/lib/pdf-export-utils";

export function TranscriptAnalysisClient() {
  const searchParams = useSearchParams();
  const jobId = (searchParams.get("job_id") ?? "").trim();
  const [detail, setDetail] = React.useState<TranscriptDetail | null>(null);
  const [analysis, setAnalysis] = React.useState<TranscriptAnalysis | null>(null);
  const [loading, setLoading] = React.useState(Boolean(jobId));
  const [error, setError] = React.useState<string | null>(null);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);
  const [retryToken, setRetryToken] = React.useState(0);
  const [exportOpen, setExportOpen] = React.useState(false);

  React.useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([getTranscript(jobId, controller.signal), getTranscriptAnalysis(jobId, controller.signal)])
      .then(([nextDetail, nextAnalysis]) => {
        setDetail(nextDetail);
        setAnalysis(nextAnalysis);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load transcript analysis");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [jobId, retryToken]);

  async function runAnalysis() {
    if (!jobId || running) return;
    setRunning(true);
    setRunError(null);
    try {
      const response = await analyseTranscript(jobId);
      setAnalysis(response.analysis);
      const refreshed = await getTranscript(jobId).catch(() => null);
      if (refreshed) setDetail(refreshed);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Failed to run analysis");
    } finally {
      setRunning(false);
    }
  }

  if (!jobId) {
    return (
      <PageContainer>
        <PageHeader title="Analysis" actions={<BackToList />} />
        <EmptyState title="Invalid link" description="Open analysis from a transcript." />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Analysis" actions={<BackToList />} />
        <LoadingState label="Loading analysis" />
      </PageContainer>
    );
  }

  if (error || !detail || !analysis) {
    const notFound = error?.toLowerCase().includes("not found");
    return (
      <PageContainer>
        <PageHeader title="Analysis" actions={<BackToList />} />
        <ErrorState title={notFound ? "Transcript not found" : "Could not load analysis"} description={error ?? "Analysis data was unavailable."} onRetry={() => setRetryToken((value) => value + 1)} />
      </PageContainer>
    );
  }

  const ready = canRunAnalysis(detail);
  const hasContent = hasAnalysisContent(analysis);
  const entities = normalizeEntities(analysis.entities);
  const defaultIncludeAnalysis = hasUsableAnalysis(analysis);

  return (
    <PageContainer>
      <PageHeader
        title="Analysis"
        description={detail.filename}
        actions={
          <>
            <BackToList />
            <Button asChild variant="outline"><Link href={`/Transcripts/Details?job_id=${encodeURIComponent(detail.jobId)}`}><FileText className="h-4 w-4" /> Transcript details</Link></Button>
            <Button type="button" variant="outline" onClick={() => setExportOpen(true)} disabled={detail.segments.length === 0}><FileDown className="h-4 w-4" /> Export PDF</Button>
            <Button type="button" variant="outline" onClick={() => setRetryToken((value) => value + 1)} disabled={running}><RefreshCcw className="h-4 w-4" /> Refresh</Button>
            <Button type="button" onClick={runAnalysis} disabled={!ready || running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {analysis.status === "complete" ? "Run again" : "Analyse"}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Transcript</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <MetaRow label="Job ID" value={detail.jobId} />
              <MetaRow label="Reference" value={safeValue(detail.referenceNumber, "No reference")} />
              <MetaRow label="Category" value={safeValue(detail.category, "Uncategorized")} />
              <MetaRow label="Created" value={formatDetailDate(detail.createdAt)} />
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Transcript status</span><StatusBadge status={detail.status} /></div>
              <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Analysis status</span><StatusBadge status={analysis.status} /></div>
            </CardContent>
          </Card>

          {!ready && (
            <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/40">
              <CardContent className="p-4 text-sm text-amber-800 dark:text-amber-200">
                Transcript status: {detail.status.replace(/_/g, " ")}.
              </CardContent>
            </Card>
          )}

          {runError && <ErrorState title="Analysis failed" description={runError} />}
        </aside>

        <section className="space-y-4">
          {!hasContent ? (
            <EmptyState title="Analysis has not been run" />
          ) : (
            <>
              <AnalysisTextCard title="Summary" value={analysis.summary} />
              <AnalysisTextCard title="English Translation" value={analysis.englishTranslation} />
              <Card>
                <CardHeader><CardTitle>Classification</CardTitle></CardHeader>
                <CardContent>{analysis.classification ? <Badge variant="secondary" className="text-sm">{analysis.classification}</Badge> : <MutedText />}</CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Keywords</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {analysis.keywords.length > 0 ? analysis.keywords.map((keyword) => <Badge key={keyword} variant="outline">{keyword}</Badge>) : <MutedText />}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Entities</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {entities.length > 0 ? entities.map((group) => (
                    <div key={group.label} className="space-y-2">
                      <h3 className="text-sm font-medium text-muted-foreground">{group.label}</h3>
                      <div className="flex flex-wrap gap-2">{group.values.map((value) => <Badge key={`${group.label}-${value}`} variant="outline">{value}</Badge>)}</div>
                    </div>
                  )) : <MutedText />}
                </CardContent>
              </Card>
            </>
          )}
        </section>
      </div>
      <PdfExportDialog
        open={exportOpen}
        transcript={detail}
        analysis={analysis}
        defaultIncludeAnalysis={defaultIncludeAnalysis}
        onClose={() => setExportOpen(false)}
      />
    </PageContainer>
  );
}

function BackToList() {
  return <Button asChild variant="outline"><Link href="/Transcripts/List"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="break-all text-right font-medium">{value}</span></div>;
}

function AnalysisTextCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{value ? <p {...analysisTextProps(value)}>{value}</p> : <MutedText />}</CardContent>
    </Card>
  );
}

function MutedText() {
  return <p className="text-sm text-muted-foreground">Not available</p>;
}
