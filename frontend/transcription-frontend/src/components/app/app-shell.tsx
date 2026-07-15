"use client";

import { BarChart3, FileAudio, FileText, Home, LogOut, Menu, Search, UploadCloud, UserCircle, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { LoadingState } from "@/components/app/states";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { isProtectedRoute, isPublicRoute } from "@/lib/auth-utils";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/Transcripts", label: "Upload", icon: UploadCloud },
  { href: "/Transcripts/List", label: "Transcripts", icon: FileText },
  { href: "/Transcripts/Details", label: "Details", icon: FileAudio },
  { href: "/Transcripts/Analysis", label: "Analysis", icon: BarChart3 },
  { href: "/Search", label: "Search", icon: Search },
];

function NavLink({ href, label, icon: Icon, onClick }: (typeof navItems)[number] & { onClick?: () => void }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-accent-foreground",
        active && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const auth = useAuth();

  React.useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated && isProtectedRoute(pathname)) {
      const query = typeof window === "undefined" ? "" : window.location.search.replace(/^\?/, "");
      const returnTo = `${pathname}${query ? `?${query}` : ""}`;
      router.replace(`/Login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [auth.isAuthenticated, auth.isLoading, pathname, router]);

  if (isPublicRoute(pathname)) return <>{children}</>;

  if (auth.isLoading || (!auth.isAuthenticated && isProtectedRoute(pathname))) {
    return <LoadingState label="Checking session" />;
  }

  async function handleSignOut() {
    await auth.logout();
    setMenuOpen(false);
    router.replace("/Login");
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r bg-background/95 p-4 backdrop-blur lg:block">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FileAudio className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide">Transcript App</p>
          </div>
        </Link>
        <nav className="space-y-1">
          {navItems.map((item) => <NavLink key={item.href} {...item} />)}
        </nav>
      </aside>

      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur lg:ml-64">
        <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Button className="lg:hidden" size="icon" variant="ghost" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden text-sm text-muted-foreground lg:block">Transcript App</div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
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
              <Link href="/" className="font-semibold" onClick={() => setMobileOpen(false)}>Transcript App</Link>
              <Button size="icon" variant="ghost" onClick={() => setMobileOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />)}
            </nav>
            {auth.user && (
              <div className="mt-6 border-t pt-4">
                <p className="text-sm font-medium">{auth.user.name}</p>
                <p className="text-xs text-muted-foreground">{auth.user.role}</p>
                <Button variant="outline" className="mt-3 w-full justify-start gap-2" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <main className="lg:ml-64">
        {children}
      </main>
    </div>
  );
}
