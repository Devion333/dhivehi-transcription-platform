"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: app-shell.tsx
// Description: App component: app-shell
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { Activity, Bell, BriefcaseBusiness, CheckCheck, CircleHelp, ClipboardList, FileText, FolderOpen, HeartPulse, History, Home, Inbox, LogOut, Menu, Search, Settings, UploadCloud, UserCircle, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { ErrorState, LoadingState } from "@/components/app/states";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PublicSettingsProvider, usePublicSettings } from "@/components/app/public-settings-provider";
import { getNotificationUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api/notifications";
import type { NotificationItem } from "@/lib/api/types";
import { isAdminRoute, isProtectedRoute, isPublicRoute, safeReturnPath } from "@/lib/auth-utils";
import { withReturnTo } from "@/lib/navigation-utils";
import { sectionToneClasses } from "@/lib/section-styles";
import { cn } from "@/lib/utils";

const NOTIFICATION_POLL_MS = 45_000;
type OpenHeaderPanel = "notifications" | "profile" | null;

const mainNavItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/Upload", label: "Upload", icon: UploadCloud },
  { href: "/Transcripts", label: "Transcripts", icon: FileText },
  { href: "/Folders", label: "Folders", icon: FolderOpen },
  { href: "/Search", label: "Search", icon: Search },
  { href: "/Notifications", label: "Notifications", icon: Inbox },
  { href: "/Activity", label: "Activity", icon: Activity },
  { href: "/Help", label: "Help", icon: CircleHelp },
];

const adminNavItems = [
  { href: "/Admin/Transcripts", label: "Transcript Management", icon: ClipboardList },
  { href: "/Admin/System-Health", label: "System Health", icon: HeartPulse },
  { href: "/Analysis/Review-Queue", label: "Transcript Review", icon: CheckCheck },
  { href: "/Admin/Users", label: "Users", icon: Users },
  { href: "/Admin/Audit", label: "Audit", icon: History },
  { href: "/Admin/Jobs", label: "Jobs", icon: BriefcaseBusiness },
  { href: "/Admin/Settings", label: "System Settings", icon: Settings },
];

function NavLink({ href, label, icon: Icon, onClick, collapsed = false }: (typeof mainNavItems)[number] & { onClick?: () => void; collapsed?: boolean }) {
  const pathname = usePathname();
  const active = isActiveNavItem(href, pathname);

  return (
    <Link
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "group relative flex h-10 items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out hover:bg-[var(--accent-primary-bg)] hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary-border)] hover:bg-[var(--accent-primary-bg)] hover:text-[var(--accent-primary)]",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
        <Icon className={cn("h-5 w-5 shrink-0", active && sectionToneClasses.primary.text)} />
      </span>
      <span className={cn("ml-3 w-40 shrink-0 overflow-hidden whitespace-nowrap transition-opacity duration-150 ease-out", collapsed ? "pointer-events-none invisible opacity-0" : "visible opacity-100 delay-100")}>{label}</span>
    </Link>
  );
}

function isActiveNavItem(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/Upload") return pathname === "/Upload";
  if (href === "/Transcripts") return pathname === "/Transcripts" || pathname.startsWith("/Transcripts/Details") || pathname.startsWith("/Transcripts/Analysis");
  if (href === "/Search") return pathname === "/Search";
  if (href === "/Analysis/Review-Queue") return pathname === "/Analysis/Review-Queue";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return <PublicSettingsProvider pathname={pathname}><AppShellContent>{children}</AppShellContent></PublicSettingsProvider>;
}

