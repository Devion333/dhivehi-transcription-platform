// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: admin-users.ts
// Description: API client for admin-users
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { request } from "@/lib/api/client";
import type {
  AdminUserListParams,
  AdminUserListResponse,
  AdminUserResponse,
  CreateAdminUserInput,
  ResetAdminUserPasswordInput,
  UpdateAdminUserInput,
} from "@/lib/api/types";

export function getAdminUsers(params: AdminUserListParams, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (params.page && params.page > 1) query.set("page", String(params.page));
  query.set("pageSize", String(params.pageSize ?? 20));
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.role && params.role !== "all") query.set("role", params.role);
  if (params.status && params.status !== "all") query.set("status", params.status);
  const suffix = query.toString();
  return request<AdminUserListResponse>(`/api/admin/users${suffix ? `?${suffix}` : ""}`, { signal });
}

export function getAdminUser(userId: string, signal?: AbortSignal) {
  return request<AdminUserResponse>(`/api/admin/users/${encodeURIComponent(userId)}`, { signal });
}

export function createAdminUser(input: CreateAdminUserInput) {
  return request<AdminUserResponse>("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateAdminUser(userId: string, input: UpdateAdminUserInput) {
  return request<AdminUserResponse>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function activateAdminUser(userId: string) {
  return request<AdminUserResponse>(`/api/admin/users/${encodeURIComponent(userId)}/activate`, { method: "POST" });
}

export function deactivateAdminUser(userId: string) {
  return request<AdminUserResponse>(`/api/admin/users/${encodeURIComponent(userId)}/deactivate`, { method: "POST" });
}

export function resetAdminUserPassword(userId: string, input: ResetAdminUserPasswordInput) {
  return request<{ message: string }>(`/api/admin/users/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
