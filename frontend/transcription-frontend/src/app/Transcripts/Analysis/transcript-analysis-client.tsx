"use client";

import { ArrowLeft, FileDown, FileText, Languages, ListChecks, Loader2, RefreshCcw, Sparkles, Tags } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { AnalysisReviewStatusBadge } from "@/components/app/analysis-review-status-badge";
import { StatusBadge } from "@/components/app/status-badge";
import { PdfExportDialog } from "@/components/transcripts/pdf-export-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { analyseTranscript, getTranscript, getTranscriptAnalysis } from "@/lib/api/transcripts";
import type { TranscriptAnalysis, TranscriptDetail } from "@/lib/api/types";
import { sectionToneClasses } from "@/lib/section-styles";
import { analysisTextProps, canRunAnalysis, hasAnalysisContent, normalizeEntities } from "@/lib/transcript-analysis-utils";
import { safeValue } from "@/lib/transcript-details-utils";
import { hasUsableAnalysis } from "@/lib/pdf-export-utils";
import { cn } from "@/lib/utils";

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
        <div className="mb-4"><BackToTranscript jobId="" /></div>
        <PageHeader title="Analysis" />
        <EmptyState title="Invalid link" description="Open analysis from a transcript." />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="mb-4"><BackToTranscript jobId={jobId} /></div>
        <PageHeader title="Analysis" />
        <LoadingState label="Loading analysis" />
      </PageContainer>
    );
  }

  if (error || !detail || !analysis) {
    const notFound = error?.toLowerCase().includes("not found");
    return (
      <PageContainer>
        <div className="mb-4"><BackToTranscript jobId={jobId} /></div>
        <PageHeader title="Analysis" />
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
      <div className="mb-4"><BackToTranscript jobId={jobId} /></div>
      <PageHeader
        title="Analysis"
        actions={
          <>
            <Button asChild variant="outline"><Link href={transcriptReviewHref(detail.jobId)}><FileText className="h-4 w-4" /> View transcript review</Link></Button>
            <Button type="button" variant="outline" onClick={() => setExportOpen(true)} disabled={detail.segments.length === 0}><FileDown className="h-4 w-4" /> Export PDF</Button>
            <Button type="button" variant="outline" onClick={() => setRetryToken((value) => value + 1)} disabled={running}><RefreshCcw className="h-4 w-4" /> Refresh</Button>
            <Button type="button" onClick={runAnalysis} disabled={!ready || running} className="bg-[var(--accent-analysis)] text-background hover:bg-[var(--accent-analysis)] hover:opacity-90">
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {analysis.status === "complete" ? "Run again" : "Analyse"}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="break-words font-medium text-foreground">{detail.filename}</span>
        <span>{safeValue(detail.referenceNumber, "No reference")}</span>
        <StatusBadge status={analysis.status} />
        <span>Transcript review: <AnalysisReviewStatusBadge status={analysis.review?.status ?? detail.analysisReviewStatus} /></span>
      </div>

      {!ready && <Card className={cn("mb-4", sectionToneClasses.warning.panel)}><CardContent className="p-4 text-sm">Transcript status: {detail.status.replace(/_/g, " ")}.</CardContent></Card>}
      {runError && <div className="mb-4"><ErrorState title="Analysis failed" description={runError} /></div>}

      {!hasContent ? (
        <EmptyState title="Analysis has not been run" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AnalysisTextPanel className="lg:col-span-2" title="Summary" icon={Sparkles} value={analysis.summary} prominent />
          <ClassificationPanel value={analysis.classification} />
          <KeywordsPanel keywords={analysis.keywords} />
          {entities.length > 0 && <EntitiesPanel entities={entities} />}
          {analysis.englishTranslation.trim() && <AnalysisTextPanel className="lg:col-span-2" title="English translation" icon={Languages} value={analysis.englishTranslation} />}
        </div>
      )}
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

function BackToTranscript({ jobId }: { jobId: string }) {
  const href = jobId ? `/Transcripts/Details?job_id=${encodeURIComponent(jobId)}` : "/Transcripts";
  return <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2"><Link href={href}><ArrowLeft className="h-4 w-4" /> Back</Link></Button>;
}

function transcriptReviewHref(jobId: string) {
  return `/Transcripts/Details?job_id=${encodeURIComponent(jobId)}&review=open`;
}

function AnalysisTextPanel({ title, icon: Icon, value, className, prominent }: { title: string; icon: typeof Sparkles; value: string; className?: string; prominent?: boolean }) {
  return <section className={cn("rounded-xl border bg-card p-4", className)}><div className="mb-3 flex items-center gap-2"><Icon className={cn("h-4 w-4", sectionToneClasses.analysis.text)} /><h2 className={cn("font-medium", prominent && "text-lg")}>{title}</h2></div>{value ? <p {...analysisTextProps(value)}>{value}</p> : <MutedText />}</section>;
}

function ClassificationPanel({ value }: { value: string }) {
  return <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center gap-2"><ListChecks className={cn("h-4 w-4", sectionToneClasses.analysis.text)} /><h2 className="font-medium">Classification</h2></div>{value ? <Badge variant="secondary" className="text-sm">{value}</Badge> : <MutedText />}</section>;
}

function KeywordsPanel({ keywords }: { keywords: string[] }) {
  return <section className="rounded-xl border bg-card p-4"><div className="mb-3 flex items-center gap-2"><Tags className={cn("h-4 w-4", sectionToneClasses.analysis.text)} /><h2 className="font-medium">Keywords</h2></div>{keywords.length > 0 ? <div className="flex flex-wrap gap-2">{keywords.map((keyword) => <Badge key={keyword} variant="outline">{keyword}</Badge>)}</div> : <MutedText />}</section>;
}

function EntitiesPanel({ entities }: { entities: ReturnType<typeof normalizeEntities> }) {
  return <section className="rounded-xl border bg-card p-4 lg:col-span-2"><div className="mb-3 flex items-center gap-2"><FileText className={cn("h-4 w-4", sectionToneClasses.analysis.text)} /><h2 className="font-medium">Entities</h2></div><dl className="grid gap-3 text-sm sm:grid-cols-2">{entities.map((group) => <div key={group.label} className="grid gap-1 rounded-lg bg-muted/30 p-3"><dt className="font-medium text-muted-foreground">{group.label}</dt><dd className="break-words">{group.values.join(", ")}</dd></div>)}</dl></section>;
}

function MutedText() {
  return <p className="text-sm text-muted-foreground">Not available</p>;
}
