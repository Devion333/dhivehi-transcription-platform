// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: admin-jobs.ts
// Description: API client for admin-jobs
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { request } from "@/lib/api/client";
import type { AdminJobHealthResponse, AdminJobListParams, AdminJobListResponse, AdminJobResponse, AdminJobRetryInput, AdminJobRetryResponse } from "@/lib/api/types";

export function getAdminJobs(params: AdminJobListParams, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.page && params.page > 1) query.set("page", String(params.page));
  query.set("pageSize", String(params.pageSize ?? 20));
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.status?.trim() && params.status !== "all") query.set("status", params.status.trim());
  if (params.stage?.trim() && params.stage !== "all") query.set("stage", params.stage.trim());
  if (params.failedOnly) query.set("failedOnly", "true");
  if (params.dateFrom?.trim()) query.set("dateFrom", params.dateFrom.trim());
  if (params.dateTo?.trim()) query.set("dateTo", params.dateTo.trim());
  const suffix = query.toString();
  return request<AdminJobListResponse>(`/api/admin/jobs${suffix ? `?${suffix}` : ""}`, { signal });
}

export function getAdminJob(jobId: string, signal?: AbortSignal) {
  return request<AdminJobResponse>(`/api/admin/jobs/${encodeURIComponent(jobId)}`, { signal });
}

export function retryAdminJob(jobId: string, input: AdminJobRetryInput = {}) {
  return request<AdminJobRetryResponse>(`/api/admin/jobs/${encodeURIComponent(jobId)}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getAdminJobHealth(signal?: AbortSignal) {
  return request<AdminJobHealthResponse>("/api/admin/jobs/health", { signal });
}
