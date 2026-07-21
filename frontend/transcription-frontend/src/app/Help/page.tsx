// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: page.tsx
// Description: Frontend page or component
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { audioExtensions, clientGuidanceMaxBytes, formatFileSize, videoExtensions } from "@/lib/upload-validation";

export const metadata: Metadata = { title: "Help" };

const sections = [
  ["Uploading media", "Use the upload page to submit supported audio or video with category, reference, notes, and requested speaker count.", "/Upload"],
  ["Processing stages", "Files move through conversion, diarization, transcription, and optional analysis. Status appears on transcript detail pages.", "/Transcripts"],
  ["Transcript editing", "Open Details to review segments, edit transcript text, rename speakers, and play source audio.", "/Transcripts"],
  ["Search", "Search transcript text and metadata across transcripts you are authorized to access.", "/Search"],
  ["Analysis and review", "Generated analysis must be human reviewed before it is treated as approved work product.", "/Analysis/Review-Queue"],
  ["Downloads", "Transcript Details supports TXT, JSON, SRT, WebVTT, and PDF exports depending on the task.", "#supported-formats"],
  ["Notifications", "Workflow notifications show completed processing, failed processing, completed analysis, failed analysis, and assignments.", "/Notifications"],
  ["Change password", "Open Profile to change your account password.", "/Account/Profile"],
];

export default function HelpPage() {
  return (
    <PageContainer>
      <PageHeader title="Help" />
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map(([title, description, href]) => (
          <Card key={title}>
            <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{description}</p>
              <Link href={href} className="font-medium text-primary hover:underline">Open related page</Link>
            </CardContent>
          </Card>
        ))}
      </div>
      <section id="supported-formats" className="mt-6 scroll-mt-24">
        <Card>
          <CardHeader><CardTitle>Supported formats</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm text-muted-foreground lg:grid-cols-2">
            <div className="space-y-3">
              <h2 className="font-medium text-foreground">Uploads</h2>
              <p>Audio: {audioExtensions.join(", ")}</p>
              <p>Video: {videoExtensions.join(", ")}</p>
              <p>Configured upload-size guidance: {formatFileSize(clientGuidanceMaxBytes)}. Very large files can take longer to upload and process.</p>
              <p>Transcript text is stored as Unicode and supports Thaana content.</p>
            </div>
            <div className="space-y-3">
              <h2 className="font-medium text-foreground">Exports</h2>
              <p>TXT: plain transcript text for quick review.</p>
              <p>JSON: structured metadata and ordered segment data.</p>
              <p>SRT: timestamped subtitles for media tools.</p>
              <p>WebVTT: web-friendly subtitles.</p>
              <p>PDF: formatted report with optional backend-verified transcript review metadata.</p>
            </div>
            <div className="space-y-3 lg:col-span-2">
              <h2 className="font-medium text-foreground">Processing limitations</h2>
              <p>Quality depends on source audio, background noise, overlapping speech, requested speaker count, and model availability. PDF exports use a Thaana-capable font and right-to-left rendering for transcript text. Transcript review is required before operational reliance.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </PageContainer>
  );
}
