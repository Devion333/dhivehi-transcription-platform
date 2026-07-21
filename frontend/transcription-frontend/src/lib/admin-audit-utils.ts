import { formatAuditAction } from "@/lib/format-audit-action";
import type { AuditCategory, AuditOutcome } from "@/lib/api/types";

export const auditPageSize = 50;
export const auditCategories = ["all", "authentication", "user_management", "job_management", "transcript", "analysis", "search", "export"] as const;
export const auditOutcomes = ["all", "success", "failure"] as const;

export type AuditCategoryFilter = (typeof auditCategories)[number];
export type AuditOutcomeFilter = (typeof auditOutcomes)[number];

const actionLabels = Object.fromEntries(
  [
    "auth.login_succeeded", "auth.login_failed", "auth.logout",
    "admin.user_created", "admin.user_updated", "admin.user_activated", "admin.user_deactivated",
    "admin.password_reset",
    "admin.job_retry_requested", "admin.job_retry_succeeded", "admin.job_retry_failed",
    "transcript.uploaded", "transcript.viewed", "transcript.segment_updated",
    "analysis.started", "analysis.completed", "analysis.failed",
    "search.executed",
    "export.pdf_generated", "export.pdf_failed",
  ].map((key) => [key, formatAuditAction(key)])
);

export const auditActions = ["all", ...Object.keys(actionLabels)] as const;
export type AuditActionFilter = (typeof auditActions)[number];

export function normalizeAuditPage(value: string | null) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function normalizeAuditSearch(value: string | null) {
  return (value ?? "").trim().slice(0, 120);
}

export function normalizeAuditCategory(value: string | null): AuditCategoryFilter {
  return auditCategories.includes(value as AuditCategoryFilter) ? value as AuditCategoryFilter : "all";
}

export function normalizeAuditOutcome(value: string | null): AuditOutcomeFilter {
  return auditOutcomes.includes(value as AuditOutcomeFilter) ? value as AuditOutcomeFilter : "all";
}

export function normalizeAuditAction(value: string | null): AuditActionFilter {
  return auditActions.includes(value as AuditActionFilter) ? value as AuditActionFilter : "all";
}

export function normalizeAuditDate(value: string | null) {
  if (!value) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function toRFC3339Date(value: string, endOfDay = false) {
  if (!value) return "";
  return `${value}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
}

export function buildAuditPath({ page = 1, search = "", category = "all", action = "all", outcome = "all", dateFrom = "", dateTo = "" }: { page?: number; search?: string; category?: AuditCategoryFilter; action?: AuditActionFilter; outcome?: AuditOutcomeFilter; dateFrom?: string; dateTo?: string }) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (search.trim()) params.set("search", search.trim());
  if (category !== "all") params.set("category", category);
  if (action !== "all") params.set("action", action);
  if (outcome !== "all") params.set("outcome", outcome);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const query = params.toString();
  return `/Admin/Audit${query ? `?${query}` : ""}`;
}

export function auditActionLabel(action: string) {
  return actionLabels[action] ?? formatAuditAction(action);
}

export function auditCategoryLabel(category: AuditCategory | string) {
  return category.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function auditOutcomeLabel(outcome: AuditOutcome | string) {
  return outcome === "success" ? "Success" : outcome === "failure" ? "Failure" : outcome;
}

export function formatAuditDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function auditActorLabel(actor: { name?: string; email?: string } | null) {
  if (!actor) return "System";
  return actor.name || actor.email || "Unknown";
}

export function auditResourceLabel(resourceType: string, resourceId: string) {
  if (!resourceType && !resourceId) return "-";
  return [resourceType, resourceId].filter(Boolean).join(" ");
}

export function metadataEntries(metadata: Record<string, unknown>) {
  return Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined && value !== "");
}
