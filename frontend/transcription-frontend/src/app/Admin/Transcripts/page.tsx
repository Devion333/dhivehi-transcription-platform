import type { Metadata } from "next";

import { AdminTranscriptsClient } from "./transcripts-client";

export const metadata: Metadata = { title: "Admin Transcripts" };

export default function AdminTranscriptsPage() {
  return <AdminTranscriptsClient />;
}
