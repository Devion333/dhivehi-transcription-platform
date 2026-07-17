import { request } from "@/lib/api/client";
import type { AuditEventResponse, AuditListParams, AuditListResponse } from "@/lib/api/types";

export function getAuditEvents(params: AuditListParams, signal?: AbortSignal) {
  const query = new URLSearchParams();
  query.set("pageSize", String(params.pageSize ?? 50));
  if (params.page && params.page > 1) query.set("page", String(params.page));
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.category && params.category !== "all") query.set("category", params.category);
  if (params.outcome && params.outcome !== "all") query.set("outcome", params.outcome);
  if (params.action?.trim()) query.set("action", params.action.trim());
  if (params.resourceType?.trim()) query.set("resourceType", params.resourceType.trim());
  if (params.dateFrom?.trim()) query.set("dateFrom", params.dateFrom.trim());
  if (params.dateTo?.trim()) query.set("dateTo", params.dateTo.trim());
  return request<AuditListResponse>(`/api/admin/audit?${query.toString()}`, { signal });
}

export function getAuditEvent(eventId: string, signal?: AbortSignal) {
  return request<AuditEventResponse>(`/api/admin/audit/${encodeURIComponent(eventId)}`, { signal });
}
