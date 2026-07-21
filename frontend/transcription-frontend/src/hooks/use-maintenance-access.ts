"use client";

// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: use-maintenance-access.ts
// Description: Custom hook: use-maintenance-access
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { usePublicSettings } from "@/components/app/public-settings-provider";
import { useAuth } from "@/components/auth/auth-provider";

export const maintenanceMutationMessage = "Unavailable during maintenance mode.";

export function useMaintenanceAccess() {
  const auth = useAuth();
  const { settings } = usePublicSettings();

  const maintenanceMode = Boolean(settings?.maintenanceMode);
  const isAdmin = auth.user?.role === "admin";
  const canModifyDuringMaintenance = !maintenanceMode || isAdmin;
  return { settings, maintenanceMode, isAdmin, canModifyDuringMaintenance, message: maintenanceMutationMessage };
}
