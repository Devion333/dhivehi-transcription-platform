import type { Metadata } from "next";
import Link from "next/link";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Help" };

const sections = [
  ["Uploading media", "Use the upload page to submit supported audio or video with category, reference, notes, and requested speaker count.", "/Upload"],
  ["Processing stages", "Files move through conversion, diarization, transcription, and optional analysis. Status appears on transcript detail pages.", "/Transcripts"],
  ["Transcript editing", "Open Details to review segments, edit transcript text, rename speakers, and play source audio.", "/Transcripts"],
  ["Search", "Search transcript text and metadata across transcripts you are authorized to access.", "/Search"],
  ["Analysis and review", "Generated analysis must be human reviewed before it is treated as approved work product.", "/Analysis/Review-Queue"],
  ["Downloads", "Transcript Details supports TXT, JSON, SRT, WebVTT, and PDF exports depending on the task.", "/Supported-Formats"],
  ["Notifications", "Workflow notifications show completed processing, failed processing, completed analysis, failed analysis, and assignments.", "/Notifications"],
  ["Account security", "Use Account Security to change your password and keep your session protected.", "/Account/Security"],
];

export default function HelpPage() {
  return (
    <PageContainer>
      <PageHeader title="Help" description="A practical guide to using the Dhivehi transcription workflow." />
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
    </PageContainer>
  );
}
