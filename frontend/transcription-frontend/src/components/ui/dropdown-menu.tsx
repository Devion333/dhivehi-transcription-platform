"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

const DropdownMenuContext = React.createContext<{ open: boolean; setOpen: (open: boolean) => void; rootRef: React.RefObject<HTMLDivElement | null> } | null>(null);

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return <DropdownMenuContext.Provider value={{ open, setOpen, rootRef: ref }}><div ref={ref} className="relative inline-block">{children}</div></DropdownMenuContext.Provider>;
}

export function DropdownMenuTrigger({ asChild, children }: { asChild?: boolean; children: React.ReactElement<{ onClick?: React.MouseEventHandler<HTMLElement>; disabled?: boolean; "aria-expanded"?: boolean }> }) {
  const context = useDropdownMenuContext();
  if (!asChild) return <button type="button" onClick={() => context.setOpen(!context.open)} aria-expanded={context.open}>{children}</button>;
  return React.cloneElement(children, {
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      children.props.onClick?.(event);
      if (event.defaultPrevented || children.props.disabled) return;
      context.setOpen(!context.open);
    },
    "aria-expanded": context.open,
  });
}

export function DropdownMenuContent({ children, align = "end", side = "bottom", sideOffset = 8, avoidCollisions, collisionPadding, className }: { children: React.ReactNode; align?: "start" | "end"; side?: "bottom"; sideOffset?: number; avoidCollisions?: boolean; collisionPadding?: number; className?: string }) {
  const context = useDropdownMenuContext();
  const [availableWidth, setAvailableWidth] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!context.open || !avoidCollisions) return;
    const update = () => {
      const rect = context.rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAvailableWidth(Math.max(160, window.innerWidth - rect.left - (collisionPadding ?? 16)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [avoidCollisions, collisionPadding, context.open, context.rootRef]);

  if (!context.open) return null;
  return (
    <div role="menu" data-side={side} data-avoid-collisions={avoidCollisions ? "true" : undefined} data-collision-padding={collisionPadding} style={{ marginTop: sideOffset, maxWidth: availableWidth ?? undefined }} className={cn("absolute z-50 min-w-44 rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-lg", align === "end" ? "right-0" : "left-0", className)}>
      {children}
    </div>
  );
}

export function DropdownMenuItem({ children, disabled, onSelect, className }: { children: React.ReactNode; disabled?: boolean; onSelect?: () => void; className?: string }) {
  const context = useDropdownMenuContext();
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn("flex w-full items-center rounded-md px-3 py-2 text-left hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50", className)}
      onClick={() => {
        if (disabled) return;
        onSelect?.();
        context.setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

function useDropdownMenuContext() {
  const context = React.useContext(DropdownMenuContext);
  if (!context) throw new Error("DropdownMenu components must be used within DropdownMenu");
  return context;
}
