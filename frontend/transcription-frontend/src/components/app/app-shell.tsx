"use client";

import { Bell, BriefcaseBusiness, CheckCheck, FileText, History, Home, LogOut, Menu, Search, ShieldCheck, UploadCloud, UserCircle, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { ErrorState, LoadingState } from "@/components/app/states";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { getNotificationUnreadCount, listNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/api/notifications";
import type { NotificationItem } from "@/lib/api/types";
import { isAdminRoute, isProtectedRoute, isPublicRoute, safeReturnPath } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";

const NOTIFICATION_POLL_MS = 45_000;

const mainNavItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/Upload", label: "Upload", icon: UploadCloud },
  { href: "/Transcripts", label: "Transcripts", icon: FileText },
  { href: "/Search", label: "Search", icon: Search },
];

const adminNavItems = [
  { href: "/Admin/Users", label: "Users", icon: Users },
  { href: "/Admin/Audit", label: "Audit", icon: History },
  { href: "/Admin/Jobs", label: "Jobs", icon: BriefcaseBusiness },
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
        "group relative flex h-10 items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
      )}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center">
        <Icon className="h-5 w-5 shrink-0" />
      </span>
      <span className={cn("ml-3 w-32 shrink-0 overflow-hidden whitespace-nowrap transition-opacity duration-150 ease-out", collapsed ? "pointer-events-none invisible opacity-0" : "visible opacity-100 delay-100")}>{label}</span>
    </Link>
  );
}

