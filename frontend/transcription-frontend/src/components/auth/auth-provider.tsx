"use client";

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
    const response = await loginRequest(input);
    setUser(response.user);
    setStatus("authenticated");
    return response.user;
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, isLoading: status === "checking", isAuthenticated: status === "authenticated", login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
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
