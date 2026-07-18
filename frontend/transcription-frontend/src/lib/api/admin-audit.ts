import { request } from "@/lib/api/client";
import { BACKEND_URL } from "@/config";
import type { AuditEventResponse, AuditListParams, AuditListResponse } from "@/lib/api/types";

function auditQuery(params: AuditListParams, includePage: boolean) {
  const query = new URLSearchParams();
  if (includePage) {
    query.set("pageSize", String(params.pageSize ?? 50));
    if (params.page && params.page > 1) query.set("page", String(params.page));
  }
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.category && params.category !== "all") query.set("category", params.category);
  if (params.outcome && params.outcome !== "all") query.set("outcome", params.outcome);
  if (params.action?.trim()) query.set("action", params.action.trim());
  if (params.actorUserId?.trim()) query.set("actorUserId", params.actorUserId.trim());
  if (params.resourceType?.trim()) query.set("resourceType", params.resourceType.trim());
  if (params.dateFrom?.trim()) query.set("dateFrom", params.dateFrom.trim());
  if (params.dateTo?.trim()) query.set("dateTo", params.dateTo.trim());
  return query;
}

export function getAuditEvents(params: AuditListParams, signal?: AbortSignal) {
  const query = auditQuery(params, true);
  return request<AuditListResponse>(`/api/admin/audit?${query.toString()}`, { signal });
}

export function getAuditEvent(eventId: string, signal?: AbortSignal) {
  return request<AuditEventResponse>(`/api/admin/audit/${encodeURIComponent(eventId)}`, { signal });
}

export async function exportAuditEvents(params: AuditListParams, signal?: AbortSignal) {
  const query = auditQuery(params, false);
  const response = await fetch(`${BACKEND_URL}/api/admin/audit/export${query.toString() ? `?${query}` : ""}`, { credentials: "include", signal });
  if (!response.ok) throw new Error(response.status === 400 ? "Export is too large. Narrow the filters and try again." : "Audit export failed.");
  const blob = await response.blob();
  return { blob, filename: filenameFromContentDisposition(response.headers.get("Content-Disposition")) ?? "audit-events.csv" };
}

function filenameFromContentDisposition(value: string | null) {
  const match = value?.match(/filename="?([^";]+)"?/i);
  return match?.[1];
}
