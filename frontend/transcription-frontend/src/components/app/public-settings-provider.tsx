"use client";

import * as React from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { getPublicSystemSettings } from "@/lib/api/settings";
import type { PublicSystemSettings } from "@/lib/api/types";
import { isProtectedRoute } from "@/lib/auth-utils";

interface PublicSettingsContextValue {
  settings: PublicSystemSettings | null;
  isLoading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
  clearSettings: () => void;
}

const PublicSettingsContext = React.createContext<PublicSettingsContextValue | null>(null);

export function PublicSettingsProvider({ children, pathname }: { children: React.ReactNode; pathname: string }) {
  const auth = useAuth();
  const [settings, setSettings] = React.useState<PublicSystemSettings | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const refreshRef = React.useRef<Promise<void> | null>(null);

  const clearSettings = React.useCallback(() => {
    setSettings(null);
    setError(null);
    setIsLoading(false);
  }, []);

  const refreshSettings = React.useCallback(async () => {
    if (refreshRef.current) return refreshRef.current;
    const controller = new AbortController();
    const request = (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getPublicSystemSettings(controller.signal);
        setSettings(response);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Public settings are unavailable");
        throw err;
      } finally {
        setIsLoading(false);
        refreshRef.current = null;
      }
    })();
    refreshRef.current = request;
    return request;
  }, []);

  React.useEffect(() => {
    if (!isProtectedRoute(pathname) || auth.status !== "authenticated") {
      clearSettings();
      return;
    }
    void refreshSettings().catch(() => undefined);
  }, [auth.status, clearSettings, pathname, refreshSettings]);

  const value = React.useMemo(() => ({ settings, isLoading, error, refreshSettings, clearSettings }), [clearSettings, error, isLoading, refreshSettings, settings]);

  return <PublicSettingsContext.Provider value={value}>{children}</PublicSettingsContext.Provider>;
}

export function usePublicSettings() {
  const context = React.useContext(PublicSettingsContext);
  if (!context) throw new Error("usePublicSettings must be used inside PublicSettingsProvider");
  return context;
}
