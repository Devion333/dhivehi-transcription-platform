"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: folder-details-client.tsx
// Description: Frontend page or component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { ArrowLeft, FolderOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { reviewProgressBadgeClass, reviewProgressLabel } from "@/lib/analysis-review-status";
import { addTranscriptToFolder, deleteFolder, getFolder, removeTranscriptFromFolder, updateFolder } from "@/lib/api/folders";
import { getTranscripts } from "@/lib/api/transcripts";
import type { Folder, TranscriptSummary } from "@/lib/api/types";
import { withReturnTo } from "@/lib/navigation-utils";
import { sectionToneClasses } from "@/lib/section-styles";
import { transcriptReferenceLabel } from "@/lib/transcript-identity";
import { cn } from "@/lib/utils";

export function FolderDetailsClient() {
  const auth = useAuth();
  const router = useRouter();
  const folderId = (useSearchParams().get("folder_id") ?? "").trim();
  const currentPath = folderId ? `/Folders/Details?folder_id=${encodeURIComponent(folderId)}` : "/Folders";
  const [folder, setFolder] = React.useState<Folder | null>(null);
  const [transcripts, setTranscripts] = React.useState<TranscriptSummary[]>([]);
  const [eligible, setEligible] = React.useState<TranscriptSummary[]>([]);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selectedJobId, setSelectedJobId] = React.useState("");
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const [showRename, setShowRename] = React.useState(false);
  const [showAddTranscript, setShowAddTranscript] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(folderId));
  const [error, setError] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    if (!folderId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([getFolder(folderId, controller.signal), getTranscripts({ page: 1, pageSize: 100 }, controller.signal)])
      .then(([detail, list]) => {
        setFolder(detail.folder);
        setTranscripts(detail.transcripts);
        setName(detail.folder.name);
        setDescription(detail.folder.description);
        const inFolder = new Set(detail.transcripts.map((item) => item.jobId));
        setEligible(list.items.filter((item) => !item.folderId && !inFolder.has(item.jobId)));
      })
      .catch((err) => { if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "Folder is unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [folderId, reload]);

  async function saveFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folder) return;
    try { await updateFolder(folder.id, { name, description }); setShowRename(false); setReload((value) => value + 1); } catch (err) { setError(err instanceof Error ? err.message : "Folder could not be updated"); }
  }

  async function addTranscript() {
    if (!folder || !selectedJobId) return;
    try { await addTranscriptToFolder(folder.id, selectedJobId); setSelectedJobId(""); setShowAddTranscript(false); setReload((value) => value + 1); } catch (err) { setError(err instanceof Error ? err.message : "Transcript could not be added"); }
  }

  async function removeTranscript(jobId: string) {
    if (!folder) return;
    try { await removeTranscriptFromFolder(folder.id, jobId); setReload((value) => value + 1); } catch (err) { setError(err instanceof Error ? err.message : "Transcript could not be removed"); }
  }

  async function deleteEmptyFolder() {
    if (!folder || transcripts.length > 0 || !deleteArmed) return;
    try { await deleteFolder(folder.id); router.push("/Folders"); } catch (err) { setError(err instanceof Error ? err.message : "Folder could not be deleted"); }
  }

  if (!folderId) return <PageContainer><Back /><PageHeader title="Folder Details" /><EmptyState title="Missing folder" description="Open a folder from the folder list." /></PageContainer>;
  if (loading) return <PageContainer><Back /><PageHeader title="Folder Details" /><LoadingState label="Loading folder" /></PageContainer>;
  if (error && !folder) return <PageContainer><Back /><PageHeader title="Folder Details" /><ErrorState title="Could not load folder" description={error} /></PageContainer>;
  if (!folder) return null;

  return (
    <PageContainer>
      <div className="mb-1"><Back /></div>

      {/* Compact header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", sectionToneClasses.folder.icon)}>
              <FolderOpen className="h-4 w-4" />
            </span>
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{folder.name}</h1>
          </div>
          {folder.description && <p className="mt-1 text-sm text-muted-foreground">{folder.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {transcripts.length} transcript{transcripts.length === 1 ? "" : "s"}
            <span className="mx-1.5">Â·</span>
            Owner: {auth.user?.role === "admin" ? folder.ownerDisplayName : "You"}
            <span className="mx-1.5">Â·</span>
            Updated {formatDate(folder.updatedAt)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { setShowRename((v) => !v); setShowAddTranscript(false); setDeleteArmed(false); }}>
            <Pencil className="h-4 w-4" /> Rename
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setShowAddTranscript((v) => !v); setShowRename(false); setDeleteArmed(false); }}>
            <Plus className="h-4 w-4" /> Add transcript
          </Button>
          <Button size="sm" variant="outline" disabled={transcripts.length > 0} onClick={() => { setDeleteArmed((v) => !v); setShowRename(false); setShowAddTranscript(false); }}>
            <Trash2 className="h-4 w-4 text-destructive" /> Delete
          </Button>
        </div>
      </div>

      {error && <div className="mt-4"><ErrorState title="Folder action failed" description={error} /></div>}

      {/* Collapsible rename panel */}
      {showRename && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Rename folder</h2>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowRename(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            <form className="space-y-3" onSubmit={saveFolder}>
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Description (optional)" />
              <Button type="submit" size="sm">Save changes</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Collapsible add transcript panel */}
      {showAddTranscript && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Add transcript</h2>
              <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowAddTranscript(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="h-10 flex-1 rounded-md border bg-background px-3 text-sm" value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}>
                <option value="">Select transcript</option>
                {eligible.map((item) => <option key={item.jobId} value={item.jobId}>{transcriptReferenceLabel(item.referenceNumber)} - {item.filename}</option>)}
              </select>
              <Button type="button" size="sm" onClick={addTranscript} disabled={!selectedJobId}><Plus className="h-4 w-4" /> Add</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation */}
      {deleteArmed && (
        <Card className="mt-4 border-destructive/40">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-destructive">Delete folder</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {transcripts.length > 0
                    ? "Only empty folders can be deleted. Remove all transcripts first."
                    : "Are you sure you want to delete this empty folder?"}
                </p>
              </div>
              {transcripts.length === 0 && (
                <Button type="button" variant="destructive" size="sm" onClick={deleteEmptyFolder}>
                  <Trash2 className="h-4 w-4" /> Delete folder
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcripts section */}
      <section className="mt-6">
        {transcripts.length === 0 ? (
          <EmptyState title="No transcripts in this folder" description="Add transcripts using the button above." />
        ) : (
          <div className="space-y-2">
            {transcripts.map((item) => (
              <TranscriptRow key={item.jobId} item={item} currentPath={currentPath} onRemove={() => void removeTranscript(item.jobId)} />
            ))}
          </div>
        )}
      </section>
    </PageContainer>
  );
}

function TranscriptRow({ item, currentPath, onRemove }: { item: TranscriptSummary; currentPath: string; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:bg-accent/30">
      <div className="min-w-0 flex-1">
        <Link className="truncate text-sm font-medium hover:underline" href={withReturnTo(`/Transcripts/Details?job_id=${encodeURIComponent(item.jobId)}`, currentPath)}>
          {transcriptReferenceLabel(item.referenceNumber)}
        </Link>
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={item.filename}>{item.filename}</p>
      </div>
      <StatusBadge status={item.status} />
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${reviewProgressBadgeClass(item.reviewPercentage)}`}>
        {reviewProgressLabel(item.reviewedSegmentCount, item.totalSegmentCount, item.reviewPercentage)}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove transcript">Remove</Button>
    </div>
  );
}

function Back() {
  return <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2"><Link href="/Folders"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}
