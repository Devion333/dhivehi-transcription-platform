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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadTranscript } from "@/lib/api/uploads";
import type { UploadResult } from "@/lib/api/types";
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
import { cn } from "@/lib/utils";

type UploadState = "idle" | "validating" | "uploading" | "accepted" | "error";

export default function UploadTranscriptPage() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
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
  const [uploadProgress, setUploadProgress] = React.useState<number | null>(null);
  const [progressComputable, setProgressComputable] = React.useState(true);

  const fileValidation = React.useMemo(() => validateUploadFile(file), [file]);
  const metadataErrors = React.useMemo(
    () => validateUploadMetadata({ referenceNumber, notes, requestedSpeakers }),
    [notes, referenceNumber, requestedSpeakers],
  );
  const hasMetadataErrors = Object.keys(metadataErrors).length > 0;
  const canSubmit = fileValidation.valid && !hasMetadataErrors && state !== "uploading";

  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function chooseFile(selected: File | undefined) {
    if (!selected) return;
    setFile(selected);
    setResult(null);
    setError(null);
    setUploadProgress(null);
    setProgressComputable(true);
    setState("idle");
  }

  function clearFile() {
    setFile(null);
    setResult(null);
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
    if (state === "uploading") return;
    if (event.type === "dragenter" || event.type === "dragover") setDragActive(true);
    if (event.type === "dragleave") setDragActive(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (state !== "uploading") chooseFile(event.dataTransfer.files?.[0]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitAttempted(true);
    setState("validating");
    setError(null);

    if (!file || !fileValidation.valid || hasMetadataErrors) {
      setState("error");
      setError("Review the highlighted fields before uploading.");
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
      setState("accepted");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Upload was cancelled. The selected file is still ready to retry.");
      } else {
        setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
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
          title="Upload"
          description="Add an audio or video file and optional metadata before processing starts."
          actions={<Button asChild variant="outline"><Link href="/Transcripts">Transcripts</Link></Button>}
        />
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
                  accept={acceptedFileInputValue()}
                  className="sr-only"
                  onChange={(event) => chooseFile(event.target.files?.[0])}
                  disabled={state === "uploading"}
                />
                <div className="flex flex-col items-center justify-center text-center">
                  <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
                  <Label htmlFor="media-file" className="cursor-pointer text-base font-semibold text-foreground">
                    Drop an audio or video file here, or browse.
                  </Label>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Audio: {audioExtensions.join(", ")} · Video: {videoExtensions.join(", ")}
                  </p>
                  <Button className="mt-4" type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={state === "uploading"}>
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
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Valid file</span>
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
              <div className="grid gap-2">
                <Label htmlFor="referenceNumber">Reference number <span className="text-muted-foreground">(optional)</span></Label>
                <Input
                  id="referenceNumber"
                  value={referenceNumber}
                  maxLength={referenceNumberMaxLength}
                  onChange={(event) => setReferenceNumber(event.target.value)}
                  disabled={state === "uploading"}
                  placeholder="Example: REF-2026-001"
                />
                <FieldHint current={referenceNumber.length} max={referenceNumberMaxLength} error={metadataErrors.referenceNumber} />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="category">Category <span className="text-muted-foreground">(optional)</span></Label>
                <select
                  id="category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  disabled={state === "uploading"}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  {categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
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
                  disabled={state === "uploading"}
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
                  disabled={state === "uploading"}
                  placeholder="Optional reviewer notes"
                  rows={5}
                />
                <FieldHint current={notes.length} max={notesMaxLength} error={metadataErrors.notes} />
              </div>
              </div>

              {state === "uploading" && <UploadProgress progress={uploadProgress} computable={progressComputable} />}
              {state === "accepted" && result && <SuccessPanel result={result} onUploadAnother={resetForm} />}
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

  function SuccessPanel({ result, onUploadAnother }: { result: UploadResult; onUploadAnother: () => void }) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
        <div className="flex gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5" />
          <div className="space-y-3">
            <div>
              <p className="font-semibold">Upload accepted</p>
              <p className="text-sm opacity-85">Processing has started.</p>
            </div>
            <StatusBadge status={result.job.status} />
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
    <ul className={cn("mt-3 space-y-1 text-sm", tone === "error" ? "text-destructive" : "text-amber-700 dark:text-amber-300")}>
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
