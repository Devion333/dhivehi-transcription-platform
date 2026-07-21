"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: transcript-reassignment-dialog.tsx
// Description: Transcript component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { Loader2, X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/client";
import { getTranscriptReassignmentOptions, reassignTranscript } from "@/lib/api/transcripts";
import type { AdminUserSummary, TranscriptReassignmentResponse } from "@/lib/api/types";
import { sectionToneClasses } from "@/lib/section-styles";
import { cn } from "@/lib/utils";

export type TranscriptOwner = {
  userId: string;
  displayName: string;
  email: string;
};

export function TranscriptReassignmentDialog({
  jobId,
  filename,
  currentOwner,
  open,
  onOpenChange,
  onReassigned,
}: {
  jobId: string;
  filename: string;
  currentOwner: TranscriptOwner;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReassigned: (response: TranscriptReassignmentResponse, newOwnerUserId: string) => void;
}) {
  const [users, setUsers] = React.useState<AdminUserSummary[]>([]);
  const [search, setSearch] = React.useState("");
  const [selectedOwnerId, setSelectedOwnerId] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const hasOwner = Boolean(currentOwner.userId);

  const loadOptions = React.useCallback((signal?: AbortSignal) => {
    const controller = new AbortController();
    setUsers([]);
    setError(null);
    setLoading(true);
    getTranscriptReassignmentOptions(jobId, signal ?? controller.signal)
      .then((response) => setUsers(response.users))
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(reassignmentErrorMessage(err));
      })
      .finally(() => {
        if (!(signal ?? controller.signal).aborted) setLoading(false);
      });
    return controller;
  }, [jobId]);

  React.useEffect(() => {
    if (!open) return;
    setSearch("");
    setSelectedOwnerId("");
    const controller = loadOptions();
    return () => controller.abort();
  }, [loadOptions, open]);

  async function submit() {
    if (submitting || loading || !selectedOwnerId || selectedOwnerId === currentOwner.userId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await reassignTranscript(jobId, selectedOwnerId);
      onReassigned(response, selectedOwnerId);
      onOpenChange(false);
    } catch (err) {
      setError(reassignmentErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const filtered = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase().trim()));
  const title = hasOwner ? "Reassign transcript" : "Assign transcript";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-xl" role="dialog" aria-modal="true" aria-label={title}>
        <div className="shrink-0 px-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{title}</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground" title={filename}>{filename}</p>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting} aria-label="Close"><X className="h-4 w-4" /></Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm">
          <div className="rounded-lg border p-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current owner</p>
            <p className="mt-1 font-medium">{hasOwner ? ownerLabel(currentOwner) : "No owner assigned"}</p>
            {currentOwner.email && <p className="break-all text-xs text-muted-foreground">{currentOwner.email}</p>}
          </div>
          {hasOwner && <p className={cn("rounded-lg border px-3 py-2 text-xs", sectionToneClasses.warning.panel)}>The previous owner loses standard access after reassignment. Administrators retain access.</p>}
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search active users" disabled={loading || submitting} />
          <div className="max-h-64 overflow-y-auto rounded-lg border p-1">
            {loading ? <p className="p-3 text-muted-foreground">Loading users...</p> : error ? <div className="space-y-2 p-3"><p className="text-destructive">{error}</p><Button type="button" variant="outline" size="sm" onClick={() => loadOptions()} disabled={loading}>Retry</Button></div> : filtered.length === 0 ? <p className="p-3 text-muted-foreground">No active users found.</p> : filtered.map((user) => {
              const current = user.id === currentOwner.userId;
              return (
                <label key={user.id} className={cn("flex cursor-pointer items-start gap-3 rounded-md p-2", current ? "cursor-not-allowed opacity-50" : "hover:bg-muted")}>
                  <input type="radio" name="new-owner" value={user.id} checked={selectedOwnerId === user.id} disabled={current || submitting} onChange={() => setSelectedOwnerId(user.id)} className="mt-1" />
                  <span className="min-w-0"><span className="block font-medium">{user.name}{current ? " (current owner)" : ""}</span><span className="block break-all text-xs text-muted-foreground">{user.email}</span></span>
                </label>
              );
            })}
          </div>
          {error && !loading && users.length > 0 && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={submitting || loading || !selectedOwnerId || selectedOwnerId === currentOwner.userId}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {hasOwner ? "Reassign" : "Assign"}</Button>
        </div>
      </div>
    </div>
  );
}

function ownerLabel(owner: TranscriptOwner) {
  return owner.displayName || owner.email || owner.userId || "Legacy ownerless";
}

function reassignmentErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "TARGET_USER_NOT_FOUND") return "The selected user was not found.";
    if (error.code === "TARGET_USER_INACTIVE") return "The selected user is inactive.";
    if (error.code === "TRANSCRIPT_OWNER_UNCHANGED") return "This transcript is already assigned to that user.";
    if (error.status === 403) return "Only administrators can reassign transcripts.";
    return error.message;
  }
  return "Transcript reassignment failed.";
}
