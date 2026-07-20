import { Suspense } from "react";

import { LoadingState } from "@/components/app/states";
import { AdminSettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading system settings" />}>
      <AdminSettingsClient />
    </Suspense>
  );
}
