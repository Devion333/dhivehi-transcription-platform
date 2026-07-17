import { Suspense } from "react";

import { LoadingState } from "@/components/app/states";
import { TranscriptListClient } from "./List/transcript-list-client";

export const dynamic = "force-dynamic";

export default function TranscriptListPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading transcript list" />}>
      <TranscriptListClient />
    </Suspense>
  );
}
