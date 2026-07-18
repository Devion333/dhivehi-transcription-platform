import type { Metadata } from "next";

import { SystemHealthClient } from "./system-health-client";

export const metadata: Metadata = { title: "System Health" };

export default function SystemHealthPage() {
  return <SystemHealthClient />;
}
