"use client";

import { ArrowLeft, BarChart3, Check, Edit3, FileDown, Loader2, Pause, Play, RefreshCcw, RotateCcw, RotateCw, Save, Volume1, Volume2, VolumeX, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { PdfExportDialog } from "@/components/transcripts/pdf-export-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getTranscript, getTranscriptAnalysis, updateSegment } from "@/lib/api/transcripts";
import type { TranscriptAnalysis, TranscriptDetail, TranscriptSegment } from "@/lib/api/types";
import {
  formatDetailDate,
  formatDuration,
  formatTimestamp,
  isProcessingStatus,
  safeValue,
  sortSegments,
  speakerLabel,
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

export function TranscriptDetailsClient() {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const jobId = (searchParams.get("job_id") ?? "").trim();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const stopAtRef = React.useRef<number | null>(null);
  const [detail, setDetail] = React.useState<TranscriptDetail | null>(null);
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
  const [edits, setEdits] = React.useState<Record<string, SegmentEditState>>({});
  const [exportOpen, setExportOpen] = React.useState(false);
  const [exportAnalysis, setExportAnalysis] = React.useState<TranscriptAnalysis | null>(null);

  React.useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getTranscript(jobId, controller.signal)
      .then((response) => {
        const ordered = { ...response, segments: sortSegments(response.segments) };
        setDetail(ordered);
        setEdits(Object.fromEntries(ordered.segments.map((segment) => [segment.id, initialEditState(segment.transcriptText)])));
        setAudioReady(false);
        setAudioError(null);
        setCurrentTime(0);
        setDuration(0);
        setActiveSegmentId(null);
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

  return (
    <PageContainer>
      <PageHeader
        title={detail.filename}
        actions={
          <>
            <BackToList />
            <Button type="button" variant="outline" onClick={() => setExportOpen(true)} disabled={detail.segments.length === 0}><FileDown className="h-4 w-4" /> Export PDF</Button>
            <Button asChild variant="outline"><Link href={analysisHref}><BarChart3 className="h-4 w-4" /> {detail.analysisStatus === "complete" ? "View analysis" : "Analyse"}</Link></Button>
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
        onToggle={togglePlayback}
        onSeek={seek}
        onSkip={skip}
        onVolume={changeVolume}
        onToggleMute={toggleMute}
        onRate={setPlaybackRate}
      />

      <div className="mt-6 grid min-w-0 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <MetadataCard detail={detail} isAdmin={isAdmin} />
        </aside>

        <section className="min-w-0 space-y-4">
          {isProcessingStatus(detail.status) && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
              <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
                Transcript is still processing.
              </CardContent>
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
                  active={activeSegmentId === segment.id}
                  edit={edits[segment.id] ?? initialEditState(segment.transcriptText)}
                  audioAvailable={Boolean(detail.mediaUrl) && !audioError}
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

function BackToList() {
  return <Button asChild variant="outline"><Link href="/Transcripts"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>;
}

function MetadataCard({ detail, isAdmin }: { detail: TranscriptDetail; isAdmin: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Metadata</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2"><StatusBadge status={detail.status} /><StatusBadge status={detail.analysisStatus} /></div>
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

function ownerLabel(detail: Pick<TranscriptDetail, "ownerDisplayName" | "ownerEmail" | "ownerUserId">) {
  return detail.ownerDisplayName || detail.ownerEmail || detail.ownerUserId || "Legacy ownerless";
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-b pb-2 last:border-b-0"><span className="text-muted-foreground">{label}</span><span className="text-right font-medium">{value}</span></div>;
}

function AudioCard({ mediaUrl, playing, audioReady, audioError, currentTime, duration, volume, playbackRate, onToggle, onSeek, onSkip, onVolume, onToggleMute, onRate }: {
  mediaUrl: string;
  playing: boolean;
  audioReady: boolean;
  audioError: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
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

function SegmentCard({ segment, active, edit, audioAvailable, onPlay, onEdit, onCancel, onSave, onDraft }: {
  segment: TranscriptSegment;
  active: boolean;
  edit: SegmentEditState;
  audioAvailable: boolean;
  onPlay: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDraft: (value: string) => void;
}) {
  const textProps = transcriptTextProps(edit.editing ? edit.draft : segment.transcriptText);
  return (
    <Card className={cn(active && "border-primary shadow-sm")}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{speakerLabel(segment.speaker)}</CardTitle>
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
            <Button type="button" variant="ghost" size="sm" onClick={onEdit}><Edit3 className="h-4 w-4" /> Edit text</Button>
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