function isActiveNavItem(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/Upload") return pathname === "/Upload";
  if (href === "/Transcripts") return pathname === "/Transcripts" || pathname.startsWith("/Transcripts/Details") || pathname.startsWith("/Transcripts/Analysis");
  if (href === "/Search") return pathname === "/Search";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = React.useState(false);
  const [desktopViewport, setDesktopViewport] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const redirectingRef = React.useRef(false);

  React.useEffect(() => {
    redirectingRef.current = false;
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
    setMenuOpen(false);
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
  const desktopSidebarLabel = sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden overflow-hidden border-r bg-background/95 backdrop-blur transition-[width] duration-200 ease-out lg:block", sidebarCollapsed ? "w-[68px]" : "w-60")}>
        <div className="flex h-16 items-center px-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-10 w-10 shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
            aria-label={desktopSidebarLabel}
            aria-expanded={!sidebarCollapsed}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/" className="ml-3 flex min-w-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={sidebarCollapsed ? -1 : undefined} aria-hidden={sidebarCollapsed}>
            <span className={cn("w-36 shrink-0 overflow-hidden whitespace-nowrap text-sm font-semibold tracking-wide transition-opacity duration-150 ease-out", sidebarCollapsed ? "pointer-events-none invisible opacity-0" : "visible opacity-100 delay-100")}>Transcript App</span>
          </Link>
        </div>
        <div className="h-[calc(100%-4rem)] overflow-hidden px-3 pb-3">
          <nav className="space-y-5 pt-4">
            <div className="space-y-1">
              <div className="flex h-8 items-center px-3">
                <span className={cn("block whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground transition-opacity duration-150 ease-out", sidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100 delay-100")}>Main</span>
              </div>
              {mainNavItems.map((item) => <NavLink key={item.href} {...item} collapsed={sidebarCollapsed} />)}
            </div>
            {auth.user?.role === "admin" && (
              <div className="space-y-1">
                <div className="relative flex h-8 items-center px-3">
                  <span className={cn("block whitespace-nowrap text-xs font-medium uppercase tracking-wide text-muted-foreground transition-opacity duration-150 ease-out", sidebarCollapsed ? "pointer-events-none opacity-0" : "opacity-100 delay-100")}>Administration</span>
                  <span className={cn("absolute inset-x-3 top-1/2 h-px bg-border transition-opacity duration-150 ease-out", sidebarCollapsed ? "opacity-100" : "opacity-0")} />
                </div>
                {adminNavItems.map((item) => <NavLink key={item.href} {...item} collapsed={sidebarCollapsed} />)}
              </div>
            )}
          </nav>
        </div>
      </aside>

      <header className={cn("sticky top-0 z-20 border-b bg-background/85 backdrop-blur transition-[margin] duration-200 ease-out", sidebarCollapsed ? "lg:ml-[68px]" : "lg:ml-60")}>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="fixed left-4 top-3 z-50 h-10 w-10 rounded-lg bg-background/80 shadow-sm backdrop-blur focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          onClick={handleSidebarToggle}
          aria-label={sidebarToggleLabel}
          aria-expanded={desktopViewport ? !sidebarCollapsed : mobileOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="flex h-16 items-center justify-end pl-16 pr-4 sm:pr-6 lg:px-8">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {auth.user && auth.status === "authenticated" && <NotificationBell />}
            {auth.user && (
              <div className="relative">
                <Button variant="outline" className="gap-2" onClick={() => setMenuOpen((open) => !open)}>
                  <UserCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">{auth.user.name}</span>
                </Button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-lg border bg-popover p-2 text-sm shadow-lg">
                    <div className="px-2 py-2">
                      <p className="font-medium">{auth.user.name}</p>
                      <p className="text-xs text-muted-foreground">{auth.user.role}</p>
                    </div>
                    <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                      <Link href="/Account/Profile"><UserCircle className="h-4 w-4" /> Profile</Link>
                    </Button>
                    <Button asChild variant="ghost" className="w-full justify-start gap-2" onClick={() => setMenuOpen(false)}>
                      <Link href="/Account/Security"><ShieldCheck className="h-4 w-4" /> Security</Link>
                    </Button>
                    <Button variant="ghost" className="w-full justify-start gap-2" onClick={handleSignOut}>
                      <LogOut className="h-4 w-4" /> Sign out
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 border-r bg-background p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between">
              <Link href="/" className="whitespace-nowrap font-semibold" onClick={() => setMobileOpen(false)}>Transcript App</Link>
            </div>
            <nav className="space-y-5">
              <div className="space-y-1">
                <p className="px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Main</p>
                {mainNavItems.map((item) => <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />)}
              </div>
              {auth.user?.role === "admin" && (
                <div className="space-y-1">
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
                  <Link href="/Account/Security"><ShieldCheck className="h-4 w-4" /> Security</Link>
                </Button>
                <Button variant="outline" className="mt-3 w-full justify-start gap-2" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <main className={cn("min-w-0 flex-1 transition-[margin] duration-200 ease-out", sidebarCollapsed ? "lg:ml-[68px]" : "lg:ml-60")}>
        {children}
      </main>
    </div>
  );
}

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
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
    setOpen(false);
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
    <div className="relative">
      <Button type="button" variant="outline" size="icon" onClick={() => setOpen((value) => !value)} aria-label="Notifications" aria-expanded={open}>
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1 text-xs font-medium text-destructive-foreground">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </Button>
      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border bg-popover p-2 text-sm shadow-lg">
          <div className="flex items-center justify-between gap-2 px-2 py-2">
            <p className="font-medium">Notifications</p>
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={markAllRead} disabled={unreadCount === 0}><CheckCheck className="h-4 w-4" /> Mark all read</Button>
          </div>
          {loading && <p className="px-2 py-6 text-center text-muted-foreground">Loading notifications...</p>}
          {error && <p className="px-2 py-3 text-destructive">{error}</p>}
          {!loading && !error && items.length === 0 && <p className="px-2 py-6 text-center text-muted-foreground">No notifications yet.</p>}
          {!loading && !error && items.length > 0 && (
            <div className="max-h-[70vh] space-y-1 overflow-y-auto">
              {items.map((item) => (
                <button key={item.id} type="button" className={cn("w-full rounded-md px-3 py-2 text-left hover:bg-accent", !item.isRead && "bg-primary/10")} onClick={() => void openNotification(item)}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{item.title}</p>
                    {!item.isRead && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </div>
                  <p className="mt-1 text-muted-foreground">{item.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatNotificationDate(item.createdAt)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function notificationHref(item: NotificationItem) {
  const jobId = encodeURIComponent(item.resourceId);
  if (item.type === "analysis_completed" || item.type === "analysis_failed") return `/Transcripts/Analysis?job_id=${jobId}`;
  return `/Transcripts/Details?job_id=${jobId}`;
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString();
}
