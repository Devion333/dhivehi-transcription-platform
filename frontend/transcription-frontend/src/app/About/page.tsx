import type { Metadata } from "next";

import { PageContainer } from "@/components/app/page-container";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <PageContainer>
      <PageHeader title="About" description="System information for the Dhivehi transcription platform." />
      <div className="grid gap-4 md:grid-cols-2">
        <Info title="Purpose" text="This platform supports authenticated upload, processing, review, search, and export of Dhivehi transcript workflows." />
        <Info title="Workflow" text="Media is converted, diarized, transcribed, reviewed, optionally analysed, and exported through controlled application routes." />
        <Info title="Transcript Review" text="Generated transcripts should be checked by a person for accuracy and completeness before operational reliance. Transcript review status is tracked separately from processing and analysis generation status." />
        <Info title="Privacy and Authorization" text="Users access their own transcripts and notifications. Administrators have oversight routes for account and transcript operations. Audit and activity views avoid transcript text and sensitive internals." />
        <Info title="Technology Summary" text="The system uses a Go backend, PostgreSQL for durable auth/audit/notifications, Redis queues, MinIO object storage, Qdrant metadata/segment storage, Next.js frontend, and worker services." />
        <Info title="Analysis Disclaimer" text="Generated analysis can be incomplete or incorrect. It is a review aid, not a replacement for human judgement." />
      </div>
    </PageContainer>
  );
}

function Info({ title, text }: { title: string; text: string }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{text}</CardContent></Card>;
}
