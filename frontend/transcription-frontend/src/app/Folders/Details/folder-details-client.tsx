"use client";

import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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
import { addTranscriptToFolder, deleteFolder, getFolder, removeTranscriptFromFolder, updateFolder } from "@/lib/api/folders";
import { getTranscripts } from "@/lib/api/transcripts";
import type { Folder, TranscriptSummary } from "@/lib/api/types";

export function FolderDetailsClient() {
  const auth = useAuth();
  const router = useRouter();
  const folderId = (useSearchParams().get("folder_id") ?? "").trim();
  const [folder, setFolder] = React.useState<Folder | null>(null);
  const [transcripts, setTranscripts] = React.useState<TranscriptSummary[]>([]);
  const [eligible, setEligible] = React.useState<TranscriptSummary[]>([]);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [selectedJobId, setSelectedJobId] = React.useState("");
  const [deleteArmed, setDeleteArmed] = React.useState(false);
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
    try { await updateFolder(folder.id, { name, description }); setReload((value) => value + 1); } catch (err) { setError(err instanceof Error ? err.message : "Folder could not be updated"); }
  }

  async function addTranscript() {
    if (!folder || !selectedJobId) return;
    try { await addTranscriptToFolder(folder.id, selectedJobId); setSelectedJobId(""); setReload((value) => value + 1); } catch (err) { setError(err instanceof Error ? err.message : "Transcript could not be added"); }
  }

  async function removeTranscript(jobId: string) {
    if (!folder) return;
    try { await removeTranscriptFromFolder(folder.id, jobId); setReload((value) => value + 1); } catch (err) { setError(err instanceof Error ? err.message : "Transcript could not be removed"); }
  }

  async function deleteEmptyFolder() {
    if (!folder || transcripts.length > 0 || !deleteArmed) return;
    try { await deleteFolder(folder.id); router.push("/Folders"); } catch (err) { setError(err instanceof Error ? err.message : "Folder could not be deleted"); }
  }

  if (!folderId) return <PageContainer><PageHeader title="Folder Details" actions={<Back />} /><EmptyState title="Missing folder" description="Open a folder from the folder list." /></PageContainer>;
  if (loading) return <PageContainer><PageHeader title="Folder Details" actions={<Back />} /><LoadingState label="Loading folder" /></PageContainer>;
  if (error && !folder) return <PageContainer><PageHeader title="Folder Details" actions={<Back />} /><ErrorState title="Could not load folder" description={error} /></PageContainer>;
  if (!folder) return null;

  return (
    <PageContainer>
      <PageHeader title={folder.name} description={folder.description || "No description"} actions={<Back />} />
      {error && <div className="mb-4"><ErrorState title="Folder action failed" description={error} /></div>}
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card><CardContent className="space-y-3 p-4"><p className="text-sm text-muted-foreground">Owner: {auth.user?.role === "admin" ? folder.ownerDisplayName : "You"}</p><p className="text-sm text-muted-foreground">{transcripts.length} transcript{transcripts.length === 1 ? "" : "s"}</p></CardContent></Card>
          <Card><CardContent className="p-4"><form className="space-y-3" onSubmit={saveFolder}><h2 className="font-semibold">Rename folder</h2><Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /><Textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /><Button type="submit">Save changes</Button></form></CardContent></Card>
          <Card><CardContent className="space-y-3 p-4"><h2 className="font-semibold">Add transcript</h2><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)}><option value="">Select transcript</option>{eligible.map((item) => <option key={item.jobId} value={item.jobId}>{item.filename}</option>)}</select><Button type="button" onClick={addTranscript} disabled={!selectedJobId}><Plus className="h-4 w-4" /> Add</Button></CardContent></Card>
          <Card className="border-destructive/40"><CardContent className="space-y-3 p-4"><h2 className="font-semibold">Delete folder</h2><p className="text-sm text-muted-foreground">Only empty folders can be deleted. Transcripts are never deleted with a folder.</p><Button type="button" variant="outline" disabled={transcripts.length > 0} onClick={() => setDeleteArmed(true)}>Prepare deletion</Button><Button type="button" variant="destructive" disabled={!deleteArmed || transcripts.length > 0} onClick={deleteEmptyFolder}><Trash2 className="h-4 w-4" /> Delete empty folder</Button></CardContent></Card>
        </aside>
        <section className="space-y-3">
          {transcripts.length === 0 ? <EmptyState title="No transcripts in this folder" /> : transcripts.map((item) => <Card key={item.jobId}><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-semibold"><Link className="hover:underline" href={`/Transcripts/Details?job_id=${encodeURIComponent(item.jobId)}`}>{item.filename}</Link></h2><p className="mt-1 text-sm text-muted-foreground">{item.referenceNumber || "No reference"}</p><div className="mt-2"><StatusBadge status={item.status} /></div></div><Button type="button" variant="outline" onClick={() => void removeTranscript(item.jobId)}>Remove</Button></CardContent></Card>)}
        </section>
      </div>
    </PageContainer>
  );
}

function Back() {
  return <Button asChild variant="outline"><Link href="/Folders"><ArrowLeft className="h-4 w-4" /> Folders</Link></Button>;
}
