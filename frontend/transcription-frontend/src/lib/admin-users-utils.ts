import type { AdminUserSummary, AuthRole } from "@/lib/api/types";

export const adminUsersPageSize = 20;
export const adminRoleFilters = ["all", "user", "admin"] as const;
export const adminStatusFilters = ["all", "active", "inactive"] as const;

export type AdminRoleFilter = (typeof adminRoleFilters)[number];
export type AdminStatusFilter = (typeof adminStatusFilters)[number];

export function normalizeAdminPage(value: string | null) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function normalizeAdminSearch(value: string | null) {
  return (value ?? "").trim().slice(0, 120);
}

export function normalizeAdminRole(value: string | null): AdminRoleFilter {
  return value === "user" || value === "admin" ? value : "all";
}

export function normalizeAdminStatus(value: string | null): AdminStatusFilter {
  return value === "active" || value === "inactive" ? value : "all";
}

export function buildAdminUsersPath({ page = 1, search = "", role = "all", status = "all" }: { page?: number; search?: string; role?: AdminRoleFilter; status?: AdminStatusFilter }) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (search.trim()) params.set("search", search.trim());
  if (role !== "all") params.set("role", role);
  if (status !== "all") params.set("status", status);
  const query = params.toString();
  return `/Admin/Users${query ? `?${query}` : ""}`;
}

export function roleLabel(role: AuthRole) {
  return role === "admin" ? "Admin" : "User";
}

export function statusLabel(isActive: boolean) {
  return isActive ? "Active" : "Inactive";
}

export function formatAdminDate(value: string | null | undefined) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit" }).format(date);
}

export function validatePasswordConfirmation(password: string, confirmPassword: string) {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password !== confirmPassword) return "Passwords do not match.";
  return null;
}

export function canDeactivateUser(target: AdminUserSummary, currentUserId?: string) {
  return target.id !== currentUserId && target.isActive;
}

export function resultSummary(total: number, hasFilters: boolean) {
  if (total === 1) return hasFilters ? "1 match" : "1 user";
  return hasFilters ? `${total} matches` : `${total} users`;
}
