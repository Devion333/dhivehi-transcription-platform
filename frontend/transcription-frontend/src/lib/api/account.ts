// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: account.ts
// Description: API client for account
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { request } from "./client";
import type { AccountActivityResponse } from "./types";

export function getAccountActivity(params: { page?: number; pageSize?: number } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return request<AccountActivityResponse>(`/api/account/activity?${query.toString()}`, { signal });
}
