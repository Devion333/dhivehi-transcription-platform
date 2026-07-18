import type { Metadata } from "next";

import { ReviewQueueClient } from "./review-queue-client";

export const metadata: Metadata = { title: "Transcript Review Queue" };

export default function AnalysisReviewQueuePage() {
  return <ReviewQueueClient />;
}
