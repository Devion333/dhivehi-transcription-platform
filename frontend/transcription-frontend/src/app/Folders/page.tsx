import type { Metadata } from "next";

import { FoldersClient } from "./folders-client";

export const metadata: Metadata = { title: "Folders" };

export default function FoldersPage() {
  return <FoldersClient />;
}
