// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: page.tsx
// Description: Frontend page or component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
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
