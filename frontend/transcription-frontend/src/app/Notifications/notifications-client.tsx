"use client";

import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeading } from "@/components/ui/section-heading";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api/notifications";
import type { NotificationItem } from "@/lib/api/types";
import { sectionToneClasses } from "@/lib/section-styles";
import { cn } from "@/lib/utils";

export function NotificationsClient() {
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const pageSize = 10;

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listNotifications({ page, pageSize, unreadOnly }, controller.signal)
      .then((response) => {
        setItems(response.items);
        setTotal(response.total);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Notifications are unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, unreadOnly]);

  async function markOne(item: NotificationItem) {
    const response = await markNotificationRead(item.id);
    setItems((current) => current.map((candidate) => candidate.id === item.id ? response.notification : candidate));
  }

  async function markAll() {
    await markAllNotificationsRead();
    setItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() })));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        actions={<Button type="button" variant="outline" onClick={markAll} disabled={items.every((item) => item.isRead)}><CheckCheck className="h-4 w-4" /> Mark all read</Button>}
      />
      <div className="mb-4 rounded-lg border border-[var(--accent-notification-border)] bg-card p-3">
        <SectionHeading title="Workflow updates" description={`${total} notification${total === 1 ? "" : "s"}`} icon={Bell} tone="notification" />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant={!unreadOnly ? "default" : "outline"} onClick={() => { setUnreadOnly(false); setPage(1); }}>All</Button>
        <Button type="button" variant={unreadOnly ? "default" : "outline"} onClick={() => { setUnreadOnly(true); setPage(1); }}>Unread</Button>
      </div>
      {loading && <LoadingState label="Loading notifications" />}
      {error && <ErrorState title="Could not load notifications" description={error} onRetry={() => setPage((value) => value)} />}
      {!loading && !error && items.length === 0 && <EmptyState title="No notifications" description={unreadOnly ? "You have no unread notifications." : "Workflow notifications will appear here."} />}
      {!loading && !error && items.length > 0 && (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={cn(!item.isRead && "border-[var(--accent-notification-border)] bg-[var(--accent-notification-bg)]")}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{item.title}</h2>
                    {!item.isRead && <span className={cn("rounded-full border px-2 py-0.5 text-xs", sectionToneClasses.notification.panel)}>Unread</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.createdAt)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {!item.isRead && <Button type="button" variant="outline" size="sm" onClick={() => void markOne(item)}>Mark read</Button>}
                  <Button asChild size="sm"><Link href={notificationHref(item)}><ExternalLink className="h-4 w-4" /> Open</Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          <div className="flex items-center justify-between gap-3 pt-2 text-sm text-muted-foreground">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}

function notificationHref(item: NotificationItem) {
  const jobId = encodeURIComponent(item.resourceId);
  if (item.type === "analysis_completed" || item.type === "analysis_failed") return `/Transcripts/Analysis?job_id=${jobId}`;
  return `/Transcripts/Details?job_id=${jobId}`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
}
