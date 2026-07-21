"use client";

import { FolderOpen, FolderPlus, Search, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maintenanceMutationMessage, useMaintenanceAccess } from "@/hooks/use-maintenance-access";
import { ApiError } from "@/lib/api/client";
import { createFolder, listFolders } from "@/lib/api/folders";
import type { Folder, Pagination } from "@/lib/api/types";
import { sectionToneClasses } from "@/lib/section-styles";
import { cn } from "@/lib/utils";

export function FoldersClient() {
  const maintenance = useMaintenanceAccess();
  const [items, setItems] = React.useState<Folder[]>([]);
  const [pagination, setPagination] = React.useState<Pagination | null>(null);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
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
    if (!maintenance.canModifyDuringMaintenance) {
      setError("Changes are temporarily disabled during maintenance mode.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createFolder({ name, description });
      setName("");
      setDescription("");
      setShowCreate(false);
      setReload((value) => value + 1);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "maintenance_mode" ? "Changes are temporarily disabled during maintenance mode." : err instanceof Error ? err.message : "Folder could not be created");
    } finally {
      setCreating(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Folders" actions={
        <Button onClick={() => setShowCreate((v) => !v)} disabled={creating}>
          {showCreate ? <X className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
          {showCreate ? "Cancel" : "New Folder"}
        </Button>
      } />

      {showCreate && (
        <form onSubmit={submitCreate} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="folder-name">Name</label>
            <Input id="folder-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Folder name" maxLength={120} disabled={!maintenance.canModifyDuringMaintenance} />
          </div>
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="folder-description">Description</label>
            <Input id="folder-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional description" maxLength={500} disabled={!maintenance.canModifyDuringMaintenance} />
          </div>
          <Button type="submit" disabled={creating || !name.trim() || !maintenance.canModifyDuringMaintenance} title={!maintenance.canModifyDuringMaintenance ? maintenanceMutationMessage : undefined}>
            <FolderPlus className="h-4 w-4" /> Create
          </Button>
        </form>
      )}

      <form className="mb-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setQuery(search); }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search folders" className="pl-9" />
        </div>
        <Button type="submit" variant="outline">Search</Button>
      </form>

      {!maintenance.canModifyDuringMaintenance && (
        <p className="mb-4 rounded-md border bg-muted/30 p-2 text-sm text-muted-foreground">{maintenanceMutationMessage}</p>
      )}

      {loading && <LoadingState label="Loading folders" />}
      {error && <ErrorState title="Could not load folders" description={error} />}
      {!loading && !error && items.length === 0 && <EmptyState title="No folders" description="Create a folder to organize related transcripts." />}
      {!loading && !error && items.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((folder) => <FolderCard key={folder.id} folder={folder} />)}
          </div>
          {pagination && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>Page {pagination.page} of {Math.max(1, pagination.totalPages)}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                <Button variant="outline" size="sm" disabled={!pagination.hasNextPage} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}

function FolderCard({ folder }: { folder: Folder }) {
  return (
    <Link href={`/Folders/Details?folder_id=${encodeURIComponent(folder.id)}`} className="group block rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", sectionToneClasses.folder.icon)}>
          <FolderOpen className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold group-hover:underline">{folder.name}</p>
          {folder.description && <p className="mt-0.5 truncate text-sm text-muted-foreground">{folder.description}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {folder.transcriptCount} transcript{folder.transcriptCount === 1 ? "" : "s"}
            <span className="mx-1.5">·</span>
            Updated {formatDate(folder.updatedAt)}
          </p>
        </div>
      </div>
    </Link>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleDateString();
}
