import { Suspense } from "react";

import { LoadingState } from "@/components/app/states";
import { TranscriptDetailsClient } from "./transcript-details-client";

export const dynamic = "force-dynamic";

export default function TranscriptDetailsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading transcript details" />}>
      <TranscriptDetailsClient />
    </Suspense>
  );
}
