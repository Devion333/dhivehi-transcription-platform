"use client";

import { ChevronLeft, ChevronRight, Plus, Search, Shield, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState, ErrorState, LoadingState } from "@/components/app/states";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  activateAdminUser,
  createAdminUser,
  deactivateAdminUser,
  getAdminUsers,
  resetAdminUserPassword,
  updateAdminUser,
} from "@/lib/api/admin-users";
import { ApiError } from "@/lib/api/client";
import type { AdminUserSummary, AuthRole, Pagination } from "@/lib/api/types";
import {
  adminRoleFilters,
  adminStatusFilters,
  adminUsersPageSize,
  buildAdminUsersPath,
  canDeactivateUser,
  formatAdminDate,
  normalizeAdminPage,
  normalizeAdminRole,
  normalizeAdminSearch,
  normalizeAdminStatus,
  resultSummary,
  roleLabel,
  statusLabel,
  validatePasswordConfirmation,
} from "@/lib/admin-users-utils";

type ListState = { items: AdminUserSummary[]; pagination: Pagination | null };
type DialogState =
  | { type: "create" }
  | { type: "edit"; user: AdminUserSummary }
  | { type: "reset"; user: AdminUserSummary }
  | { type: "deactivate"; user: AdminUserSummary }
  | null;

export function AdminUsersClient() {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const page = normalizeAdminPage(searchParams.get("page"));
  const search = normalizeAdminSearch(searchParams.get("search"));
  const role = normalizeAdminRole(searchParams.get("role"));
  const status = normalizeAdminStatus(searchParams.get("status"));
  const [searchDraft, setSearchDraft] = React.useState(search);
  const [data, setData] = React.useState<ListState>({ items: [], pagination: null });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [retryToken, setRetryToken] = React.useState(0);

  React.useEffect(() => setSearchDraft(search), [search]);

  const loadKey = `${page}:${search}:${role}:${status}:${retryToken}`;
  React.useEffect(() => {
    if (auth.user?.role !== "admin") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    getAdminUsers({ page, pageSize: adminUsersPageSize, search, role, status }, controller.signal)
      .then((response) => setData({ items: response.items, pagination: response.pagination }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(adminErrorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [auth.user?.role, loadKey, page, role, search, status]);

  function navigate(next: { page?: number; search?: string; role?: typeof role; status?: typeof status }) {
    router.push(buildAdminUsersPath({ page, search, role, status, ...next }));
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({ page: 1, search: searchDraft });
  }

  function clearFilters() {
    router.push(pathname);
  }

  function upsertUser(user: AdminUserSummary) {
    setData((current) => ({ ...current, items: current.items.map((item) => item.id === user.id ? user : item) }));
  }

  function reload() {
    setRetryToken((value) => value + 1);
  }

  async function activate(user: AdminUserSummary) {
    setMessage(null);
    try {
      const response = await activateAdminUser(user.id);
      upsertUser(response.user);
      setMessage("User activated");
    } catch (err) {
      setMessage(adminErrorMessage(err));
    }
  }

  const pagination = data.pagination;
  const total = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  const hasFilters = Boolean(search || role !== "all" || status !== "all");

  return (
    <PageContainer>
      <PageHeader title="Users" actions={<Button onClick={() => setDialog({ type: "create" })}><Plus className="h-4 w-4" /> Add user</Button>} />

      <Card className="mb-5">
        <CardContent className="p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto] lg:items-end">
            <form onSubmit={submitSearch} className="grid gap-2">
              <label htmlFor="admin-user-search" className="text-sm font-medium">Search</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="admin-user-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Name or email" className="pl-9" />
                </div>
                <Button type="submit" variant="outline">Search</Button>
              </div>
            </form>
            <FilterSelect id="admin-role-filter" label="Role" value={role} values={adminRoleFilters} onChange={(value) => navigate({ page: 1, role: value as typeof role })} />
            <FilterSelect id="admin-status-filter" label="Status" value={status} values={adminStatusFilters} onChange={(value) => navigate({ page: 1, status: value as typeof status })} />
            <Button type="button" variant="ghost" onClick={clearFilters} disabled={!hasFilters}><X className="h-4 w-4" /> Clear</Button>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{loading ? "Refreshing" : resultSummary(total, hasFilters)}</p>
        </CardContent>
      </Card>

      {message && <div className="mb-4 rounded-lg border bg-card px-4 py-3 text-sm">{message}</div>}
      {loading && <LoadingState label="Loading users" />}
      {!loading && error && <ErrorState title="Could not load users" description={error} onRetry={reload} />}
      {!loading && !error && data.items.length === 0 && (hasFilters ? <EmptyState title="No matching users" /> : <EmptyState title="No users" />)}
      {!loading && !error && data.items.length > 0 && (
        <>
          <UserTable items={data.items} currentUserId={auth.user?.id} onEdit={(user) => setDialog({ type: "edit", user })} onReset={(user) => setDialog({ type: "reset", user })} onActivate={activate} onDeactivate={(user) => setDialog({ type: "deactivate", user })} />
          <UserCards items={data.items} currentUserId={auth.user?.id} onEdit={(user) => setDialog({ type: "edit", user })} onReset={(user) => setDialog({ type: "reset", user })} onActivate={activate} onDeactivate={(user) => setDialog({ type: "deactivate", user })} />
        </>
      )}

      {pagination && totalPages > 0 && !loading && !error && (
        <nav className="mt-6 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="User pagination">
          <p className="text-sm text-muted-foreground">Page {pagination.page} of {Math.max(totalPages, 1)} - {pagination.total} total</p>
          <div className="flex gap-2">
            <Button asChild variant="outline" aria-disabled={pagination.page <= 1} className={pagination.page <= 1 ? "pointer-events-none opacity-50" : ""}>
              <Link href={buildAdminUsersPath({ page: pagination.page - 1, search, role, status })}><ChevronLeft className="h-4 w-4" /> Previous</Link>
            </Button>
            <Button asChild variant="outline" aria-disabled={!pagination.hasNextPage} className={!pagination.hasNextPage ? "pointer-events-none opacity-50" : ""}>
              <Link href={buildAdminUsersPath({ page: pagination.page + 1, search, role, status })}>Next <ChevronRight className="h-4 w-4" /></Link>
            </Button>
          </div>
        </nav>
      )}

      {dialog?.type === "create" && <CreateUserDialog onClose={() => setDialog(null)} onCreated={(user) => { setDialog(null); setMessage("User created"); reload(); upsertUser(user); }} />}
      {dialog?.type === "edit" && <EditUserDialog user={dialog.user} currentUserId={auth.user?.id} refreshCurrentUser={auth.refreshUser} onClose={() => setDialog(null)} onUpdated={(user) => { setDialog(null); setMessage("User updated"); upsertUser(user); }} />}
      {dialog?.type === "reset" && <ResetPasswordDialog user={dialog.user} currentUserId={auth.user?.id} onClose={() => setDialog(null)} onReset={async () => { setDialog(null); setMessage("Password updated"); if (dialog.user.id === auth.user?.id) await auth.refreshUser(); }} />}
      {dialog?.type === "deactivate" && <DeactivateDialog user={dialog.user} onClose={() => setDialog(null)} onDeactivated={(user) => { setDialog(null); setMessage("User deactivated"); upsertUser(user); }} />}
    </PageContainer>
  );
}

function FilterSelect({ id, label, value, values, onChange }: { id: string; label: string; value: string; values: readonly string[]; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        {values.map((item) => <option key={item} value={item}>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</option>)}
      </select>
    </div>
  );
}

function UserTable({ items, currentUserId, onEdit, onReset, onActivate, onDeactivate }: UserActionsProps) {
  return (
    <Card className="hidden overflow-hidden lg:block">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Last login</th><th className="px-4 py-3">Created</th><th className="px-4 py-3 text-right">Actions</th></tr>
        </thead>
        <tbody className="divide-y">
          {items.map((user) => <tr key={user.id} className="bg-card"><td className="px-4 py-4 font-medium">{user.name}</td><td className="px-4 py-4 text-muted-foreground">{user.email}</td><td className="px-4 py-4"><RoleBadge role={user.role} /></td><td className="px-4 py-4"><StatusBadge active={user.isActive} /></td><td className="px-4 py-4 text-muted-foreground">{formatAdminDate(user.lastLoginAt)}</td><td className="px-4 py-4 text-muted-foreground">{formatAdminDate(user.createdAt)}</td><td className="px-4 py-4"><ActionButtons user={user} currentUserId={currentUserId} onEdit={onEdit} onReset={onReset} onActivate={onActivate} onDeactivate={onDeactivate} /></td></tr>)}
        </tbody>
      </table>
    </Card>
  );
}

function UserCards(props: UserActionsProps) {
  return <div className="grid gap-3 lg:hidden">{props.items.map((user) => <Card key={user.id}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-base">{user.name}</CardTitle><p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p></div><Shield className="h-5 w-5 text-muted-foreground" /></div></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap gap-2"><RoleBadge role={user.role} /><StatusBadge active={user.isActive} /></div><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Last login</dt><dd>{formatAdminDate(user.lastLoginAt)}</dd></div><div><dt className="text-muted-foreground">Created</dt><dd>{formatAdminDate(user.createdAt)}</dd></div></dl><ActionButtons user={user} currentUserId={props.currentUserId} onEdit={props.onEdit} onReset={props.onReset} onActivate={props.onActivate} onDeactivate={props.onDeactivate} mobile /></CardContent></Card>)}</div>;
}

type UserActionsProps = { items: AdminUserSummary[]; currentUserId?: string; onEdit: (user: AdminUserSummary) => void; onReset: (user: AdminUserSummary) => void; onActivate: (user: AdminUserSummary) => void; onDeactivate: (user: AdminUserSummary) => void };

function ActionButtons({ user, currentUserId, onEdit, onReset, onActivate, onDeactivate, mobile }: Omit<UserActionsProps, "items"> & { user: AdminUserSummary; mobile?: boolean }) {
  return <div className={mobile ? "grid grid-cols-2 gap-2" : "flex justify-end gap-2"}><Button size="sm" variant="outline" onClick={() => onEdit(user)}>Edit</Button><Button size="sm" variant="outline" onClick={() => onReset(user)}>Reset password</Button>{user.isActive ? <Button size="sm" variant="outline" disabled={!canDeactivateUser(user, currentUserId)} onClick={() => onDeactivate(user)}>Deactivate</Button> : <Button size="sm" variant="outline" onClick={() => onActivate(user)}>Activate</Button>}</div>;
}

function RoleBadge({ role }: { role: AuthRole }) {
  return <Badge variant={role === "admin" ? "default" : "secondary"}>{roleLabel(role)}</Badge>;
}

function StatusBadge({ active }: { active: boolean }) {
  return <Badge variant={active ? "secondary" : "outline"}>{statusLabel(active)}</Badge>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"><div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl" role="dialog" aria-modal="true" aria-label={title}><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">{title}</h2><Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></Button></div>{children}</div></div>;
}

function CreateUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (user: AdminUserSummary) => void }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<AuthRole>("user");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const passwordError = validatePasswordConfirmation(password, confirm);
    if (passwordError) return setError(passwordError);
    setSaving(true); setError(null);
    try { const response = await createAdminUser({ name, email, role, password }); setPassword(""); setConfirm(""); onCreated(response.user); } catch (err) { setError(adminErrorMessage(err)); } finally { setSaving(false); }
  }
  return <Modal title="Add user" onClose={onClose}><form onSubmit={submit} className="space-y-4"><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></Field><Field label="Email"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></Field><RoleSelect value={role} onChange={setRole} /><Field label="Temporary password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></Field><Field label="Confirm password"><Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required autoComplete="new-password" /></Field>{error && <p className="text-sm text-destructive">{error}</p>}<DialogActions onClose={onClose} saving={saving} submitLabel="Create" /></form></Modal>;
}

function EditUserDialog({ user, currentUserId, refreshCurrentUser, onClose, onUpdated }: { user: AdminUserSummary; currentUserId?: string; refreshCurrentUser: () => Promise<unknown>; onClose: () => void; onUpdated: (user: AdminUserSummary) => void }) {
  const [name, setName] = React.useState(user.name);
  const [role, setRole] = React.useState<AuthRole>(user.role);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    try { const response = await updateAdminUser(user.id, { name, role }); if (user.id === currentUserId) await refreshCurrentUser(); onUpdated(response.user); } catch (err) { setError(adminErrorMessage(err)); } finally { setSaving(false); }
  }
  return <Modal title="Edit user" onClose={onClose}><form onSubmit={submit} className="space-y-4"><Field label="Email"><Input value={user.email} readOnly /></Field><Field label="Name"><Input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></Field><RoleSelect value={role} onChange={setRole} />{error && <p className="text-sm text-destructive">{error}</p>}<DialogActions onClose={onClose} saving={saving} submitLabel="Save" /></form></Modal>;
}

