"use client";

import { AlertTriangle, ArrowLeft, BarChart3, Check, Edit3, FileDown, Loader2, Pause, Play, RefreshCcw, RotateCcw, RotateCw, Save, Trash2, Volume1, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { PdfExportDialog } from "@/components/transcripts/pdf-export-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranscriptStatusPolling } from "@/hooks/use-transcript-status-polling";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteTranscript, downloadTranscript, getTranscript, getTranscriptAnalysis, getTranscriptDeletionPreview, updateSegment, updateSpeakerName } from "@/lib/api/transcripts";
import { ApiError } from "@/lib/api/client";
import type { TranscriptAnalysis, TranscriptDeletionPreview, TranscriptDetail, TranscriptSegment, TranscriptStatusResponse } from "@/lib/api/types";
import { transcriptStatusLabel } from "@/lib/transcript-status";
import {
  formatDetailDate,
  formatDuration,
  formatTimestamp,
  findTargetSegment,
  getSpeakerDisplayName,
  isProcessingStatus,
  safeValue,
  sortSegments,
  transcriptTextProps,
} from "@/lib/transcript-details-utils";
import { cn } from "@/lib/utils";

type SegmentEditState = {
  editing: boolean;
  draft: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
};

type SpeakerEditState = {
  speakerKey: string;
  draft: string;
  saving: boolean;
  error: string | null;
};

export function TranscriptDetailsClient() {
	const auth = useAuth();
	const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = (searchParams.get("job_id") ?? "").trim();
  const targetSegmentId = (searchParams.get("segment_id") ?? "").trim();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const stopAtRef = React.useRef<number | null>(null);
  const segmentRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const scrolledTargetRef = React.useRef("");
  const [detail, setDetail] = React.useState<TranscriptDetail | null>(null);
  const [liveStatus, setLiveStatus] = React.useState<TranscriptStatusResponse | null>(null);
  const [loading, setLoading] = React.useState(Boolean(jobId));
  const [error, setError] = React.useState<string | null>(null);
  const [retryToken, setRetryToken] = React.useState(0);
  const [audioReady, setAudioReady] = React.useState(false);
  const [audioError, setAudioError] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolume] = React.useState(1);
  const [previousVolume, setPreviousVolume] = React.useState(1);
  const [playbackRate, setPlaybackRate] = React.useState(1);
  const [activeSegmentId, setActiveSegmentId] = React.useState<string | null>(null);
  const [highlightedSegmentId, setHighlightedSegmentId] = React.useState<string | null>(null);
  const [edits, setEdits] = React.useState<Record<string, SegmentEditState>>({});
	const [speakerEdit, setSpeakerEdit] = React.useState<SpeakerEditState | null>(null);
	const [deletePreview, setDeletePreview] = React.useState<TranscriptDeletionPreview | null>(null);
	const [deleteLoading, setDeleteLoading] = React.useState(false);
	const [deleteSubmitting, setDeleteSubmitting] = React.useState(false);
	const [deleteConfirmation, setDeleteConfirmation] = React.useState("");
	const [deleteError, setDeleteError] = React.useState<string | null>(null);
	const [exportOpen, setExportOpen] = React.useState(false);
  const [downloadFormat, setDownloadFormat] = React.useState<"txt" | "json" | "srt" | "vtt" | "pdf">("txt");
  const [downloadLoading, setDownloadLoading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [exportAnalysis, setExportAnalysis] = React.useState<TranscriptAnalysis | null>(null);
  const reloadedReadyRef = React.useRef(false);

  React.useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTranscript(jobId, controller.signal)
      .then((response) => {
        const ordered = { ...response, segments: sortSegments(response.segments) };
        setDetail(ordered);
        setLiveStatus(null);
        reloadedReadyRef.current = false;
        setEdits(Object.fromEntries(ordered.segments.map((segment) => [segment.id, initialEditState(segment.transcriptText)])));
        setAudioReady(false);
        setAudioError(null);
        setCurrentTime(0);
        setDuration(0);
				setActiveSegmentId(null);
				setSpeakerEdit(null);
				setDeletePreview(null);
				setDeleteConfirmation("");
				setDeleteError(null);
				setDownloadError(null);
			})
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load transcript");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [jobId, retryToken]);

  React.useEffect(() => {
    if (!detail || !targetSegmentId || scrolledTargetRef.current === `${detail.jobId}:${targetSegmentId}`) return;
    const target = findTargetSegment(detail.segments, targetSegmentId);
    if (!target) return;
    const element = segmentRefs.current[target.id];
    if (!element) return;
    scrolledTargetRef.current = `${detail.jobId}:${targetSegmentId}`;
    setActiveSegmentId(target.id);
    setHighlightedSegmentId(target.id);
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    const timeoutId = setTimeout(() => setHighlightedSegmentId((current) => current === target.id ? null : current), 2500);
    return () => clearTimeout(timeoutId);
  }, [detail, targetSegmentId]);

  useTranscriptStatusPolling({
    jobId,
    enabled: Boolean(detail && isProcessingStatus(liveStatus?.status ?? detail.status)),
    initialTerminal: liveStatus?.isTerminal ?? false,
    onStatus: (status) => {
      const previousStatus = liveStatus?.status ?? detail?.status ?? "";
      setLiveStatus(status);
      setDetail((current) => current ? { ...current, status: status.status, updatedAt: status.updatedAt || current.updatedAt } : current);
      if (!reloadedReadyRef.current && isProcessingStatus(previousStatus) && (status.status === "transcribed" || status.status === "complete")) {
        reloadedReadyRef.current = true;
        setRetryToken((value) => value + 1);
      }
    },
  });

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      const stopAt = stopAtRef.current;
      if (stopAt !== null && audio.currentTime >= stopAt) {
        audio.pause();
        stopAtRef.current = null;
        setActiveSegmentId(null);
      }
    };
    const handleLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setAudioReady(true);
      setAudioError(null);
    };
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleError = () => setAudioError("The media file could not be loaded by the browser.");
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handlePause);
    audio.addEventListener("error", handleError);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handlePause);
      audio.removeEventListener("error", handleError);
      stopAtRef.current = null;
    };
  }, [detail?.mediaUrl]);

  React.useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  React.useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  if (!jobId) {
    return (
      <PageContainer>
        <PageHeader title="Transcript Details" description="Missing job ID." actions={<BackToList />} />
        <EmptyState title="Invalid link" description="Open a transcript from the list." />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <PageHeader title="Transcript Details" actions={<BackToList />} />
        <LoadingState label="Loading transcript" />
      </PageContainer>
    );
  }

  if (error || !detail) {
    const notFound = error?.toLowerCase().includes("not found");
    return (
      <PageContainer>
        <PageHeader title="Transcript Details" actions={<BackToList />} />
        <ErrorState title={notFound ? "Transcript not found" : "Could not load transcript"} description={error ?? "Transcript data was unavailable."} onRetry={() => setRetryToken((value) => value + 1)} />
      </PageContainer>
    );
  }

  const analysisHref = `/Transcripts/Analysis?job_id=${encodeURIComponent(detail.jobId)}`;
  const isAdmin = auth.user?.role === "admin";
  const currentStatus = liveStatus?.status ?? detail.status;
  const transcriptReady = !isProcessingStatus(currentStatus) && currentStatus !== "failed";
  const speakers = uniqueSpeakers(detail.segments);
  const activeSegment = detail.segments.find((segment) => segment.id === activeSegmentId);
  const activeSpeakerLabel = activeSegment ? getSpeakerDisplayName(activeSegment.speaker, detail.speakerNames) : "";

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) await audio.play().catch(() => setAudioError("Playback could not start."));
    else audio.pause();
  }

  async function playSegment(segment: TranscriptSegment) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(segment.startTime)) return;
    stopAtRef.current = Number.isFinite(segment.endTime) && segment.endTime > segment.startTime ? segment.endTime : null;
    setActiveSegmentId(segment.id);
    audio.currentTime = Math.max(0, segment.startTime);
    await audio.play().catch(() => setAudioError("Segment playback could not start."));
  }

  function seek(next: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const bounded = Math.max(0, Math.min(next, duration || next));
    audio.currentTime = bounded;
    setCurrentTime(bounded);
    stopAtRef.current = null;
    setActiveSegmentId(null);
  }

  function skip(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    seek(audio.currentTime + seconds);
  }

  function changeVolume(next: number) {
    const bounded = Math.max(0, Math.min(next, 1));
    if (bounded > 0) setPreviousVolume(bounded);
    setVolume(bounded);
  }

  function toggleMute() {
    if (volume > 0) {
      setPreviousVolume(volume);
      setVolume(0);
    } else {
      setVolume(previousVolume > 0 ? previousVolume : 1);
    }
  }

  function startEdit(segment: TranscriptSegment) {
    setEdits((current) => ({ ...current, [segment.id]: { ...current[segment.id], editing: true, draft: segment.transcriptText, saved: false, error: null } }));
  }

  function cancelEdit(segment: TranscriptSegment) {
    setEdits((current) => ({ ...current, [segment.id]: { ...initialEditState(segment.transcriptText) } }));
  }

  async function saveEdit(segment: TranscriptSegment) {
    const edit = edits[segment.id];
    if (!edit || edit.saving || !detail) return;
    setEdits((current) => ({ ...current, [segment.id]: { ...edit, saving: true, error: null } }));
    try {
      const updated = await updateSegment(detail.jobId, segment.id, { transcriptText: edit.draft });
      setDetail((current) => {
        if (!current) return current;
        return { ...current, segments: current.segments.map((item) => item.id === updated.id ? updated : item) };
      });
      setEdits((current) => ({ ...current, [segment.id]: { editing: false, draft: updated.transcriptText, saving: false, saved: true, error: null } }));
    } catch (err) {
      setEdits((current) => ({ ...current, [segment.id]: { ...current[segment.id], saving: false, error: err instanceof Error ? err.message : "Failed to save segment" } }));
    }
  }

	async function saveSpeakerName(speakerKey: string, displayName: string) {
		if (!detail || speakerEdit?.saving) return;
		const validationError = validateSpeakerDisplayName(displayName);
		if (validationError) {
			setSpeakerEdit({ speakerKey, draft: displayName, saving: false, error: validationError });
			return;
		}
		setSpeakerEdit({ speakerKey, draft: displayName, saving: true, error: null });
		try {
			const response = await updateSpeakerName(detail.jobId, speakerKey, displayName);
			setDetail((current) => current ? { ...current, speakerNames: response.speakerNames } : current);
			setSpeakerEdit(null);
		} catch (err) {
			setSpeakerEdit({ speakerKey, draft: displayName, saving: false, error: speakerRenameError(err) });
		}
	}

	async function loadDeletionPreview() {
		if (!detail || deleteLoading) return;
		setDeleteLoading(true);
		setDeleteError(null);
		try {
			setDeletePreview(await getTranscriptDeletionPreview(detail.jobId));
		} catch (err) {
			setDeleteError(deletionErrorMessage(err));
		} finally {
			setDeleteLoading(false);
		}
	}

	async function confirmDelete() {
		if (!detail || deleteSubmitting || deleteConfirmation !== detail.jobId) return;
		setDeleteSubmitting(true);
		setDeleteError(null);
		try {
			await deleteTranscript(detail.jobId, deleteConfirmation);
			router.replace("/Transcripts");
		} catch (err) {
			setDeleteError(deletionErrorMessage(err));
		} finally {
			setDeleteSubmitting(false);
		}
	}

  async function startDownload() {
    if (!detail || downloadLoading || !transcriptReady) return;
    setDownloadError(null);
    if (downloadFormat === "pdf") {
      setExportOpen(true);
      return;
    }
    setDownloadLoading(true);
    try {
      const result = await downloadTranscript(detail.jobId, downloadFormat);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadLoading(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={detail.filename}
        actions={
          <>
            <BackToList />
            <DownloadMenu format={downloadFormat} loading={downloadLoading} disabled={!transcriptReady || detail.segments.length === 0} onFormat={setDownloadFormat} onDownload={startDownload} />
            {transcriptReady ? (
              <Button asChild variant="outline"><Link href={analysisHref}><BarChart3 className="h-4 w-4" /> {detail.analysisStatus === "complete" ? "View analysis" : "Analyse"}</Link></Button>
            ) : (
              <Button type="button" variant="outline" disabled><BarChart3 className="h-4 w-4" /> Analyse</Button>
            )}
            <Button type="button" variant="outline" onClick={() => setRetryToken((value) => value + 1)}><RefreshCcw className="h-4 w-4" /> Refresh</Button>
          </>
        }
      />

      <AudioCard
        mediaUrl={detail.mediaUrl}
        playing={playing}
        audioReady={audioReady}
        audioError={audioError}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        playbackRate={playbackRate}
        activeSpeakerLabel={activeSpeakerLabel}
        onToggle={togglePlayback}
        onSeek={seek}
        onSkip={skip}
        onVolume={changeVolume}
        onToggleMute={toggleMute}
        onRate={setPlaybackRate}
      />

      {downloadError && <p className="mt-3 text-sm text-destructive">{downloadError}</p>}

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
		<aside className="space-y-4">
			<MetadataCard detail={detail} status={currentStatus} isAdmin={isAdmin} />
			{isAdmin && (
				<TranscriptDeletionCard
					detail={detail}
					preview={deletePreview}
					loading={deleteLoading}
					submitting={deleteSubmitting}
					confirmation={deleteConfirmation}
					error={deleteError}
					onPreview={loadDeletionPreview}
					onConfirmation={setDeleteConfirmation}
					onDelete={confirmDelete}
				/>
			)}
		</aside>

        <section className="min-w-0 space-y-4">
          {speakers.length > 0 && (
            <SpeakerManagementCard
              speakers={speakers}
              speakerNames={detail.speakerNames}
              edit={speakerEdit}
              onEdit={(speakerKey) => setSpeakerEdit({ speakerKey, draft: getSpeakerDisplayName(speakerKey, detail.speakerNames), saving: false, error: null })}
              onCancel={() => setSpeakerEdit(null)}
              onDraft={(draft) => setSpeakerEdit((current) => current ? { ...current, draft, error: null } : current)}
              onSave={(speakerKey, displayName) => saveSpeakerName(speakerKey, displayName)}
              onReset={(speakerKey) => saveSpeakerName(speakerKey, speakerKey)}
            />
          )}
          {isProcessingStatus(currentStatus) && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
              <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
                Transcript is still processing: {transcriptStatusLabel(currentStatus)}.
              </CardContent>
            </Card>
          )}
          {liveStatus?.status === "failed" && liveStatus.failureMessage && (
            <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40">
              <CardContent className="p-4 text-sm text-red-900 dark:text-red-200">{liveStatus.failureMessage}</CardContent>
            </Card>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Segments</h2>
              <p className="text-sm text-muted-foreground">{detail.segments.length} total</p>
            </div>
          </div>
          {detail.segments.length === 0 ? (
            <EmptyState title="No segments available" description={emptySegmentsMessage(detail.status)} />
          ) : (
            <div className="space-y-4">
              {detail.segments.map((segment) => (
                <SegmentCard
                  key={segment.id}
                  segment={segment}
                  speakerNames={detail.speakerNames}
                  active={activeSegmentId === segment.id}
                  edit={edits[segment.id] ?? initialEditState(segment.transcriptText)}
                  highlighted={highlightedSegmentId === segment.id}
                  refCallback={(element) => { segmentRefs.current[segment.id] = element; }}
                  audioAvailable={Boolean(detail.mediaUrl) && !audioError}
                  editable={transcriptReady}
                  onPlay={() => playSegment(segment)}
                  onEdit={() => startEdit(segment)}
                  onCancel={() => cancelEdit(segment)}
                  onSave={() => saveEdit(segment)}
                  onDraft={(draft) => setEdits((current) => ({ ...current, [segment.id]: { ...(current[segment.id] ?? initialEditState(segment.transcriptText)), draft, saved: false, error: null } }))}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {detail.mediaUrl && <audio ref={audioRef} src={detail.mediaUrl} preload="metadata" />}
      <PdfExportDialog
        open={exportOpen}
        transcript={detail}
        analysis={exportAnalysis}
        onClose={() => setExportOpen(false)}
        onLoadAnalysis={async () => {
          if (exportAnalysis) return exportAnalysis;
          const stored = await getTranscriptAnalysis(detail.jobId);
          setExportAnalysis(stored);
          return stored;
        }}
      />
    </PageContainer>
  );
}

function initialEditState(text: string): SegmentEditState {
  return { editing: false, draft: text, saving: false, saved: false, error: null };
}

function uniqueSpeakers(segments: TranscriptSegment[]) {
  return Array.from(new Set(segments.map((segment) => segment.speaker).filter(Boolean))).sort();
}

function SpeakerManagementCard({ speakers, speakerNames, edit, onEdit, onCancel, onDraft, onSave, onReset }: {
  speakers: string[];
  speakerNames: Record<string, string>;
  edit: SpeakerEditState | null;
  onEdit: (speakerKey: string) => void;
  onCancel: () => void;
  onDraft: (draft: string) => void;
  onSave: (speakerKey: string, displayName: string) => void;
  onReset: (speakerKey: string) => void;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>Speakers</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {speakers.map((speakerKey) => {
          const editing = edit?.speakerKey === speakerKey;
          const displayName = getSpeakerDisplayName(speakerKey, speakerNames);
          return (
            <div key={speakerKey} className="rounded-lg border p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">Generated label: {speakerKey}</p>
                </div>
                {!editing && <Button type="button" variant="outline" size="sm" onClick={() => onEdit(speakerKey)}>Edit</Button>}
              </div>
              {editing && (
                <div className="mt-3 space-y-2">
                  <Input value={edit.draft} onChange={(event) => onDraft(event.target.value)} disabled={edit.saving} maxLength={80} aria-label={`Display name for ${speakerKey}`} />
                  {edit.error && <p className="text-sm text-destructive">{edit.error}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => onSave(speakerKey, edit.draft)} disabled={edit.saving}>{edit.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onReset(speakerKey)} disabled={edit.saving}>Reset to generated label</Button>
                    <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={edit.saving}><X className="h-4 w-4" /> Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function speakerRenameError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "INVALID_SPEAKER_NAME") return "Use 1-80 characters and avoid control characters.";
    if (error.code === "INVALID_SPEAKER_KEY") return "This speaker label is no longer available.";
    if (error.status === 403) return "You do not have permission to rename speakers for this transcript.";
    return error.message;
  }
  return "Speaker name could not be saved.";
}

function validateSpeakerDisplayName(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "Speaker name is required.";
  if ([...trimmed].length > 80) return "Use 80 characters or fewer.";
  if (hasControlCharacters(trimmed)) return "Control characters are not allowed.";
  return "";
}


function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function BackToList() {
  return <Button asChild variant="outline"><Link href="/Transcripts"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>;
}

function DownloadMenu({ format, loading, disabled, onFormat, onDownload }: {
  format: "txt" | "json" | "srt" | "vtt" | "pdf";
  loading: boolean;
  disabled: boolean;
  onFormat: (format: "txt" | "json" | "srt" | "vtt" | "pdf") => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-background p-1">
      <select
        value={format}
        onChange={(event) => onFormat(event.target.value as "txt" | "json" | "srt" | "vtt" | "pdf")}
        disabled={disabled || loading}
        aria-label="Download format"
        className="h-8 rounded-md border-0 bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <option value="txt">Plain text</option>
        <option value="json">JSON</option>
        <option value="srt">SRT subtitles</option>
        <option value="vtt">WebVTT subtitles</option>
        <option value="pdf">PDF</option>
      </select>
      <Button type="button" size="sm" variant="outline" onClick={onDownload} disabled={disabled || loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
        Download
      </Button>
    </div>
  );
}

function MetadataCard({ detail, status, isAdmin }: { detail: TranscriptDetail; status: string; isAdmin: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2"><StatusBadge status={status} /><StatusBadge status={detail.analysisStatus} /></div>
        <Meta label="Reference" value={safeValue(detail.referenceNumber, "No reference")} />
        <Meta label="Category" value={safeValue(detail.category, "Uncategorized")} />
        <Meta label="Speakers" value={String(detail.speakers || 0)} />
        <Meta label="Segments" value={String(detail.segmentCount)} />
        <Meta label="Created" value={formatDetailDate(detail.createdAt)} />
        <Meta label="Updated" value={formatDetailDate(detail.updatedAt)} />
        {isAdmin && <Meta label="Owner" value={ownerLabel(detail)} />}
        <div><p className="text-muted-foreground">Notes</p><p className="mt-1 whitespace-pre-wrap">{safeValue(detail.notes, "No notes")}</p></div>
      </CardContent>
    </Card>
  );
}

function TranscriptDeletionCard({ detail, preview, loading, submitting, confirmation, error, onPreview, onConfirmation, onDelete }: {
  detail: TranscriptDetail;
  preview: TranscriptDeletionPreview | null;
  loading: boolean;
  submitting: boolean;
  confirmation: string;
  error: string | null;
  onPreview: () => void;
  onConfirmation: (value: string) => void;
  onDelete: () => void;
}) {
  const owner = preview?.owner.displayName || preview?.owner.email || "Unknown owner";
  const blocked = preview && !preview.canDelete;
  return (
    <Card className="border-destructive/30">
      <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Danger zone</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">Delete this transcript and its related media and transcript records. This action is permanent.</p>
        {!preview ? (
          <Button type="button" variant="outline" onClick={onPreview} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Preview deletion</Button>
        ) : (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-lg border p-3">
              <PreviewRow label="Filename" value={preview.filename || detail.filename} />
              <PreviewRow label="Owner" value={owner} />
              <PreviewRow label="Segments" value={String(preview.segmentCount)} />
              <PreviewRow label="Media objects" value={String(preview.mediaObjects)} />
              <PreviewRow label="Status" value={preview.status} />
            </dl>
            {blocked && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Deletion unavailable: {preview.blockingReason === "TRANSCRIPT_PROCESSING" ? "transcript is currently processing" : preview.blockingReason}</p>}
            {!blocked && (
              <div className="space-y-2">
                <label htmlFor="delete-confirmation" className="font-medium">Type <span className="font-mono">{detail.jobId}</span> to confirm</label>
                <Input id="delete-confirmation" value={confirmation} onChange={(event) => onConfirmation(event.target.value)} disabled={submitting} autoComplete="off" />
                <Button type="button" variant="destructive" onClick={onDelete} disabled={submitting || confirmation !== detail.jobId}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete transcript</Button>
              </div>
            )}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium break-all">{value}</dd></div>;
}

function deletionErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "TRANSCRIPT_DELETION_PARTIAL") return "Deletion partially completed. Some cleanup categories failed safely; retry deletion or check backend dependencies.";
    if (error.code === "DELETE_CONFIRMATION_MISMATCH") return "The confirmation value does not match the job ID.";
    if (error.code === "TRANSCRIPT_PROCESSING") return "This transcript is currently processing and cannot be deleted.";
    if (error.code === "UNSAFE_MEDIA_REFERENCE") return "Deletion is blocked because this transcript has unsafe media references.";
    if (error.status === 403) return "Only administrators can delete transcripts.";
    return error.message;
  }
  return "Transcript deletion failed.";
}

function ownerLabel(detail: Pick<TranscriptDetail, "ownerDisplayName" | "ownerEmail" | "ownerUserId">) {
  return detail.ownerDisplayName || detail.ownerEmail || detail.ownerUserId || "Legacy ownerless";
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-b pb-2 last:border-b-0"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}

function AudioCard({ mediaUrl, playing, audioReady, audioError, currentTime, duration, volume, playbackRate, activeSpeakerLabel, onToggle, onSeek, onSkip, onVolume, onToggleMute, onRate }: {
  mediaUrl: string;
  playing: boolean;
  audioReady: boolean;
  audioError: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  activeSpeakerLabel: string;
  onToggle: () => void;
  onSeek: (value: number) => void;
  onSkip: (seconds: number) => void;
  onVolume: (value: number) => void;
  onToggleMute: () => void;
  onRate: (value: number) => void;
}) {
  const disabled = !mediaUrl || Boolean(audioError);
  const seekDisabled = disabled || !audioReady;
  const seekProgress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const volumeProgress = Math.min(100, Math.max(0, volume * 100));
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle>Audio</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {!mediaUrl ? <p className="text-sm text-muted-foreground">Media unavailable</p> : audioError ? <p className="text-sm text-destructive">{audioError}</p> : null}
        {activeSpeakerLabel && <p className="text-sm text-muted-foreground">Current speaker: <span className="font-medium text-foreground">{activeSpeakerLabel}</span></p>}
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-3 md:grid-cols-[auto_auto_auto_auto_minmax(120px,1fr)_auto_auto_auto] md:items-center">
            <div className="flex items-center gap-2 md:contents">
              <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => onSkip(-10)} disabled={seekDisabled} aria-label="Rewind 10 seconds"><RotateCcw className="h-4 w-4" /></Button>
              <Button type="button" size="icon" className="h-11 w-11 rounded-full shadow-sm" onClick={onToggle} disabled={disabled} aria-label={playing ? "Pause audio" : "Play audio"}>{playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</Button>
              <Button type="button" size="icon" variant="ghost" className="h-9 w-9 rounded-full" onClick={() => onSkip(10)} disabled={seekDisabled} aria-label="Forward 10 seconds"><RotateCw className="h-4 w-4" /></Button>
            </div>
            <select value={playbackRate} onChange={(event) => onRate(Number(event.target.value))} aria-label="Playback speed" className="ml-auto h-8 w-16 rounded-md border border-input bg-background px-2 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:order-last md:ml-0"><option value={0.75}>0.75x</option><option value={1}>1x</option><option value={1.25}>1.25x</option><option value={1.5}>1.5x</option></select>
            <span className="hidden text-xs text-muted-foreground tabular-nums md:block">{formatTimestamp(currentTime)}</span>
            <input aria-label="Seek audio" type="range" min={0} max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => onSeek(Number(event.target.value))} disabled={seekDisabled} className="range-control range-control-seek col-span-full md:col-span-1" style={{ "--range-progress": `${seekProgress}%` } as React.CSSProperties} />
            <div className="col-span-full flex items-center gap-3 md:contents">
              <span className="text-xs text-muted-foreground tabular-nums md:hidden">{formatTimestamp(currentTime)}</span>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums md:ml-0">{audioReady ? formatTimestamp(duration) : "0:00"}</span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onToggleMute} disabled={disabled} aria-label={volume === 0 ? "Unmute audio" : "Mute audio"}><VolumeIcon className="h-4 w-4" /></Button>
              <input aria-label="Volume" type="range" min={0} max={1} step="0.05" value={volume} onChange={(event) => onVolume(Number(event.target.value))} disabled={disabled} className="range-control range-control-volume" style={{ "--range-progress": `${volumeProgress}%` } as React.CSSProperties} />
            </div>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full md:hidden" onClick={onToggleMute} disabled={disabled} aria-label={volume === 0 ? "Unmute audio" : "Mute audio"}><VolumeIcon className="h-4 w-4" /></Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SegmentCard({ segment, speakerNames, active, highlighted, edit, audioAvailable, editable, refCallback, onPlay, onEdit, onCancel, onSave, onDraft }: {
  segment: TranscriptSegment;
  speakerNames: Record<string, string>;
  active: boolean;
  highlighted: boolean;
  edit: SegmentEditState;
  audioAvailable: boolean;
  editable: boolean;
  refCallback: (element: HTMLDivElement | null) => void;
  onPlay: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDraft: (value: string) => void;
}) {
  const textProps = transcriptTextProps(edit.editing ? edit.draft : segment.transcriptText);
  return (
    <Card ref={refCallback} className={cn(active && "border-primary shadow-sm", highlighted && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background")}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{getSpeakerDisplayName(segment.speaker, speakerNames)}</CardTitle>
            <p className="text-sm text-muted-foreground">{formatTimestamp(segment.startTime)} - {formatTimestamp(segment.endTime)} ({formatDuration(segment.startTime, segment.endTime)}) - {segment.speaker}</p>
          </div>
          <div className="flex flex-wrap gap-2"><StatusBadge status={segment.status} /></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {edit.editing ? (
          <Textarea value={edit.draft} onChange={(event) => onDraft(event.target.value)} rows={5} dir={textProps.dir} className={cn("min-h-32", textProps.className)} disabled={edit.saving} />
        ) : (
          <div dir={textProps.dir} className={cn("rounded-lg border bg-muted/20 p-4 text-sm", textProps.className)}>{segment.transcriptText || <span className="text-muted-foreground">No text yet</span>}</div>
        )}
        {edit.error && <p className="text-sm text-destructive">{edit.error}</p>}
        {edit.saved && <p className="flex items-center gap-1 text-sm text-emerald-600"><Check className="h-4 w-4" /> Saved</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onPlay} disabled={!audioAvailable}><Play className="h-4 w-4" /> Play segment</Button>
          {edit.editing ? (
            <>
              <Button type="button" size="sm" onClick={onSave} disabled={edit.saving}>{edit.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button>
              <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={edit.saving}><X className="h-4 w-4" /> Cancel</Button>
            </>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={onEdit} disabled={!editable}><Edit3 className="h-4 w-4" /> Edit text</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function emptySegmentsMessage(status: string) {
  if (isProcessingStatus(status)) return "Transcript is still processing.";
  if (status === "failed") return "Processing failed.";
  return "No segments found.";
}
