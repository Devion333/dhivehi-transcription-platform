import { Suspense } from "react";

import { LoadingState } from "@/components/app/states";
import { SearchClient } from "./search-client";

export const dynamic = "force-dynamic";

export default function SearchPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading search" />}>
      <SearchClient />
    </Suspense>
  );
}
