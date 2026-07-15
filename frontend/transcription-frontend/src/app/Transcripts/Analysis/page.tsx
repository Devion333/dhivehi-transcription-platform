import { Suspense } from "react";

import { LoadingState } from "@/components/app/states";
import { TranscriptAnalysisClient } from "./transcript-analysis-client";

export const dynamic = "force-dynamic";

export default function AnalysisPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading transcript analysis" />}>
      <TranscriptAnalysisClient />
    </Suspense>
  );
}
