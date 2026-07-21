"use client";

import { AlertTriangle, ArrowLeft, BarChart3, Check, CheckSquare, ChevronDown, Edit3, FileDown, FileText, Folder as FolderIcon, Loader2, Pause, Play, RefreshCcw, RotateCcw, RotateCw, Save, Square, Trash2, UserRound, Volume1, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";

import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PdfExportDialog } from "@/components/transcripts/pdf-export-dialog";
import { TranscriptReassignmentDialog } from "@/components/transcripts/transcript-reassignment-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SectionHeading } from "@/components/ui/section-heading";
import { maintenanceMutationMessage, useMaintenanceAccess } from "@/hooks/use-maintenance-access";
import { useTranscriptStatusPolling } from "@/hooks/use-transcript-status-polling";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addTranscriptToFolder, createFolder, listFolders, removeTranscriptFromFolder } from "@/lib/api/folders";
import { bulkUpdateSegmentReview, deleteTranscript, downloadTranscript, getTranscript, getTranscriptAnalysis, getTranscriptDeletionPreview, updateSegment, updateSegmentReview, updateSpeakerName } from "@/lib/api/transcripts";
import { ApiError } from "@/lib/api/client";
import type { Folder, TranscriptAnalysis, TranscriptDeletionPreview, TranscriptDetail, TranscriptSegment, TranscriptStatusResponse } from "@/lib/api/types";
import { getSafeInternalReturnPath, withReturnTo } from "@/lib/navigation-utils";
import { sectionToneClasses } from "@/lib/section-styles";
import { reviewProgressBadgeClass, reviewProgressLabel, reviewProgressTextClass } from "@/lib/analysis-review-status";
import { hasTranscriptReference, transcriptIdentityTitle } from "@/lib/transcript-identity";
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
  const maintenance = useMaintenanceAccess();
	const router = useRouter();
  const searchParams = useSearchParams();
  const jobId = (searchParams.get("job_id") ?? "").trim();
  const targetSegmentId = (searchParams.get("segment_id") ?? "").trim();
  const returnTo = getSafeInternalReturnPath(searchParams.get("returnTo"), "/Transcripts");
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
	const [reassignOpen, setReassignOpen] = React.useState(false);
	const [exportOpen, setExportOpen] = React.useState(false);
  const [downloadLoading, setDownloadLoading] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [exportAnalysis, setExportAnalysis] = React.useState<TranscriptAnalysis | null>(null);
  const [segmentReviewSaving, setSegmentReviewSaving] = React.useState(false);
  const [segmentReviewError, setSegmentReviewError] = React.useState<string | null>(null);
  const [confirmBulkAction, setConfirmBulkAction] = React.useState<boolean | null>(null);
  const reloadedReadyRef = React.useRef(false);
  const reviewSentinelRef = React.useRef<HTMLDivElement>(null);
  const [stickyReview, setStickyReview] = React.useState(false);

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
				setReassignOpen(false);
				setDownloadError(null);
				setExportAnalysis(null);
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
    if (!detail || detail.analysisStatus !== "complete") return;
    const controller = new AbortController();
    getTranscriptAnalysis(detail.jobId, controller.signal)
      .then((analysis) => {
        setExportAnalysis(analysis);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [detail]);

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

  React.useEffect(() => {
    const el = reviewSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setStickyReview(!entry.isIntersecting);
      },
      { threshold: 0, rootMargin: "-1px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [detail?.reviewPercentage]);

  if (!jobId) {
    return (
      <PageContainer>
        <div className="mb-4"><BackToList href={returnTo} /></div>
        <PageHeader title="Transcript Details" description="Missing job ID." />
        <EmptyState title="Invalid link" description="Open a transcript from the list." />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="mb-4"><BackToList href={returnTo} /></div>
        <PageHeader title="Transcript Details" />
        <LoadingState label="Loading transcript" />
      </PageContainer>
    );
  }

  if (error || !detail) {
    const notFound = error?.toLowerCase().includes("not found");
    return (
      <PageContainer>
        <div className="mb-4"><BackToList href={returnTo} /></div>
        <PageHeader title="Transcript Details" />
        <ErrorState title={notFound ? "Transcript not found" : "Could not load transcript"} description={error ?? "Transcript data was unavailable."} onRetry={() => setRetryToken((value) => value + 1)} />
      </PageContainer>
    );
  }

  const detailHref = withReturnTo(`/Transcripts/Details?job_id=${encodeURIComponent(detail.jobId)}`, returnTo);
  const analysisHref = withReturnTo(`/Transcripts/Analysis?job_id=${encodeURIComponent(detail.jobId)}`, detailHref);
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
      setEdits((current) => ({ ...current, [segment.id]: { ...current[segment.id], saving: false, error: err instanceof ApiError && err.code === "maintenance_mode" ? "Changes are temporarily disabled during maintenance mode." : err instanceof Error ? err.message : "Failed to save segment" } }));
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

  async function toggleSegmentReview(segment: TranscriptSegment) {
    if (!detail || segmentReviewSaving) return;
    setSegmentReviewSaving(true);
    setSegmentReviewError(null);
    try {
      const response = await updateSegmentReview(detail.jobId, segment.id, !segment.isReviewed);
      setDetail((current) => {
        if (!current) return current;
        return {
          ...current,
          reviewedSegmentCount: response.reviewedSegmentCount,
          totalSegmentCount: response.totalSegmentCount,
          reviewPercentage: response.reviewPercentage,
          segments: current.segments.map((s) =>
            s.id === segment.id
              ? {
                  ...s,
                  isReviewed: response.isReviewed,
                  reviewedBy: response.reviewedBy,
                  reviewedAt: response.reviewedAt,
                }
              : s
          ),
        };
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "maintenance_mode") {
        setSegmentReviewError("Segment review is temporarily disabled during maintenance mode.");
      } else {
        setSegmentReviewError(err instanceof Error ? err.message : "Failed to update segment review");
      }
    } finally {
      setSegmentReviewSaving(false);
    }
  }

  async function bulkReview(isReviewed: boolean) {
    if (!detail || segmentReviewSaving) return;
    setSegmentReviewSaving(true);
    setSegmentReviewError(null);
    try {
      const response = await bulkUpdateSegmentReview(detail.jobId, isReviewed);
      setDetail((current) => {
        if (!current) return current;
        return {
          ...current,
          reviewedSegmentCount: response.reviewedSegmentCount,
          totalSegmentCount: response.totalSegmentCount,
          reviewPercentage: response.reviewPercentage,
          segments: current.segments.map((s) => {
            const bulkReviewedBy = isReviewed ? (auth.user?.id ?? "") : "";
            const bulkReviewedAt = isReviewed ? new Date().toISOString() : "";
            return { ...s, isReviewed, reviewedBy: bulkReviewedBy, reviewedAt: bulkReviewedAt };
          }),
        };
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "maintenance_mode") {
        setSegmentReviewError("Bulk review is temporarily disabled during maintenance mode.");
      } else {
        setSegmentReviewError(err instanceof Error ? err.message : "Failed to bulk update review");
      }
    } finally {
      setSegmentReviewSaving(false);
    }
  }

  async function startDownload(format: "txt" | "json" | "srt" | "vtt" | "pdf") {
    if (!detail || downloadLoading || !transcriptReady) return;
    setDownloadError(null);
    if (format === "pdf") {
      setExportOpen(true);
      return;
    }
    setDownloadLoading(true);
    try {
      const result = await downloadTranscript(detail.jobId, format);
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
      <div className="mb-4"><BackToList href={returnTo} /></div>
      <header className="mb-3 space-y-3">
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="line-clamp-2 break-words text-2xl font-semibold leading-tight tracking-tight text-foreground md:text-3xl" title={transcriptIdentityTitle(detail.referenceNumber, detail.filename)}>{transcriptIdentityTitle(detail.referenceNumber, detail.filename)}</h1>
          {hasTranscriptReference(detail.referenceNumber) ? <p className="mt-1 break-words text-sm text-muted-foreground" title={detail.filename}>{detail.filename}</p> : <p className="mt-1 text-sm text-[var(--accent-warning)]">No reference</p>}
          <CompactMetadata detail={detail} status={currentStatus} />
          <MetadataDetailsPanel detail={detail} />
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 xl:justify-end">
          <TranscriptFolderButton detail={detail} disabled={!maintenance.canModifyDuringMaintenance} onChanged={() => setRetryToken((value) => value + 1)} />
          {speakers.length > 0 && (
            <SpeakerManagementMenu
              speakers={speakers}
              speakerNames={detail.speakerNames}
              edit={speakerEdit}
              disabled={!maintenance.canModifyDuringMaintenance}
              onEdit={(speakerKey) => setSpeakerEdit({ speakerKey, draft: getSpeakerDisplayName(speakerKey, detail.speakerNames), saving: false, error: null })}
              onCancel={() => setSpeakerEdit(null)}
              onDraft={(draft) => setSpeakerEdit((current) => current ? { ...current, draft, error: null } : current)}
              onSave={(speakerKey, displayName) => saveSpeakerName(speakerKey, displayName)}
              onReset={(speakerKey) => saveSpeakerName(speakerKey, speakerKey)}
            />
          )}
          <DownloadMenu loading={downloadLoading} disabled={!transcriptReady || detail.segments.length === 0} onDownload={startDownload} />
          {transcriptReady ? maintenance.canModifyDuringMaintenance ? (
            <Button asChild variant="outline" size="sm" className={cn("shrink-0", sectionToneClasses.analysis.text)}><Link href={analysisHref}><BarChart3 className="h-4 w-4" /> {analysisActionLabel(detail.analysisStatus)}</Link></Button>
          ) : (
            <Button type="button" variant="outline" size="sm" className={cn("shrink-0", sectionToneClasses.analysis.text)} disabled title={maintenanceMutationMessage}><BarChart3 className="h-4 w-4" /> {analysisActionLabel(detail.analysisStatus)}</Button>
          ) : (
            <Button type="button" variant="outline" size="sm" className={cn("shrink-0", sectionToneClasses.analysis.text)} disabled><BarChart3 className="h-4 w-4" /> Analysing...</Button>
          )}
          {isAdmin && <OwnershipControl detail={detail} onReassign={() => setReassignOpen(true)} />}
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setRetryToken((value) => value + 1)}><RefreshCcw className="h-4 w-4" /> Refresh</Button>
        </div>
      </div>
      </header>

      {transcriptReady && detail.reviewPercentage != null && (
        <>
          <div
            className={cn(
              "sticky top-0 z-10 mb-4 transition-all duration-150 ease-out",
              stickyReview
                ? "translate-y-0 opacity-100"
                : "pointer-events-none -translate-y-2 opacity-0",
            )}
          >
            <div className="rounded-xl border bg-card p-3 text-sm shadow-sm">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[var(--accent-success)] transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, Math.round(detail.reviewPercentage)))}%` }}
                />
              </div>
            </div>
          </div>
          <div ref={reviewSentinelRef} />
          <SegmentReviewProgressBar
            reviewedSegmentCount={detail.reviewedSegmentCount ?? 0}
            totalSegmentCount={detail.totalSegmentCount ?? detail.segmentCount}
            reviewPercentage={detail.reviewPercentage}
          />
        </>
      )}
      {segmentReviewError && <p className="mb-3 text-sm text-destructive">{segmentReviewError}</p>}

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

      <div className="mt-8 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <SectionHeading title="Transcript" description={`${detail.segments.length} segment${detail.segments.length === 1 ? "" : "s"}`} icon={FileText} tone="transcript" />
            </div>
            {transcriptReady && maintenance.canModifyDuringMaintenance && detail.segments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={segmentReviewSaving} onClick={() => setConfirmBulkAction(true)}>
                  <CheckSquare className="h-3.5 w-3.5" /> Mark all reviewed
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={segmentReviewSaving} onClick={() => setConfirmBulkAction(false)}>
                  <Square className="h-3.5 w-3.5" /> Mark all not reviewed
                </Button>
              </div>
            )}
          </div>
          {isProcessingStatus(currentStatus) && (
            <Card className={sectionToneClasses.warning.panel}>
              <CardContent className="p-3 text-sm">
                Transcript is still processing: {transcriptStatusLabel(currentStatus)}.
              </CardContent>
            </Card>
          )}
          {liveStatus?.status === "failed" && liveStatus.failureMessage && (
            <Card className={sectionToneClasses.danger.panel}>
              <CardContent className="p-3 text-sm">{liveStatus.failureMessage}</CardContent>
            </Card>
          )}
          {detail.segments.length === 0 ? (
            <EmptyState title="No segments available" description={emptySegmentsMessage(detail.status)} />
          ) : (
            <div className="space-y-3">
              {detail.segments.map((segment, index) => (
                <SegmentCard
                  key={segment.id}
                  segment={segment}
                  speakerNames={detail.speakerNames}
                  speakerIndex={speakers.indexOf(segment.speaker)}
                  isLast={index === detail.segments.length - 1}
                  active={activeSegmentId === segment.id}
                  edit={edits[segment.id] ?? initialEditState(segment.transcriptText)}
                  highlighted={highlightedSegmentId === segment.id}
                  refCallback={(element) => { segmentRefs.current[segment.id] = element; }}
                  audioAvailable={Boolean(detail.mediaUrl) && !audioError}
                  editable={transcriptReady && maintenance.canModifyDuringMaintenance}
                  reviewable={transcriptReady && maintenance.canModifyDuringMaintenance}
                  segmentReviewSaving={segmentReviewSaving}
                  onPlay={() => playSegment(segment)}
                  onEdit={() => startEdit(segment)}
                  onCancel={() => cancelEdit(segment)}
                  onSave={() => saveEdit(segment)}
                  onDraft={(draft) => setEdits((current) => ({ ...current, [segment.id]: { ...(current[segment.id] ?? initialEditState(segment.transcriptText)), draft, saved: false, error: null } }))}
                  onToggleReview={() => void toggleSegmentReview(segment)}
                />
              ))}
            </div>
          )}
        </section>

		<aside className="space-y-4 xl:order-last">
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
      <TranscriptReassignmentDialog
        jobId={detail.jobId}
        filename={detail.filename}
        currentOwner={{ userId: detail.ownerUserId, displayName: detail.ownerDisplayName, email: detail.ownerEmail }}
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        onReassigned={() => setRetryToken((value) => value + 1)}
      />
      <ConfirmDialog
        open={confirmBulkAction !== null}
        title={confirmBulkAction ? "Mark all segments as reviewed?" : "Mark all segments as not reviewed?"}
        description={
          confirmBulkAction != null && detail
            ? `This will ${confirmBulkAction ? "mark all " : "remove the reviewed state from all "}${detail.segments.length} segment${detail.segments.length === 1 ? "" : "s"} in reference ${detail.referenceNumber} as ${confirmBulkAction ? "reviewed" : "not reviewed"}.`
            : undefined
        }
        confirmLabel={confirmBulkAction ? "Mark reviewed" : "Mark not reviewed"}
        cancelLabel="Cancel"
        destructive={confirmBulkAction === false}
        onConfirm={() => {
          setConfirmBulkAction(null);
          void bulkReview(confirmBulkAction!);
        }}
        onCancel={() => setConfirmBulkAction(null)}
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

function SpeakerManagementMenu({ speakers, speakerNames, edit, disabled = false, onEdit, onCancel, onDraft, onSave, onReset }: {
  speakers: string[];
  speakerNames: Record<string, string>;
  edit: SpeakerEditState | null;
  disabled?: boolean;
  onEdit: (speakerKey: string) => void;
  onCancel: () => void;
  onDraft: (draft: string) => void;
  onSave: (speakerKey: string, displayName: string) => void;
  onReset: (speakerKey: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-2">
          <UserRound className="h-4 w-4" /> Speakers {speakers.length}
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={8} avoidCollisions collisionPadding={16} className="w-[min(420px,calc(100vw-2rem))] p-0">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Speakers</p>
              <p className="text-xs text-muted-foreground">Rename display labels without changing generated labels.</p>
            </div>
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{speakers.length}</span>
          </div>
        </div>
        <div className="max-h-[min(60vh,420px)] overflow-y-auto">
          <div className="grid grid-cols-[minmax(0,1fr)_110px_56px] gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Speaker name</span>
            <span>Generated label</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-border/70">
            {speakers.map((speakerKey) => {
              const editing = edit?.speakerKey === speakerKey;
              const displayName = getSpeakerDisplayName(speakerKey, speakerNames);
              return (
                <div key={speakerKey} className="px-4 py-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_110px_56px] items-center gap-3 text-sm">
                    <p className="truncate font-medium" title={displayName}>{displayName}</p>
                    <p className="truncate text-xs text-muted-foreground" title={speakerKey}>{speakerKey}</p>
                    {!editing && <Button type="button" variant="ghost" size="sm" className="justify-self-end" onClick={() => onEdit(speakerKey)} disabled={disabled} title={disabled ? maintenanceMutationMessage : undefined}>Edit</Button>}
                    {editing && <span className="text-right text-xs text-muted-foreground">Editing</span>}
                  </div>
                  {editing && (
                    <div className="mt-3 space-y-2 rounded-lg border bg-background p-3">
                      <Input value={edit.draft} onChange={(event) => onDraft(event.target.value)} disabled={edit.saving} maxLength={80} aria-label={`Display name for ${speakerKey}`} />
                      {edit.error && <p className="text-sm text-destructive">{edit.error}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={() => onSave(speakerKey, edit.draft)} disabled={edit.saving}>{edit.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => onReset(speakerKey)} disabled={edit.saving}>Reset</Button>
                        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={edit.saving}><X className="h-4 w-4" /> Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
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

function BackToList({ href }: { href: string }) {
  return <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2"><Link href={href}><ArrowLeft className="h-4 w-4" /> Back</Link></Button>;
}

function analysisActionLabel(status: string) {
  if (status === "complete") return "View analysis";
  if (status === "processing") return "Analysing...";
  if (status === "failed") return "Retry analysis";
  return "Analyse transcript";
}

function SegmentReviewProgressBar({ reviewedSegmentCount, totalSegmentCount, reviewPercentage }: { reviewedSegmentCount: number; totalSegmentCount: number; reviewPercentage: number }) {
  const label = reviewProgressLabel(reviewedSegmentCount, totalSegmentCount, reviewPercentage);
  const badgeClass = reviewProgressBadgeClass(reviewPercentage);
  const textClass = reviewProgressTextClass(reviewPercentage);
  const pct = Math.min(100, Math.max(0, Math.round(reviewPercentage)));
  return (
    <div className="mb-4 rounded-xl border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">Segment Review Progress</span>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium", badgeClass, textClass)}>{label}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-[var(--accent-success)] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DownloadMenu({ loading, disabled, onDownload }: {
  loading: boolean;
  disabled: boolean;
  onDownload: (format: "txt" | "json" | "srt" | "vtt" | "pdf") => void;
}) {
  const options: Array<{ label: string; value: "txt" | "json" | "srt" | "vtt" | "pdf" }> = [
    { label: "Plain text", value: "txt" },
    { label: "JSON", value: "json" },
    { label: "SRT subtitles", value: "srt" },
    { label: "WebVTT subtitles", value: "vtt" },
    { label: "PDF", value: "pdf" },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 gap-2" disabled={disabled || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          <span>Download</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options.map((option) => <DropdownMenuItem key={option.value} disabled={disabled || loading} onSelect={() => onDownload(option.value)}>{option.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CompactMetadata({ detail, status }: { detail: TranscriptDetail; status: string }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span>{safeValue(detail.referenceNumber, "No reference")}</span>
      <SeparatorDot />
      <span>{safeValue(detail.category, "Uncategorized")}</span>
      <SeparatorDot />
      <StatusBadge status={status} />
      <SeparatorDot />
      <span>{formatDetailDate(detail.createdAt)}</span>
    </div>
  );
}

function SeparatorDot() {
  return <span aria-hidden="true" className="text-muted-foreground/60">&middot;</span>;
}

function MetadataDetailsPanel({ detail }: { detail: TranscriptDetail }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mt-2 text-sm">
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[var(--accent-primary)] hover:bg-[var(--accent-primary-bg)] hover:text-[var(--accent-primary)]" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        More details
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </Button>
      {open && (
        <div className="mt-3 border-t pt-3">
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Meta label="Job ID" value={detail.jobId} />
            <Meta label="Updated" value={formatDetailDate(detail.updatedAt)} />
            <Meta label="Analysis status" value={detail.analysisStatus} />
            <Meta label="Speakers" value={String(detail.speakers || 0)} />
            <Meta label="Segments" value={String(detail.segmentCount)} />
          </dl>
          <div className="mt-2"><p className="text-muted-foreground">Notes</p><p className="mt-1 whitespace-pre-wrap">{safeValue(detail.notes, "No notes")}</p></div>
        </div>
      )}
    </div>
  );
}

function TranscriptFolderButton({ detail, disabled = false, onChanged }: { detail: TranscriptDetail; disabled?: boolean; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [folders, setFolders] = React.useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDescription, setNewDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    listFolders({ page: 1, pageSize: 100 }, controller.signal).then((response) => setFolders(response.items)).catch(() => undefined);
    return () => controller.abort();
  }, [open]);

  async function addOrMove() {
    if (!selectedFolderId) return;
    setSaving(true);
    setError(null);
    try {
      if (detail.folderId) await removeTranscriptFromFolder(detail.folderId, detail.jobId);
      await addTranscriptToFolder(selectedFolderId, detail.jobId);
      setSelectedFolderId("");
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder update failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!detail.folderId) return;
    setSaving(true);
    setError(null);
    try {
      await removeTranscriptFromFolder(detail.folderId, detail.jobId);
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder update failed");
    } finally {
      setSaving(false);
    }
  }

  async function createAndAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const response = await createFolder({ name: newName, description: newDescription });
      if (detail.folderId) await removeTranscriptFromFolder(detail.folderId, detail.jobId);
      await addTranscriptToFolder(response.folder.id, detail.jobId);
      setNewName("");
      setNewDescription("");
      setCreateOpen(false);
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder could not be created");
    } finally {
      setSaving(false);
    }
  }

  const filteredFolders = folders.filter((folder) => folder.id !== detail.folderId && folder.name.toLowerCase().includes(search.toLowerCase().trim()));

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="inline-flex max-w-48 shrink-0 items-center gap-2" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? maintenanceMutationMessage : detail.folderName || "Add to folder"}>
        <FolderIcon className={cn("h-4 w-4 shrink-0", sectionToneClasses.folder.text)} /> <span className="truncate">{detail.folderName || "Add to folder"}</span>
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-xl border bg-card p-4 shadow-xl" role="dialog" aria-modal="true" aria-label="Folder">
            <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">Folder</h2><Button type="button" size="icon" variant="ghost" onClick={() => setOpen(false)} disabled={saving} aria-label="Close"><X className="h-4 w-4" /></Button></div>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">Current: {detail.folderName || "No folder"}</p>
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search existing folders" disabled={saving} />
              <div className="max-h-48 space-y-1 overflow-auto rounded-lg border bg-popover p-2 text-popover-foreground shadow-sm">
                {filteredFolders.length === 0 ? <p className="p-2 text-muted-foreground">No matching folders.</p> : filteredFolders.map((folder) => {
                  const selected = selectedFolderId === folder.id;
                  return <label key={folder.id} className={cn("flex cursor-pointer items-center gap-2 rounded-md p-2 text-popover-foreground focus-within:bg-accent focus-within:text-accent-foreground hover:bg-accent hover:text-accent-foreground", selected && "bg-accent text-accent-foreground", saving && "cursor-not-allowed opacity-50")}><input type="radio" name="folder" value={folder.id} checked={selected} onChange={() => setSelectedFolderId(folder.id)} disabled={saving} /><span>{folder.name}</span></label>;
                })}
              </div>
              <div className="flex flex-wrap gap-2"><Button type="button" onClick={addOrMove} disabled={saving || !selectedFolderId}>{detail.folderId ? "Move here" : "Add transcript"}</Button><Button type="button" variant="outline" onClick={remove} disabled={saving || !detail.folderId}>Remove from folder</Button></div>
              <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setCreateOpen((value) => !value)}>+ Create new folder</button>
              {createOpen && <div className="space-y-2 rounded-lg border p-3"><label className="text-sm font-medium" htmlFor="new-folder-name">Name</label><Input id="new-folder-name" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Enter name" maxLength={120} disabled={saving} /><label className="text-sm font-medium" htmlFor="new-folder-description">Description</label><Textarea id="new-folder-description" value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder="Enter description" maxLength={500} disabled={saving} /><Button type="button" onClick={createAndAdd} disabled={saving || !newName.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create and add transcript</Button></div>}
              {error && <p className="text-destructive">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function OwnershipControl({ detail, onReassign }: { detail: TranscriptDetail; onReassign: () => void }) {
  const [open, setOpen] = React.useState(false);
  const hasOwner = Boolean(detail.ownerUserId);
  const label = hasOwner ? `Owner: ${ownerLabel(detail)}` : "No owner";
  return (
    <div className="relative">
      <Button type="button" variant="outline" size="sm" className="max-w-52 shrink-0 justify-start gap-2" onClick={() => setOpen((value) => !value)} title={label} aria-expanded={open}>
        <UserRound className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Ownership</p>
              <p className="text-xs text-muted-foreground">Current transcript access</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close ownership details"><X className="h-4 w-4" /></Button>
          </div>
          {hasOwner ? (
            <dl className="space-y-2">
              <Meta label="Current owner" value={ownerLabel(detail)} />
              <Meta label="Display name" value={detail.ownerDisplayName || "Not recorded"} />
              <Meta label="Email" value={detail.ownerEmail || "Not recorded"} />
            </dl>
          ) : (
            <p className={cn("rounded-lg border p-3", sectionToneClasses.warning.panel)}>No owner assigned</p>
          )}
          <Button type="button" variant="outline" size="sm" className="mt-3 w-full justify-start" onClick={() => { setOpen(false); void onReassign(); }}>{hasOwner ? "Reassign transcript" : "Assign transcript"}</Button>
        </div>
      )}
    </div>
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
    <Card className="border-destructive/30 bg-destructive/5 shadow-none">
      <CardHeader><CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" /> Delete transcript</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">Permanently remove this transcript and its related media. This action cannot be undone.</p>
        {!preview ? (
          <Button type="button" variant="outline" onClick={onPreview} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Preview deletion</Button>
        ) : (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-lg border border-destructive/20 bg-background/70 p-3">
              <PreviewRow label="Filename" value={preview.filename || detail.filename} />
              <PreviewRow label="Owner" value={owner} />
              <PreviewRow label="Segments" value={String(preview.segmentCount)} />
              <PreviewRow label="Media objects" value={String(preview.mediaObjects)} />
              <PreviewRow label="Status" value={preview.status} />
            </dl>
            {blocked && <p className={cn("rounded-md border p-3", sectionToneClasses.warning.panel)}>Deletion unavailable: {preview.blockingReason === "TRANSCRIPT_PROCESSING" ? "transcript is currently processing" : preview.blockingReason}</p>}
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

function SegmentCard({ segment, speakerNames, speakerIndex, isLast, active, highlighted, edit, audioAvailable, editable, reviewable, segmentReviewSaving, refCallback, onPlay, onEdit, onCancel, onSave, onDraft, onToggleReview }: {
  segment: TranscriptSegment;
  speakerNames: Record<string, string>;
  speakerIndex: number;
  isLast: boolean;
  active: boolean;
  highlighted: boolean;
  edit: SegmentEditState;
  audioAvailable: boolean;
  editable: boolean;
  reviewable: boolean;
  segmentReviewSaving: boolean;
  refCallback: (element: HTMLDivElement | null) => void;
  onPlay: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDraft: (value: string) => void;
  onToggleReview: () => void;
}) {
  const textProps = transcriptTextProps(edit.editing ? edit.draft : segment.transcriptText);
  const displayName = getSpeakerDisplayName(segment.speaker, speakerNames);
  const marker = speakerMarker(segment.speaker, speakerNames[segment.speaker], speakerIndex);
  return (
    <div
      ref={refCallback}
      className={cn(
        "group relative overflow-visible rounded-xl bg-muted/25 px-3 py-3 transition-colors hover:bg-muted/40 sm:px-4",
        active && "bg-[var(--accent-transcript-bg)] ring-1 ring-[var(--accent-transcript-border)]",
        highlighted && "ring-2 ring-[var(--accent-warning-border)] ring-offset-2 ring-offset-background",
        segment.isReviewed && "border-l-4 border-l-[var(--accent-success)]",
      )}
    >
      <div className="grid min-w-0 grid-cols-[40px_minmax(0,1fr)] gap-3">
        <div className="relative flex justify-center">
          <div className={cn("z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1", marker.classes, active && "scale-105 ring-2")} title={displayName}>
            {marker.label}
          </div>
          {!isLast && <div className={cn("absolute bottom-[-1.125rem] left-1/2 top-10 -translate-x-1/2 border-l border-border", active && "border-[var(--accent-transcript-border)]")} aria-hidden="true" />}
        </div>

        <div className="min-w-0 space-y-2">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground" title={displayName}>{displayName}</h3>
            <p className="text-xs text-muted-foreground">{segment.speaker}</p>
          </div>
          {edit.editing ? (
            <Textarea value={edit.draft} onChange={(event) => onDraft(event.target.value)} rows={5} dir={textProps.dir} className={cn("min-h-32 bg-background text-base leading-8", textProps.className)} disabled={edit.saving} />
          ) : (
            <div dir={textProps.dir} className={cn("text-base leading-8 text-foreground md:text-lg", textProps.className)}>{segment.transcriptText || <span className="text-muted-foreground">No text yet</span>}</div>
          )}
          {edit.error && <p className="text-sm text-destructive">{edit.error}</p>}
          {edit.saved && <p className="flex items-center gap-1 text-sm text-[var(--accent-success)]"><Check className="h-4 w-4" /> Saved</p>}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{formatTimestamp(segment.startTime)} - {formatTimestamp(segment.endTime)} · {formatDuration(segment.startTime, segment.endTime)}</p>
            <div className="flex flex-wrap items-center gap-2">
              {reviewable && (
                <Button type="button" variant="ghost" size="sm" onClick={onToggleReview} disabled={segmentReviewSaving} className={cn("text-xs", segment.isReviewed ? "text-[var(--accent-success)]" : "text-muted-foreground")}>
                  {segment.isReviewed ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  {segment.isReviewed ? "Reviewed" : "Mark reviewed"}
                </Button>
              )}
              <StatusBadge status={segment.status} />
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
          </div>
        </div>
      </div>
    </div>
  );
}

const speakerMarkerClasses = [
  "bg-[var(--accent-transcript-bg)] text-[var(--accent-transcript)] ring-[var(--accent-transcript-border)]",
  "bg-[var(--accent-notification-bg)] text-[var(--accent-notification)] ring-[var(--accent-notification-border)]",
  "bg-[var(--accent-analysis-bg)] text-[var(--accent-analysis)] ring-[var(--accent-analysis-border)]",
  "bg-[var(--accent-folder-bg)] text-[var(--accent-folder)] ring-[var(--accent-folder-border)]",
  "bg-[var(--accent-admin-bg)] text-[var(--accent-admin)] ring-[var(--accent-admin-border)]",
  "bg-[var(--accent-neutral-bg)] text-[var(--accent-neutral)] ring-[var(--accent-neutral-border)]",
];

function speakerMarker(speakerKey: string, customDisplayName: string | undefined, speakerIndex: number) {
  const suffix = speakerKey.match(/(\d+)$/)?.[1];
  const index = suffix ? Number(suffix) : speakerIndex >= 0 ? speakerIndex : [...speakerKey].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return {
    classes: speakerMarkerClasses[index % speakerMarkerClasses.length],
    label: getSpeakerMarkerLabel(speakerKey, customDisplayName, speakerIndex),
  };
}

function getSpeakerMarkerLabel(speakerKey: string, customDisplayName: string | undefined, speakerIndex: number) {
  const trimmedName = customDisplayName?.trim();
  if (trimmedName) return speakerInitials(trimmedName);
  const suffix = speakerKey.match(/(\d+)$/)?.[1];
  if (suffix) return String(Number(suffix) + 1);
  return String(Math.max(0, speakerIndex) + 1);
}

function speakerInitials(value: string) {
  const words = value.replace(/_/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "1";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function emptySegmentsMessage(status: string) {
  if (isProcessingStatus(status)) return "Transcript is still processing.";
  if (status === "failed") return "Processing failed.";
  return "No segments found.";
}
