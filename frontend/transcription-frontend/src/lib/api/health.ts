import { request } from "./client";
import type { HealthResponse } from "./types";

export function getHealth(signal?: AbortSignal) {
  return request<HealthResponse>("/api/health", { signal });
}
