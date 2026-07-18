import type { Metadata } from "next";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { audioExtensions, clientGuidanceMaxBytes, formatFileSize, videoExtensions } from "@/lib/upload-validation";

export const metadata: Metadata = { title: "Supported Formats" };

export default function SupportedFormatsPage() {
  return (
    <PageContainer>
      <PageHeader title="Supported Formats" description="Upload and export formats currently supported by the application." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Uploads</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Audio: {audioExtensions.join(", ")}</p><p>Video: {videoExtensions.join(", ")}</p><p>Configured client guidance limit: {formatFileSize(clientGuidanceMaxBytes)}. The backend currently has no separate confirmed hard upload-size limit, so very large files may take longer to upload and process.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Exports</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>TXT: plain transcript text for quick review.</p><p>JSON: structured metadata and ordered segment data.</p><p>SRT: timestamped subtitles for media tools.</p><p>WebVTT: web-friendly subtitles.</p><p>PDF: formatted report with optional backend-verified analysis review metadata.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Unicode and Thaana</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Transcript text is stored and exported as Unicode. The PDF route uses a Thaana-capable font path and right-to-left rendering for transcript text.</CardContent></Card>
        <Card><CardHeader><CardTitle>Processing Limits</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Quality depends on source audio, background noise, overlapping speech, speaker count, and model availability. Human review is required for generated analysis and important transcript edits.</CardContent></Card>
      </div>
    </PageContainer>
  );
}
