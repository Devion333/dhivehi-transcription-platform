import { request } from "./client";
import type { NotificationListResponse, NotificationReadAllResponse, NotificationReadResponse, NotificationUnreadCountResponse } from "./types";

export function listNotifications(params: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 10));
  if (params.unreadOnly) query.set("unreadOnly", "true");
  return request<NotificationListResponse>(`/api/notifications?${query.toString()}`, { signal });
}

export function getNotificationUnreadCount(signal?: AbortSignal) {
  return request<NotificationUnreadCountResponse>("/api/notifications/unread-count", { signal });
}

export function markNotificationRead(notificationId: string, signal?: AbortSignal) {
  return request<NotificationReadResponse>(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: "POST", signal });
}

export function markAllNotificationsRead(signal?: AbortSignal) {
  return request<NotificationReadAllResponse>("/api/notifications/read-all", { method: "POST", signal });
}
