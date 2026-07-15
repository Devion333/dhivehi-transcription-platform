"use client";

import { BarChart3, FileAudio, FileText, Home, Menu, Search, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
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
          <ThemeToggle />
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
          </div>
        </div>
      )}

      <main className="lg:ml-64">
        {children}
      </main>
    </div>
  );
}
