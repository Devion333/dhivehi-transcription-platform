// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: page.tsx
// Description: Frontend page or component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { Metadata } from "next";

import { NotificationsClient } from "./notifications-client";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <NotificationsClient />;
}
