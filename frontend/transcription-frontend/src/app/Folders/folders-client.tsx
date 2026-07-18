"use client";

import { FolderPlus, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createFolder, listFolders } from "@/lib/api/folders";
import type { Folder, Pagination } from "@/lib/api/types";

export function FoldersClient() {
  const auth = useAuth();
  const [items, setItems] = React.useState<Folder[]>([]);
  const [pagination, setPagination] = React.useState<Pagination | null>(null);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listFolders({ page, pageSize: 20, search: query }, controller.signal)
      .then((response) => { setItems(response.items); setPagination(response.pagination); })
      .catch((err) => { if (!(err instanceof DOMException && err.name === "AbortError")) setError(err instanceof Error ? err.message : "Folders are unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [page, query, reload]);

  async function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await createFolder({ name, description });
      setName("");
      setDescription("");
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Folder could not be created");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Folders" description="Group related transcripts into cases or working folders." />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card><CardContent className="p-4"><form className="space-y-3" onSubmit={submitCreate}><h2 className="font-semibold">Create folder</h2><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Case 2026-014" maxLength={120} /><Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Related interview recordings" maxLength={500} /><Button type="submit" disabled={creating || !name.trim()}><FolderPlus className="h-4 w-4" /> Create</Button></form></CardContent></Card>
        <div>
          <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search folders" className="pl-9" /></div><Button type="submit" variant="outline">Search</Button></form>
          {loading && <LoadingState label="Loading folders" />}
          {error && <ErrorState title="Could not load folders" description={error} />}
          {!loading && !error && items.length === 0 && <EmptyState title="No folders" description="Create a folder to organize related transcripts." />}
          {!loading && !error && items.length > 0 && <div className="space-y-3">{items.map((folder) => <FolderRow key={folder.id} folder={folder} showOwner={auth.user?.role === "admin"} />)}{pagination && <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><Button variant="outline" size="sm" disabled={!pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>}</div>}
        </div>
      </div>
    </PageContainer>
  );
}

function FolderRow({ folder, showOwner }: { folder: Folder; showOwner: boolean }) {
  return <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><h2 className="break-words font-semibold">{folder.name}</h2>{folder.description && <p className="mt-1 text-sm text-muted-foreground">{folder.description}</p>}<p className="mt-1 text-xs text-muted-foreground">{folder.transcriptCount} transcript{folder.transcriptCount === 1 ? "" : "s"} · Updated {formatDate(folder.updatedAt)}{showOwner ? ` · Owner: ${folder.ownerDisplayName}` : ""}</p></div><Button asChild><Link href={`/Folders/Details?folder_id=${encodeURIComponent(folder.id)}`}>Open</Link></Button></CardContent></Card>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}
