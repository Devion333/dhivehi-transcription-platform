import { Suspense } from "react";
import type { Metadata } from "next";

import { LoadingState } from "@/components/app/states";
import { FolderDetailsClient } from "./folder-details-client";

export const metadata: Metadata = { title: "Folder Details" };

export default function FolderDetailsPage() {
  return <Suspense fallback={<LoadingState label="Loading folder" />}><FolderDetailsClient /></Suspense>;
}
