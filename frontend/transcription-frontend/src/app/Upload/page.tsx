"use client";

import { AlertCircle, CheckCircle2, FileAudio, FileVideo, Loader2, RefreshCcw, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useMaintenanceAccess } from "@/hooks/use-maintenance-access";
import { ApiError } from "@/lib/api/client";
import { useTranscriptStatusPolling } from "@/hooks/use-transcript-status-polling";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadTranscript } from "@/lib/api/uploads";
import type { TranscriptStatusResponse, UploadResult } from "@/lib/api/types";
import {
  acceptedFileInputValue,
  audioExtensions,
  categoryOptions,
  formatFileSize,
  notesMaxLength,
  referenceNumberMaxLength,
  validateUploadFile,
  validateUploadMetadata,
  videoExtensions,
} from "@/lib/upload-validation";
import { sectionToneClasses } from "@/lib/section-styles";
import { cn } from "@/lib/utils";

type UploadState = "idle" | "validating" | "uploading" | "accepted" | "error";

export default function UploadTranscriptPage() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const referenceRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [dragActive, setDragActive] = React.useState(false);
  const [category, setCategory] = React.useState("");
  const [referenceNumber, setReferenceNumber] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [requestedSpeakers, setRequestedSpeakers] = React.useState(2);
  const [state, setState] = React.useState<UploadState>("idle");
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<UploadResult | null>(null);
  const [processingStatus, setProcessingStatus] = React.useState<TranscriptStatusResponse | null>(null);
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const [progressComputable, setProgressComputable] = React.useState(true);
  const maintenance = useMaintenanceAccess();
  const effectiveSettings = maintenance.settings;
  const maintenanceUploadDisabled = Boolean(effectiveSettings?.maintenanceMode && !maintenance.isAdmin);
  const uploadsDisabled = effectiveSettings?.uploadsEnabled === false;
  const uploadDisabledReason = maintenanceUploadDisabled && uploadsDisabled
    ? "Uploads are currently disabled by an administrator and temporarily disabled during maintenance mode."
    : maintenanceUploadDisabled
      ? "Uploads are temporarily disabled during maintenance mode."
      : uploadsDisabled
        ? "Uploads are currently disabled by an administrator."
        : "";

  const fileValidation = React.useMemo(() => {
    const result = validateUploadFile(file);
    if (!file || !effectiveSettings) return result;
    const extension = result.extension.replace(/^\./, "");
    const maxBytes = effectiveSettings.maximumUploadSizeMb * 1024 * 1024;
    const errors = [...result.errors];
    if (!effectiveSettings.allowedUploadFormats.includes(extension)) errors.push(`This file type is disabled. Allowed formats: ${effectiveSettings.allowedUploadFormats.join(", ")}.`);
    if (file.size > maxBytes) errors.push(`File exceeds the configured ${effectiveSettings.maximumUploadSizeMb} MB upload limit.`);
    return { ...result, valid: errors.length === 0, errors };
  }, [effectiveSettings, file]);
  const metadataErrors = React.useMemo(
    () => {
      const errors = validateUploadMetadata({ referenceNumber, notes, requestedSpeakers });
      if (!referenceNumber.trim()) errors.referenceNumber = "Reference number is required.";
      if (effectiveSettings?.requireCategory && !category.trim()) errors.category = "Category is required.";
      return errors;
    },
    [category, effectiveSettings?.requireCategory, notes, referenceNumber, requestedSpeakers],
  );
  const hasMetadataErrors = Object.keys(metadataErrors).length > 0;
  const canSubmit = !maintenanceUploadDisabled && Boolean(effectiveSettings?.uploadsEnabled) && fileValidation.valid && !hasMetadataErrors && state !== "uploading";
  const { polling } = useTranscriptStatusPolling({
    jobId: result?.job.jobId ?? "",
    enabled: state === "accepted" && Boolean(result),
    initialTerminal: processingStatus?.isTerminal ?? false,
    onStatus: setProcessingStatus,
  });

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function chooseFile(selected: File | undefined) {
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setProcessingStatus(null);
    setError(null);
    setUploadProgress(null);
    setProgressComputable(true);
    setState("idle");
  }

  function clearFile() {
    setFile(null);
    setResult(null);
    setProcessingStatus(null);
    setError(null);
    setUploadProgress(null);
    setProgressComputable(true);
    setState("idle");
    if (inputRef.current) inputRef.current.value = "";
  }

  function resetForm() {
    clearFile();
    setCategory("");
    setReferenceNumber("");
    setNotes("");
    setRequestedSpeakers(2);
    setSubmitAttempted(false);
  }

  function handleDrag(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (state === "uploading" || maintenanceUploadDisabled || uploadsDisabled) return;
    if (event.type === "dragenter" || event.type === "dragover") setDragActive(true);
    if (event.type === "dragleave") setDragActive(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (state !== "uploading" && !maintenanceUploadDisabled && !uploadsDisabled) chooseFile(event.dataTransfer.files?.[0]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setState("validating");
    setError(null);

    if (maintenanceUploadDisabled || !effectiveSettings?.uploadsEnabled) {
      setState("error");
      setError(uploadDisabledReason || "Uploads are currently disabled.");
      return;
    }

    if (!file || !fileValidation.valid || hasMetadataErrors) {
      setState("error");
      setError("Review the highlighted fields before uploading.");
      if (metadataErrors.referenceNumber) referenceRef.current?.focus();
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setUploadProgress(0);
    setProgressComputable(true);
    setState("uploading");

    try {
      const uploadResult = await uploadTranscript({
        file,
        metadata: { category, referenceNumber, notes, requestedSpeakers },
        signal: controller.signal,
        onProgress: (percentage) => {
          if (percentage === null) {
            setProgressComputable(false);
            return;
          }
          setProgressComputable(true);
          setUploadProgress(percentage);
        },
      });
      setResult(uploadResult);
      setProcessingStatus({
        jobId: uploadResult.job.jobId,
        status: uploadResult.job.status,
        stage: uploadResult.job.status,
        isTerminal: false,
        updatedAt: uploadResult.job.createdAt,
        failureCode: null,
        failureMessage: null,
      });
      setState("accepted");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Upload was cancelled. The selected file is still ready to retry.");
      } else {
        setError(err instanceof ApiError && err.code === "maintenance_mode" ? "Changes are temporarily disabled during maintenance mode." : err instanceof Error ? err.message : "Upload failed. Please try again.");
      }
      setState("error");
      setUploadProgress(null);
      setProgressComputable(true);
    } finally {
      abortRef.current = null;
    }
  }

  function cancelUpload() {
    abortRef.current?.abort();
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-4xl">
        <PageHeader
          title="Upload transcript"
          actions={<Button asChild variant="outline"><Link href="/Transcripts">Transcripts</Link></Button>}
        />
        {uploadDisabledReason && <div className="mb-4 rounded-lg border border-[var(--accent-warning-border)] bg-[var(--accent-warning-bg)] px-4 py-3 text-sm text-[var(--accent-warning)]">{uploadDisabledReason}</div>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload media</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  "rounded-xl border border-dashed bg-muted/30 p-6 transition",
                  dragActive && "border-primary bg-primary/5",
                  state === "uploading" && "pointer-events-none opacity-70",
                )}
              >
                <input
                  ref={inputRef}
                  id="media-file"
                  type="file"
                  accept={effectiveSettings?.allowedUploadFormats.map((format) => `.${format}`).join(",") ?? acceptedFileInputValue()}
                  className="sr-only"
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                  disabled={state === "uploading" || maintenanceUploadDisabled || uploadsDisabled}
                />
                <div className="flex flex-col items-center justify-center text-center">
                  <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
                  <Label htmlFor="media-file" className="cursor-pointer text-base font-semibold text-foreground">
                    Drop an audio or video file here, or browse.
                  </Label>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {effectiveSettings ? `Allowed formats: ${effectiveSettings.allowedUploadFormats.join(", ")} · Max ${effectiveSettings.maximumUploadSizeMb} MB` : `Audio: ${audioExtensions.join(", ")} · Video: ${videoExtensions.join(", ")}`}
                  </p>
                  {uploadDisabledReason && <p className="mt-2 text-sm text-destructive">{uploadDisabledReason}</p>}
                  <Button className="mt-4" type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={state === "uploading" || maintenanceUploadDisabled || uploadsDisabled}>
                    Browse files
                  </Button>
                </div>
              </div>

              {file && (
                <div className="rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                        {fileValidation.mediaKind === "video" ? <FileVideo className="h-5 w-5" /> : <FileAudio className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {file.type || "Unknown MIME type"} - {formatFileSize(file.size)} - {fileValidation.mediaKind === "unknown" ? "media" : fileValidation.mediaKind}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {fileValidation.valid ? (
                        <span className="inline-flex items-center gap-1 text-sm text-[var(--accent-success)]"><CheckCircle2 className="h-4 w-4" /> Valid file</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm text-destructive"><AlertCircle className="h-4 w-4" /> Needs attention</span>
                      )}
                      <Button type="button" variant="ghost" size="icon" onClick={clearFile} disabled={state === "uploading"}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {fileValidation.errors.length > 0 && <ValidationList items={fileValidation.errors} tone="error" />}
                  {fileValidation.warnings.length > 0 && <ValidationList items={fileValidation.warnings} tone="warning" />}
                </div>
              )}
              {submitAttempted && !file && <ValidationList items={fileValidation.errors} tone="error" />}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="referenceNumber" className="block leading-5">Reference number <span className="text-destructive">*</span></Label>
                  <Input
                    id="referenceNumber"
                    ref={referenceRef}
                    value={referenceNumber}
                    maxLength={referenceNumberMaxLength}
                    onChange={(event) => setReferenceNumber(event.target.value)}
                    disabled={state === "uploading" || maintenanceUploadDisabled || uploadsDisabled}
                    placeholder="Enter reference number"
                    className="h-10"
                  />
                  <FieldHint current={referenceNumber.length} max={referenceNumberMaxLength} error={metadataErrors.referenceNumber} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category" className="block leading-5">Category {!effectiveSettings?.requireCategory && <span className="text-muted-foreground">(optional)</span>}</Label>
                  <select
                    id="category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    disabled={state === "uploading" || maintenanceUploadDisabled || uploadsDisabled}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {metadataErrors.category ? <p className="text-xs text-destructive">{metadataErrors.category}</p> : <div className="h-4" aria-hidden="true" />}
                </div>

              <div className="grid gap-2">
                <Label htmlFor="requestedSpeakers">Expected speakers <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="requestedSpeakers"
                  type="number"
                  min={1}
                  max={10}
                  value={requestedSpeakers}
                  onChange={(event) => setRequestedSpeakers(Number(event.target.value))}
                  disabled={state === "uploading" || maintenanceUploadDisabled || uploadsDisabled}
                />
                {metadataErrors.requestedSpeakers && <p className="text-xs text-destructive">{metadataErrors.requestedSpeakers}</p>}
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="notes">Notes <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="notes"
                  value={notes}
                  maxLength={notesMaxLength}
                  onChange={(event) => setNotes(event.target.value)}
                  disabled={state === "uploading" || maintenanceUploadDisabled || uploadsDisabled}
                  placeholder="Optional reviewer notes"
                  rows={5}
                />
                <FieldHint current={notes.length} max={notesMaxLength} error={metadataErrors.notes} />
              </div>
              </div>

              {state === "uploading" && <UploadProgress progress={uploadProgress} computable={progressComputable} />}
              {state === "accepted" && result && <SuccessPanel result={result} status={processingStatus} polling={polling} onUploadAnother={resetForm} />}
              {state === "error" && error && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                {state === "uploading" ? (
                  <Button type="button" variant="outline" onClick={cancelUpload}>Cancel upload</Button>
                ) : (
                  <Button type="button" variant="outline" onClick={resetForm}><RefreshCcw className="h-4 w-4" /> Reset</Button>
                )}
                <Button type="submit" disabled={!canSubmit}>
                  {state === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                  {state === "uploading" ? "Uploading" : "Upload"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </PageContainer>
  );

  function SuccessPanel({ result, status, polling, onUploadAnother }: { result: UploadResult; status: TranscriptStatusResponse | null; polling: boolean; onUploadAnother: () => void }) {
    const currentStatus = status?.status ?? result.job.status;
    return (
      <div className={cn("rounded-xl border p-4", sectionToneClasses.success.panel)}>
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5" />
          <div className="space-y-3">
            <div>
              <p className="font-semibold">Upload accepted</p>
              <p className="text-sm opacity-85">Processing has started.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={currentStatus} />
              {polling && <span className="inline-flex items-center gap-1 text-xs opacity-75"><Loader2 className="h-3 w-3 animate-spin" /> Checking status</span>}
            </div>
            {status?.failureMessage && <p className="text-sm text-[var(--accent-danger)]">{status.failureMessage}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => router.push(`/Transcripts/Details?job_id=${result.job.jobId}`)}>View transcript</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => router.push("/Transcripts")}>Transcripts</Button>
              <Button type="button" size="sm" variant="ghost" onClick={onUploadAnother}>Upload another file</Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function ValidationList({ items, tone }: { items: string[]; tone: "error" | "warning" }) {
  if (items.length === 0) return null;
  return (
    <ul className={cn("mt-3 space-y-1 text-sm", tone === "error" ? "text-destructive" : "text-[var(--accent-warning)]")}>
      {items.map((item) => <li key={item}>- {item}</li>)}
    </ul>
  );
}

function FieldHint({ current, max, error }: { current: number; max: number; error?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <p className={error ? "text-destructive" : "text-muted-foreground"}>{error ?? "Optional"}</p>
      <p className="shrink-0 text-muted-foreground">{current}/{max}</p>
    </div>
  );
}

function UploadProgress({ progress, computable }: { progress: number | null; computable: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-4 text-sm">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin" /> Uploading file</span>
        {computable && progress !== null && <span className="tabular-nums text-muted-foreground">{progress}%</span>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        {computable && progress !== null ? (
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        ) : (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">This shows file transfer only. Processing starts after the backend accepts the upload.</p>
    </div>
  );
}
