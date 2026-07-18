import { request } from "./client";
import type { FolderDetailResponse, FolderListResponse, FolderResponse } from "./types";

export function listFolders(params: { page?: number; pageSize?: number; search?: string; ownerUserId?: string } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  if (params.search?.trim()) query.set("search", params.search.trim());
  if (params.ownerUserId?.trim()) query.set("ownerUserId", params.ownerUserId.trim());
  return request<FolderListResponse>(`/api/folders?${query.toString()}`, { signal });
}

export function createFolder(input: { name: string; description: string }, signal?: AbortSignal) {
  return request<FolderResponse>("/api/folders", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export function getFolder(folderId: string, signal?: AbortSignal) {
  return request<FolderDetailResponse>(`/api/folders/${encodeURIComponent(folderId)}`, { signal });
}

export function updateFolder(folderId: string, input: { name: string; description: string }, signal?: AbortSignal) {
  return request<FolderResponse>(`/api/folders/${encodeURIComponent(folderId)}`, { method: "PATCH", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
}

export function deleteFolder(folderId: string, signal?: AbortSignal) {
  return request<{ deleted: boolean }>(`/api/folders/${encodeURIComponent(folderId)}`, { method: "DELETE", signal });
}

export function addTranscriptToFolder(folderId: string, jobId: string, signal?: AbortSignal) {
  return request<{ added: boolean }>(`/api/folders/${encodeURIComponent(folderId)}/transcripts`, { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
}

export function removeTranscriptFromFolder(folderId: string, jobId: string, signal?: AbortSignal) {
  return request<{ removed: boolean }>(`/api/folders/${encodeURIComponent(folderId)}/transcripts/${encodeURIComponent(jobId)}`, { method: "DELETE", signal });
}
