import { request } from "./client";
import type { AccountActivityResponse } from "./types";

export function getAccountActivity(params: { page?: number; pageSize?: number } = {}, signal?: AbortSignal) {
  const query = new URLSearchParams();
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return request<AccountActivityResponse>(`/api/account/activity?${query.toString()}`, { signal });
}
