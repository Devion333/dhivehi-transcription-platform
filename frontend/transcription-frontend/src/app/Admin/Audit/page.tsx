import { Suspense } from "react";

import { LoadingState } from "@/components/app/states";
import { AdminAuditClient } from "./audit-client";

export const dynamic = "force-dynamic";

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading audit" />}>
      <AdminAuditClient />
    </Suspense>
  );
}
