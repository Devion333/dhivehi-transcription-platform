// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: auth.ts
// Description: API client for auth
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { request } from "@/lib/api/client";
import type { AccountProfileResponse, ChangePasswordInput, ChangePasswordResponse, CurrentUserResponse, LoginInput, LoginResponse, UpdateAccountProfileInput } from "@/lib/api/types";

export function login(input: LoginInput, signal?: AbortSignal) {
  return request<LoginResponse>("/api/auth/login", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function logout(signal?: AbortSignal) {
  return request<{ message: string }>("/api/auth/logout", { method: "POST", signal });
}

export function getCurrentUser(signal?: AbortSignal) {
  return request<CurrentUserResponse>("/api/auth/me", { signal });
}

export function changePassword(input: ChangePasswordInput, signal?: AbortSignal) {
  return request<ChangePasswordResponse>("/api/auth/change-password", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getAccountProfile(signal?: AbortSignal) {
  return request<AccountProfileResponse>("/api/account/profile", { signal });
}

export function updateAccountProfile(input: UpdateAccountProfileInput, signal?: AbortSignal) {
  return request<AccountProfileResponse>("/api/account/profile", {
    method: "PATCH",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
