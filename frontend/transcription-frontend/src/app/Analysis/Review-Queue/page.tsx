import type { Metadata } from "next";

import { ReviewQueueClient } from "./review-queue-client";

export const metadata: Metadata = { title: "Analysis Review Queue" };

export default function AnalysisReviewQueuePage() {
  return <ReviewQueueClient />;
}