function ResetPasswordDialog({ user, currentUserId, onClose, onReset }: { user: AdminUserSummary; currentUserId?: string; onClose: () => void; onReset: () => void }) {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const passwordError = validatePasswordConfirmation(password, confirm);
    if (passwordError) return setError(passwordError);
    setSaving(true); setError(null);
    try { await resetAdminUserPassword(user.id, { newPassword: password }); setPassword(""); setConfirm(""); onReset(); } catch (err) { setError(adminErrorMessage(err)); } finally { setSaving(false); }
  }
  return <Modal title="Reset password" onClose={onClose}><form onSubmit={submit} className="space-y-4"><p className="text-sm text-muted-foreground">{user.id === currentUserId ? "You will need to sign in again." : "The user will be signed out."}</p><Field label="New password"><Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></Field><Field label="Confirm password"><Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required autoComplete="new-password" /></Field>{error && <p className="text-sm text-destructive">{error}</p>}<DialogActions onClose={onClose} saving={saving} submitLabel="Update" /></form></Modal>;
}

function DeactivateDialog({ user, onClose, onDeactivated }: { user: AdminUserSummary; onClose: () => void; onDeactivated: (user: AdminUserSummary) => void }) {
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  async function submit() { setSaving(true); setError(null); try { const response = await deactivateAdminUser(user.id); onDeactivated(response.user); } catch (err) { setError(adminErrorMessage(err)); } finally { setSaving(false); } }
  return <Modal title="Deactivate user?" onClose={onClose}><div className="space-y-4"><p className="text-sm text-muted-foreground">They will be signed out and unable to sign in.</p>{error && <p className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="destructive" onClick={submit} disabled={saving}>{saving ? "Deactivating" : "Deactivate"}</Button></div></div></Modal>;
}

function RoleSelect({ value, onChange }: { value: AuthRole; onChange: (value: AuthRole) => void }) {
  return <Field label="Role"><select value={value} onChange={(event) => onChange(event.target.value as AuthRole)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"><option value="user">User</option><option value="admin">Admin</option></select></Field>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function DialogActions({ onClose, saving, submitLabel }: { onClose: () => void; saving: boolean; submitLabel: string }) {
  return <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving" : submitLabel}</Button></div>;
}

function adminErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "EMAIL_ALREADY_EXISTS") return "Email already exists.";
    if (error.code === "LAST_ACTIVE_ADMIN") return "At least one active admin is required.";
    if (error.code === "CANNOT_DEACTIVATE_SELF") return "You cannot deactivate yourself.";
    if (error.code === "WEAK_PASSWORD") return "Use at least 10 characters.";
    if (error.status === 403) return "Administrator access required.";
    if (error.status === 401) return "Sign in required.";
    return error.message;
  }
  return error instanceof Error ? error.message : "Request failed.";
}
