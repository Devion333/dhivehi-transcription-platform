"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: pdf-export-dialog.tsx
// Description: Transcript component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { AlignLeft, FileDown, FileText, Loader2, X } from "lucide-react";
import * as React from "react";

import { ErrorState } from "@/components/app/states";
import { AnalysisReviewStatusBadge } from "@/components/app/analysis-review-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TranscriptAnalysis, TranscriptDetail } from "@/lib/api/types";
import { generateTranscriptPdf } from "@/lib/pdfGenerator";
import type { PdfExportFormat } from "@/lib/pdf-export-types";
import { buildPdfExportPayload, hasUsableAnalysis } from "@/lib/pdf-export-utils";

type PdfExportDialogProps = {
  open: boolean;
  transcript: TranscriptDetail;
  analysis?: TranscriptAnalysis | null;
  defaultIncludeAnalysis?: boolean;
  onClose: () => void;
  onLoadAnalysis?: () => Promise<TranscriptAnalysis | null>;
};

export function PdfExportDialog({ open, transcript, analysis, defaultIncludeAnalysis = false, onClose, onLoadAnalysis }: PdfExportDialogProps) {
  const [format, setFormat] = React.useState<PdfExportFormat>("segmented");
  const [includeAnalysis, setIncludeAnalysis] = React.useState(defaultIncludeAnalysis);
  const [loadedAnalysis, setLoadedAnalysis] = React.useState<TranscriptAnalysis | null>(analysis ?? null);
  const [loadingAnalysis, setLoadingAnalysis] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFormat("segmented");
    setIncludeAnalysis(defaultIncludeAnalysis);
    setLoadedAnalysis(analysis ?? null);
    setError(null);
  }, [analysis, defaultIncludeAnalysis, open]);

  if (!open) return null;

  const usableLoadedAnalysis = hasUsableAnalysis(loadedAnalysis);
  const canAttemptAnalysis = transcript.analysisStatus === "complete" && (usableLoadedAnalysis || Boolean(onLoadAnalysis));
  const includeDisabled = !canAttemptAnalysis || loadingAnalysis || generating;

  async function handleIncludeAnalysis(next: boolean) {
    setError(null);
    setIncludeAnalysis(next);
    if (!next || usableLoadedAnalysis || !onLoadAnalysis) return;
    setLoadingAnalysis(true);
    try {
      const nextAnalysis = await onLoadAnalysis();
      setLoadedAnalysis(nextAnalysis);
      if (!hasUsableAnalysis(nextAnalysis)) {
        setIncludeAnalysis(false);
        setError("Stored analysis is not complete or has no exportable content.");
      }
    } catch (err) {
      setIncludeAnalysis(false);
      setError(err instanceof Error ? err.message : "Could not load stored analysis.");
    } finally {
      setLoadingAnalysis(false);
    }
  }

  async function handleGenerate() {
    setError(null);
    setGenerating(true);
    try {
      let exportAnalysis = loadedAnalysis;
      if (includeAnalysis && !hasUsableAnalysis(exportAnalysis) && onLoadAnalysis) {
        setLoadingAnalysis(true);
        exportAnalysis = await onLoadAnalysis();
        setLoadedAnalysis(exportAnalysis);
        setLoadingAnalysis(false);
      }
      if (includeAnalysis && !hasUsableAnalysis(exportAnalysis)) throw new Error("Complete stored analysis is required before it can be included.");
      await generateTranscriptPdf(buildPdfExportPayload(transcript, format, includeAnalysis, exportAnalysis));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "PDF generation failed.");
    } finally {
      setLoadingAnalysis(false);
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="pdf-export-title">
      <Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto shadow-xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle id="pdf-export-title" className="flex items-center gap-2"><FileDown className="h-5 w-5" /> Export PDF</CardTitle>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} disabled={generating || loadingAnalysis} aria-label="Close export dialog"><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3">
            <FormatOption
              active={format === "segmented"}
              icon={<FileText className="h-5 w-5" />}
              title="Segmented"
              description="Speaker and timestamps"
              onClick={() => setFormat("segmented")}
              disabled={generating}
            />
            <FormatOption
              active={format === "paragraph"}
              icon={<AlignLeft className="h-5 w-5" />}
              title="Paragraph"
              description="Grouped by speaker"
              onClick={() => setFormat("paragraph")}
              disabled={generating}
            />
          </div>

          <label className="flex items-start gap-3 rounded-lg border p-4 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={includeAnalysis}
              disabled={includeDisabled}
              onChange={(event) => void handleIncludeAnalysis(event.target.checked)}
            />
              <span>
                <span className="flex flex-wrap items-center gap-2 font-medium">Include analysis {loadedAnalysis?.review?.status && <AnalysisReviewStatusBadge status={loadedAnalysis.review.status} />}</span>
                {!canAttemptAnalysis && <span className="mt-1 block text-[var(--accent-warning)]">Analysis unavailable</span>}
              </span>
          </label>

          {error && <ErrorState title="PDF export failed" description={error} />}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={generating || loadingAnalysis}>Cancel</Button>
            <Button type="button" onClick={handleGenerate} disabled={generating || loadingAnalysis || transcript.segments.length === 0}>
              {generating || loadingAnalysis ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              {loadingAnalysis ? "Loading analysis..." : generating ? "Generating..." : "Generate PDF"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FormatOption({ active, icon, title, description, onClick, disabled }: { active: boolean; icon: React.ReactNode; title: string; description: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex gap-3 rounded-lg border p-4 text-left transition ${active ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span><span className="block font-medium">{title}</span><span className="mt-1 block text-sm text-muted-foreground">{description}</span></span>
    </button>
  );
}
