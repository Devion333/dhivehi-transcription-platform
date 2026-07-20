import { request } from "@/lib/api/client";
import type { AdminSystemSettingsResponse, PublicSystemSettings, SystemSettings } from "@/lib/api/types";

export function getPublicSystemSettings(signal?: AbortSignal) {
  return request<PublicSystemSettings>("/api/settings/public", { signal });
}

export function getAdminSystemSettings(signal?: AbortSignal) {
  return request<SystemSettings>("/api/admin/settings", { signal });
}

export function updateAdminSystemSettings(settings: SystemSettings) {
  return request<AdminSystemSettingsResponse>("/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

export function restoreDefaultSystemSettings() {
  return request<AdminSystemSettingsResponse>("/api/admin/settings/restore-defaults", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
}