function AppShellContent({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [openHeaderPanel, setOpenHeaderPanel] = React.useState<OpenHeaderPanel>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = React.useState(false);
  const [desktopViewport, setDesktopViewport] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const publicSettings = usePublicSettings();
  const redirectingRef = React.useRef(false);

  React.useEffect(() => {
    redirectingRef.current = false;
    setOpenHeaderPanel(null);
  }, [pathname]);

  React.useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem("transcript-app-sidebar-collapsed") === "true");
    setSidebarPreferenceReady(true);
  }, []);

  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const updateViewport = () => setDesktopViewport(query.matches);
    updateViewport();
    query.addEventListener("change", updateViewport);
    return () => query.removeEventListener("change", updateViewport);
  }, []);

  React.useEffect(() => {
    if (!sidebarPreferenceReady) return;
    window.localStorage.setItem("transcript-app-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed, sidebarPreferenceReady]);

  React.useEffect(() => {
    if (auth.status === "unauthenticated" && isProtectedRoute(pathname) && !redirectingRef.current) {
      redirectingRef.current = true;
      const query = typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, "");
      const returnTo = safeReturnPath(`${pathname}${query ? `?${query}` : ""}`);
      router.replace(`/Login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [auth.status, pathname, router]);

  if (isPublicRoute(pathname)) return <>{children}</>;

  if (auth.status === "checking" && isProtectedRoute(pathname)) {
    return <LoadingState label="Checking session" />;
  }

  if (auth.status === "error" && isProtectedRoute(pathname)) {
    return <ErrorState title="Unable to verify session" description="Check the backend connection and try again." onRetry={() => void auth.refreshUser()} />;
  }

  if (auth.status === "unauthenticated" && isProtectedRoute(pathname)) {
    return <LoadingState label="Redirecting to sign in" />;
  }

  if (auth.user && isAdminRoute(pathname) && auth.user.role !== "admin") {
    return <ErrorState title="Forbidden" description="Administrator access required." />;
  }

  async function handleSignOut() {
    await auth.logout();
    publicSettings.clearSettings();
    setOpenHeaderPanel(null);
    router.replace("/Login");
  }

  function handleSidebarToggle() {
    if (desktopViewport) {
      setSidebarCollapsed((collapsed) => !collapsed);
    } else {
      setMobileOpen((open) => !open);
    }
  }

  const sidebarToggleLabel = desktopViewport
    ? sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
    : mobileOpen ? "Close sidebar" : "Open sidebar";

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-muted/30">
      <header className="z-40 flex h-16 shrink-0 items-center bg-background/95 backdrop-blur">
        <div className="flex h-full items-center gap-3 px-4">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-9 w-9 shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring"
            onClick={handleSidebarToggle}
            aria-label={sidebarToggleLabel}
            aria-expanded={desktopViewport ? !sidebarCollapsed : mobileOpen}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/" className="whitespace-nowrap rounded-md text-lg font-semibold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Transcript App
          </Link>
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {auth.user && auth.status === "authenticated" && <NotificationBell open={openHeaderPanel === "notifications"} onOpenChange={(open) => setOpenHeaderPanel(open ? "notifications" : null)} />}
            {auth.user && (
              <DropdownMenu open={openHeaderPanel === "profile"} onOpenChange={(open) => setOpenHeaderPanel(open ? "profile" : null)}>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                    <UserCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">{auth.user.name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" avoidCollisions collisionPadding={16} className="w-56 p-2">
                  <div className="px-2 py-2">
                    <p className="font-medium">{auth.user.name}</p>
                    <p className="text-xs text-muted-foreground">{auth.user.role}</p>
                  </div>
                  <DropdownMenuItem onSelect={() => router.push("/Account/Profile")} className="gap-2"><UserCircle className="h-4 w-4" /> Profile</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => router.push("/Account/Security")} className="gap-2"><UserCircle className="h-4 w-4" /> Change password</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => router.push("/About")} className="gap-2"><CircleHelp className="h-4 w-4" /> About</DropdownMenuItem>
                  <Button variant="ghost" className="w-full justify-start gap-2" onClick={handleSignOut}>
                    <LogOut className="h-4 w-4" /> Sign out
                  </Button>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      {publicSettings.settings?.announcementEnabled && publicSettings.settings.announcementMessage && (
        <div className="shrink-0 border-y border-[var(--accent-primary-border)] bg-[var(--accent-primary-bg)] px-4 py-2 text-sm text-[var(--accent-primary)] sm:px-6 lg:px-8">
          {publicSettings.settings.announcementMessage}
        </div>
      )}

      {publicSettings.settings?.maintenanceMode && (
        <div className="shrink-0 border-y border-[var(--accent-warning-border)] bg-[var(--accent-warning-bg)] px-4 py-2 text-sm text-[var(--accent-warning)] sm:px-6 lg:px-8">
          {auth.user?.role === "admin" ? "Maintenance mode is active for standard users." : "Maintenance mode is active. You can view existing content, but uploads and changes are temporarily disabled."}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className={cn("hidden min-h-0 shrink-0 overflow-hidden bg-background/95 backdrop-blur transition-[width] duration-200 ease-in-out lg:flex lg:flex-col", sidebarCollapsed ? "w-[68px]" : "w-60")}>
          <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            <nav className="space-y-5 pt-4">
              <div className="space-y-1">
                <div className="flex h-8 items-center px-3">
                  <span className={cn("block whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground transition-opacity duration-150 ease-out", sidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100 delay-100")}>Main</span>
                </div>
                {mainNavItems.map((item) => <NavLink key={item.href} {...item} collapsed={sidebarCollapsed} />)}
              </div>
              {auth.user?.role === "admin" && (
                <div className="space-y-1 border-t border-border/40 pt-3">
                  <div className="relative flex h-8 items-center px-3">
                    <span className={cn("block whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground transition-opacity duration-150 ease-out", sidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100 delay-100")}>Administration</span>
                  </div>
                  {adminNavItems.map((item) => <NavLink key={item.href} {...item} collapsed={sidebarCollapsed} />)}
                </div>
              )}
            </nav>
          </div>
          {auth.user && (
            <div className="shrink-0 px-3 py-3">
              <Link href="/Account/Profile" title={sidebarCollapsed ? "Profile" : undefined} aria-label={sidebarCollapsed ? "Profile" : undefined} className="flex h-10 items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--accent-primary-bg)] hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center"><UserCircle className="h-5 w-5" /></span>
                <span className={cn("ml-3 w-40 shrink-0 overflow-hidden whitespace-nowrap transition-opacity duration-150 ease-out", sidebarCollapsed ? "pointer-events-none invisible opacity-0" : "visible opacity-100 delay-100")}>{auth.user.name}</span>
              </Link>
            </div>
          )}
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 flex-col overflow-hidden border-r bg-background shadow-xl">
              <div className="flex h-16 shrink-0 items-center justify-between px-4">
                <Link href="/" className="whitespace-nowrap font-semibold" onClick={() => setMobileOpen(false)}>Transcript App</Link>
              </div>
              <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <nav className="space-y-5">
                  <div className="space-y-1">
                    <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Main</p>
                    {mainNavItems.map((item) => <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />)}
                  </div>
                  {auth.user?.role === "admin" && (
                    <div className="space-y-1 border-t border-border/40 pt-3">
                      <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Administration</p>
                      {adminNavItems.map((item) => <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />)}
                    </div>
                  )}
                </nav>
                {auth.user && (
                  <div className="mt-6 border-t pt-4">
                    <p className="text-sm font-medium">{auth.user.name}</p>
                    <p className="text-xs text-muted-foreground">{auth.user.role}</p>
                    <Button asChild variant="outline" className="mt-3 w-full justify-start gap-2" onClick={() => setMobileOpen(false)}>
                      <Link href="/Account/Profile"><UserCircle className="h-4 w-4" /> Profile</Link>
                    </Button>
                    <Button asChild variant="outline" className="mt-3 w-full justify-start gap-2" onClick={() => setMobileOpen(false)}>
                      <Link href="/About"><CircleHelp className="h-4 w-4" /> About</Link>
                    </Button>
                    <Button variant="outline" className="mt-3 w-full justify-start gap-2" onClick={handleSignOut}>
                      <LogOut className="h-4 w-4" /> Sign out
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <main className={cn(
          "min-h-0 min-w-0 flex-1",
          pathname.startsWith("/Admin/Settings")
            ? "flex flex-col overflow-hidden overscroll-none"
            : "overflow-y-auto",
        )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function NotificationBell({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const countRequestRef = React.useRef<AbortController | null>(null);
  const listRequestRef = React.useRef<AbortController | null>(null);

  const refreshCount = React.useCallback(async () => {
    if (countRequestRef.current) return;
    const controller = new AbortController();
    countRequestRef.current = controller;
    try {
      const response = await getNotificationUnreadCount(controller.signal);
      setUnreadCount(response.count);
    } catch {
      // Count polling is background-only; the popover reports user-visible errors.
    } finally {
      if (countRequestRef.current === controller) countRequestRef.current = null;
    }
  }, []);

  const refreshList = React.useCallback(async () => {
    if (listRequestRef.current) return;
    const controller = new AbortController();
    listRequestRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await listNotifications({ page: 1, pageSize: 10 }, controller.signal);
      setItems(response.items);
      setUnreadCount(response.items.filter((item) => !item.isRead).length);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Notifications are unavailable");
    } finally {
      if (listRequestRef.current === controller) listRequestRef.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshCount();
    const id = window.setInterval(() => void refreshCount(), NOTIFICATION_POLL_MS);
    return () => {
      window.clearInterval(id);
      countRequestRef.current?.abort();
      listRequestRef.current?.abort();
    };
  }, [refreshCount]);

  React.useEffect(() => {
    if (open) void refreshList();
  }, [open, refreshList]);

  async function openNotification(item: NotificationItem) {
    if (!item.isRead) {
      try {
        const response = await markNotificationRead(item.id);
        setItems((current) => current.map((candidate) => candidate.id === item.id ? response.notification : candidate));
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not mark notification as read");
        return;
      }
    }
    onOpenChange(false);
    router.push(notificationHref(item));
  }

  async function markAllRead() {
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not mark notifications as read");
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Notifications" aria-expanded={open}>
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--accent-notification)] px-1 text-xs font-medium text-background ring-1 ring-background">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" avoidCollisions collisionPadding={16} className="w-[min(380px,calc(100vw-2rem))] overflow-hidden border bg-popover p-0 shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="min-w-0 truncate font-semibold">Notifications</h2>
          {unreadCount > 0 && <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1 px-2" onClick={markAllRead}><CheckCheck className="h-4 w-4" /> Mark all read</Button>}
        </div>
        <div className="max-h-[460px] overflow-y-auto">
          {loading && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading notifications...</p>}
          {error && <div className="space-y-2 px-4 py-3 text-sm"><p className="text-destructive">{error}</p><Button type="button" variant="outline" size="sm" onClick={() => void refreshList()}>Retry</Button></div>}
          {!loading && !error && items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No notifications yet.</p>}
          {!loading && !error && items.length > 0 && items.map((item) => (
            <button key={item.id} type="button" className={cn("flex w-full gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none", !item.isRead && "bg-[var(--accent-notification-bg)]")} onClick={() => void openNotification(item)}>
              <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 break-words text-sm font-medium leading-5">{item.title}</p>
                  {!item.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent-notification)]" aria-label="Unread" />}
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground" title={item.message}>{item.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatNotificationDate(item.createdAt)}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="border-t px-2 py-2">
          <Button asChild variant="ghost" className="w-full justify-start" onClick={() => onOpenChange(false)}>
            <Link href="/Notifications">View all notifications</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function notificationHref(item: NotificationItem) {
  const jobId = encodeURIComponent(item.resourceId);
  const returnTo = typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}`;
  if (item.type === "analysis_completed" || item.type === "analysis_failed") return withReturnTo(`/Transcripts/Analysis?job_id=${jobId}`, returnTo);
  return withReturnTo(`/Transcripts/Details?job_id=${jobId}`, returnTo);
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}
