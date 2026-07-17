import { Suspense } from "react";

import { LoadingState } from "@/components/app/states";
import { AdminUsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading users" />}>
      <AdminUsersClient />
    </Suspense>
  );
}
