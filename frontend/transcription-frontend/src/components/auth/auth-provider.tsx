"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: auth-provider.tsx
// Description: Authentication component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import * as React from "react";

import { getCurrentUser, login as loginRequest, logout as logoutRequest } from "@/lib/api/auth";
import { isAbortError, isApiError } from "@/lib/api/client";
import type { AuthUser, LoginInput } from "@/lib/api/types";

export type AuthStatus = "checking" | "authenticated" | "unauthenticated" | "error";

const authCheckTimeoutMs = 9000;

class AuthCheckTimeoutError extends Error {
  constructor() {
    super("Session check timed out");
    this.name = "AuthCheckTimeoutError";
  }
}

type AuthContextValue = {
  user: AuthUser | null;
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: (signal?: AbortSignal) => Promise<AuthUser | null>;
  updateUser: (user: AuthUser) => void;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [status, setStatus] = React.useState<AuthStatus>("checking");

  const refreshUser = React.useCallback(async (signal?: AbortSignal) => {
    setStatus("checking");
    try {
      const response = await getCurrentUserWithTimeout(signal);
      setUser(response.user);
      setStatus("authenticated");
      return response.user;
    } catch (error) {
      if (isAbortError(error)) return null;

      setUser(null);
      if (isApiError(error) && error.status === 401) {
        setStatus("unauthenticated");
        return null;
      }
      setStatus("error");
      return null;
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void refreshUser(controller.signal);
    return () => controller.abort();
  }, [refreshUser]);

  const login = React.useCallback(async (input: LoginInput) => {
    clearAuthRedirectState();
    const response = await loginRequest(input);
    setUser(response.user);
    setStatus("authenticated");
    return response.user;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearAuthRedirectState();
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const updateUser = React.useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, isLoading: status === "checking", isAuthenticated: status === "authenticated", login, logout, refreshUser, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function clearAuthRedirectState() {
  if (typeof window === "undefined") return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    for (const key of ["returnTo", "redirectTo", "redirectUrl", "transcript-app-return-to", "transcript-app-redirect", "next-url"]) {
      storage.removeItem(key);
    }
  }
  document.cookie = "returnTo=; Max-Age=0; path=/";
  document.cookie = "redirectTo=; Max-Age=0; path=/";
}

async function getCurrentUserWithTimeout(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, authCheckTimeoutMs);
  const abortRequest = () => controller.abort();

  signal?.addEventListener("abort", abortRequest, { once: true });
  try {
    return await getCurrentUser(controller.signal);
  } catch (error) {
    if (timedOut) throw new AuthCheckTimeoutError();
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", abortRequest);
  }
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
