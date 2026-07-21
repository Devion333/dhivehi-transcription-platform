// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: route.ts
// Description: API route handler
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";
import puppeteer, { type Browser, type Page } from "puppeteer";

import type { PdfExportPayload, PdfExportSegment } from "@/lib/pdf-export-types";
import { escapeHtml, formatPdfTimestamp, groupSegmentsBySpeaker, hasUsableAnalysis, pdfDownloadFilename, sortPdfSegments, toPdfAnalysis } from "@/lib/pdf-export-utils";
import { BACKEND_URL } from "@/config";
import { analysisReviewStatusLabel } from "@/lib/analysis-review-status";
import type { TranscriptAnalysis, TranscriptDetail } from "@/lib/api/types";
import { getSpeakerDisplayName } from "@/lib/transcript-details-utils";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 1_500_000;
const PDF_TIMEOUT_MS = 45_000;
const AUTH_CHECK_TIMEOUT_MS = 5_000;

type RouteError = {
  status: number;
  code: string;
  message: string;
};

export async function POST(request: NextRequest) {
  let browser: Browser | null = null;
  let page: Page | null = null;
  let payload: PdfExportPayload | null = null;

  try {
    await requireAuthenticated(request);
    payload = await readAndValidatePayload(request);
    const authorizedTranscript = await requireTranscriptAccess(request, payload.transcript.jobId);
    payload = withAuthorizedTranscript(payload, authorizedTranscript);
    if (payload.includeAnalysis) {
      const authorizedAnalysis = await requireTranscriptAnalysis(request, payload.transcript.jobId);
      payload = { ...payload, analysis: hasUsableAnalysis(authorizedAnalysis) ? toPdfAnalysis(authorizedAnalysis) : undefined };
    }
    browser = await puppeteer.launch({
      headless: "shell",
      timeout: 30_000,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--hide-scrollbars", "--mute-audio"],
    });
    page = await browser.newPage();
    page.setDefaultTimeout(PDF_TIMEOUT_MS);

    const html = await buildHtml(payload);
    await page.setContent(html, { waitUntil: "load", timeout: PDF_TIMEOUT_MS });
    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((resolve) => window.setTimeout(resolve, 5000))]));
    await page.emulateMediaType("screen");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "18mm", right: "18mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footerTemplate(),
      timeout: PDF_TIMEOUT_MS,
    });

    await recordPDFExportAudit(request, payload, "success");

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfDownloadFilename(payload.transcript)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const routeError = normalizeRouteError(error);
    if (payload) await recordPDFExportAudit(request, payload, "failure");
    return NextResponse.json({ error: { code: routeError.code, message: routeError.message, details: null } }, { status: routeError.status });
  } finally {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

async function requireTranscriptAnalysis(request: NextRequest, jobId: string) {
  const response = await fetch(`${BACKEND_URL}/api/transcripts/${encodeURIComponent(jobId)}/analysis`, {
    method: "GET",
    headers: { Cookie: request.headers.get("cookie") ?? "", Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
  });
  if (response.status === 401) throw routeError(401, "UNAUTHENTICATED", "Authentication is required");
  if (response.status === 403) throw routeError(403, "FORBIDDEN", "You do not have permission to export this transcript.");
  if (response.status === 404) throw routeError(404, "TRANSCRIPT_NOT_FOUND", "Transcript was not found.");
  if (!response.ok) throw routeError(500, "TRANSCRIPT_ANALYSIS_CHECK_FAILED", "Transcript analysis check failed");
  return response.json() as Promise<TranscriptAnalysis>;
}

async function requireTranscriptAccess(request: NextRequest, jobId: string) {
  const response = await fetch(`${BACKEND_URL}/api/transcripts/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: { Cookie: request.headers.get("cookie") ?? "", Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
  });
  if (response.status === 401) throw routeError(401, "UNAUTHENTICATED", "Authentication is required");
  if (response.status === 403) throw routeError(403, "FORBIDDEN", "You do not have permission to export this transcript.");
  if (response.status === 404) throw routeError(404, "TRANSCRIPT_NOT_FOUND", "Transcript was not found.");
  if (!response.ok) throw routeError(500, "TRANSCRIPT_ACCESS_CHECK_FAILED", "Transcript access check failed");
  return response.json() as Promise<TranscriptDetail>;
}

function withAuthorizedTranscript(payload: PdfExportPayload, transcript: TranscriptDetail): PdfExportPayload {
  return {
    ...payload,
    transcript: {
      jobId: transcript.jobId,
      filename: transcript.filename,
      category: transcript.category,
      referenceNumber: transcript.referenceNumber,
      notes: transcript.notes,
      createdAt: transcript.createdAt,
      status: transcript.status,
      speakers: transcript.speakers,
      segmentCount: transcript.segmentCount,
      segments: transcript.segments.map((segment) => ({
        id: segment.id,
        segmentIndex: segment.segmentIndex,
        speaker: getSpeakerDisplayName(segment.speaker, transcript.speakerNames),
        startTime: segment.startTime,
        endTime: segment.endTime,
        transcriptText: segment.transcriptText,
      })),
    },
  };
}

async function recordPDFExportAudit(request: NextRequest, payload: PdfExportPayload, outcome: "success" | "failure") {
  await fetch(`${BACKEND_URL}/api/audit/pdf-export`, {
    method: "POST",
    headers: { Cookie: request.headers.get("cookie") ?? "", "Content-Type": "application/json", Accept: "application/json" },
    cache: "no-store",
    body: JSON.stringify({ jobId: payload.transcript.jobId, format: payload.format, includeAnalysis: payload.includeAnalysis, outcome }),
  }).catch(() => undefined);
}

async function requireAuthenticated(request: NextRequest) {
  const cookie = request.headers.get("cookie") ?? "";
  if (!cookie) throw routeError(401, "UNAUTHENTICATED", "Authentication is required");
  const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
    method: "GET",
    headers: { Cookie: cookie, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(AUTH_CHECK_TIMEOUT_MS),
  });
  if (response.status === 401) throw routeError(401, "UNAUTHENTICATED", "Authentication is required");
  if (!response.ok) throw routeError(500, "AUTH_CHECK_FAILED", "Authentication check failed");
}

async function readAndValidatePayload(request: NextRequest): Promise<PdfExportPayload> {
  const raw = await request.text();
  if (raw.length > MAX_REQUEST_BYTES) throw routeError(413, "PAYLOAD_TOO_LARGE", "PDF export request is too large.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw routeError(400, "BAD_REQUEST", "Request body must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") throw routeError(400, "BAD_REQUEST", "Request body must be an object.");
  const payload = parsed as Partial<PdfExportPayload>;
  const transcript = payload.transcript;
  if (!transcript || typeof transcript !== "object") throw routeError(400, "BAD_REQUEST", "Transcript data is required.");
  if (!isNonEmptyString(transcript.jobId)) throw routeError(400, "BAD_REQUEST", "Transcript job ID is required.");
  if (!isNonEmptyString(transcript.filename)) throw routeError(400, "BAD_REQUEST", "Transcript filename is required.");
  if (payload.format !== "segmented" && payload.format !== "paragraph") throw routeError(400, "BAD_REQUEST", "Unsupported PDF format.");
  if (!Array.isArray(transcript.segments) || transcript.segments.length === 0) throw routeError(400, "BAD_REQUEST", "At least one transcript segment is required.");
  transcript.segments.forEach(validateSegment);

  const includeAnalysis = payload.includeAnalysis === true;
  const analysis = includeAnalysis ? sanitizeAnalysis(payload.analysis) : undefined;
  if (includeAnalysis && !hasUsableAnalysis(analysis)) throw routeError(400, "BAD_REQUEST", "Complete analysis data is required when includeAnalysis is true.");

  return {
    transcript: {
      jobId: transcript.jobId.trim(),
      filename: transcript.filename.trim(),
      category: typeof transcript.category === "string" ? transcript.category.trim() : "",
      referenceNumber: typeof transcript.referenceNumber === "string" ? transcript.referenceNumber.trim() : "",
      notes: typeof transcript.notes === "string" ? transcript.notes : "",
      createdAt: typeof transcript.createdAt === "string" ? transcript.createdAt : "",
      status: typeof transcript.status === "string" ? transcript.status : "unknown",
      speakers: numberOrZero(transcript.speakers),
      segmentCount: numberOrZero(transcript.segmentCount),
      segments: transcript.segments.map((segment) => ({
        id: String(segment.id).trim(),
        segmentIndex: numberOrZero(segment.segmentIndex),
        speaker: String(segment.speaker || "Unknown speaker").trim(),
        startTime: numberOrZero(segment.startTime),
        endTime: numberOrZero(segment.endTime),
        transcriptText: String(segment.transcriptText || ""),
      })),
    },
    format: payload.format,
    includeAnalysis,
    analysis,
  };
}

function sanitizeAnalysis(analysis: unknown): PdfExportPayload["analysis"] {
  if (!analysis || typeof analysis !== "object") return undefined;
  const typed = analysis as Partial<NonNullable<PdfExportPayload["analysis"]>>;
  return {
    status: typeof typed.status === "string" ? typed.status : "not_started",
    keywords: Array.isArray(typed.keywords) ? typed.keywords.map((item) => String(item).trim()).filter(Boolean) : [],
    entities: Array.isArray(typed.entities) ? typed.entities.map((item) => String(item).trim()).filter(Boolean) : [],
    summary: typeof typed.summary === "string" ? typed.summary : "",
    classification: typeof typed.classification === "string" ? typed.classification : "",
    englishTranslation: typeof typed.englishTranslation === "string" ? typed.englishTranslation : "",
    review: typed.review ?? { status: "unreviewed", reviewedByUserId: null, reviewedByDisplayName: null, reviewedAt: null, note: null },
  };
}

function validateSegment(segment: unknown, index: number) {
  if (!segment || typeof segment !== "object") throw routeError(400, "BAD_REQUEST", `Segment ${index + 1} is malformed.`);
  const typed = segment as Partial<PdfExportSegment>;
  if (!isNonEmptyString(typed.id)) throw routeError(400, "BAD_REQUEST", `Segment ${index + 1} is missing an ID.`);
  if (!Number.isFinite(typed.segmentIndex)) throw routeError(400, "BAD_REQUEST", `Segment ${index + 1} has an invalid index.`);
  if (!Number.isFinite(typed.startTime) || !Number.isFinite(typed.endTime)) throw routeError(400, "BAD_REQUEST", `Segment ${index + 1} has invalid timestamps.`);
  if (typeof typed.transcriptText !== "string") throw routeError(400, "BAD_REQUEST", `Segment ${index + 1} has invalid transcript text.`);
}

async function buildHtml(payload: PdfExportPayload) {
  const fontFace = await farumaFontFace();
  const transcriptHtml = payload.format === "segmented" ? segmentedHtml(payload.transcript.segments) : paragraphHtml(payload.transcript.segments);
  const analysisHtml = payload.includeAnalysis && payload.analysis ? buildAnalysisHtml(payload.analysis) : "";
  const generatedAt = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    ${fontFace}
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #171717; font-family: Inter, Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.55; direction: ltr; }
    h1, h2, h3, p { margin: 0; }
    .header { border-bottom: 1px solid #d4d4d4; padding-bottom: 6mm; margin-bottom: 6mm; }
    .eyebrow { color: #737373; font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; }
    .title { font-size: 20pt; margin-top: 1mm; }
    .subtitle { color: #525252; margin-top: 2mm; word-break: break-word; }
    .metadata { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2mm 6mm; margin: 5mm 0 7mm; }
    .meta-item { border-bottom: 1px solid #eeeeee; padding-bottom: 1.5mm; }
    .meta-label { color: #737373; font-size: 8pt; text-transform: uppercase; }
    .meta-value { margin-top: 0.5mm; word-break: break-word; }
    .notes { border-left: 3px solid #d4d4d4; padding: 2mm 3mm; margin-bottom: 6mm; white-space: pre-wrap; }
    .section-title { font-size: 14pt; margin: 6mm 0 3mm; border-bottom: 1px solid #e5e5e5; padding-bottom: 2mm; }
    .segment { break-inside: avoid; margin-bottom: 4mm; padding-bottom: 3mm; border-bottom: 1px solid #eeeeee; }
    .segment-header, .speaker-heading { direction: ltr; unicode-bidi: isolate; font-family: Inter, Arial, Helvetica, sans-serif; font-weight: 700; color: #404040; margin-bottom: 1.5mm; }
    .segment-text, .paragraph-text { direction: rtl; unicode-bidi: plaintext; text-align: right; white-space: pre-wrap; font-family: FarumaPdf, 'MV Faruma', 'Noto Sans Thaana', Arial, sans-serif; font-size: 12pt; line-height: 1.9; }
    .paragraph-block { break-inside: avoid; margin-bottom: 5mm; }
    .analysis { margin-top: 7mm; }
    .analysis-card { break-inside: avoid; margin-bottom: 4mm; }
    .analysis h3 { font-size: 10.5pt; margin-bottom: 1mm; color: #404040; }
    .analysis p { white-space: pre-wrap; }
    .analysis .translation { direction: ltr; unicode-bidi: isolate; text-align: left; }
    .pills { display: flex; flex-wrap: wrap; gap: 1.5mm; }
    .pill { display: inline-block; border: 1px solid #d4d4d4; border-radius: 99px; padding: 0.8mm 2mm; margin: 0 1mm 1mm 0; background: #f7f7f7; font-size: 9pt; }
  </style>
</head>
<body>
  <header class="header">
    <div class="eyebrow">Transcript App PDF Export</div>
    <h1 class="title">Transcript Report</h1>
    <p class="subtitle">${escapeHtml(payload.transcript.filename)}</p>
    <p class="subtitle">Generated ${escapeHtml(formatDate(generatedAt))}</p>
  </header>
  ${metadataHtml(payload)}
  <h2 class="section-title">Transcript (${escapeHtml(formatLabel(payload.format))})</h2>
  ${transcriptHtml}
  ${analysisHtml}
</body>
</html>`;
}

function segmentedHtml(segments: PdfExportSegment[]) {
  return sortPdfSegments(segments).map((segment) => `
    <section class="segment">
      <div class="segment-header">${escapeHtml(segment.speaker || "Unknown speaker")} - ${formatPdfTimestamp(segment.startTime)}-${formatPdfTimestamp(segment.endTime)}</div>
      <div class="segment-text" lang="dv">${escapeHtml(segment.transcriptText || "")}</div>
    </section>`).join("");
}

function paragraphHtml(segments: PdfExportSegment[]) {
  return groupSegmentsBySpeaker(segments).map((group) => `
    <section class="paragraph-block">
      <div class="speaker-heading">${escapeHtml(group.speaker)}</div>
      <div class="paragraph-text" lang="dv">${escapeHtml(group.text)}</div>
    </section>`).join("");
}

function metadataHtml(payload: PdfExportPayload) {
  const transcript = payload.transcript;
  const notes = transcript.notes?.trim();
  return `
    <section class="metadata">
      ${metaItem("Reference", transcript.referenceNumber || "Not provided")}
      ${metaItem("Category", transcript.category || "Uncategorized")}
      ${metaItem("Status", formatLabel(transcript.status))}
      ${metaItem("Created", transcript.createdAt ? formatDate(transcript.createdAt) : "Unknown")}
      ${metaItem("Speakers", String(transcript.speakers || 0))}
      ${metaItem("Segments", String(transcript.segmentCount || transcript.segments.length))}
    </section>
    ${notes ? `<section class="notes"><div class="meta-label">Notes</div><div>${escapeHtml(notes)}</div></section>` : ""}`;
}

function buildAnalysisHtml(analysis: NonNullable<PdfExportPayload["analysis"]>) {
  const review = analysis.review;
  const reviewDetails = review.status !== "unreviewed"
    ? [
        review.reviewedByDisplayName ? `Reviewer: ${review.reviewedByDisplayName}` : "",
        review.reviewedAt ? `Reviewed: ${formatDate(review.reviewedAt)}` : "",
        review.note ? `Note: ${review.note}` : "",
      ].filter(Boolean).join("\n")
    : "";
  const sections = [
    `<div class="analysis-card"><h3>Transcript Review</h3><span class="pill">${escapeHtml(analysisReviewStatusLabel(review.status))}</span>${reviewDetails ? `<p>${escapeHtml(reviewDetails)}</p>` : ""}</div>`,
    analysis.summary.trim() ? `<div class="analysis-card"><h3>Summary</h3><p>${escapeHtml(analysis.summary.trim())}</p></div>` : "",
    analysis.classification.trim() ? `<div class="analysis-card"><h3>Classification</h3><span class="pill">${escapeHtml(formatLabel(analysis.classification.trim()))}</span></div>` : "",
    analysis.keywords.length > 0 ? `<div class="analysis-card"><h3>Keywords</h3><div class="pills">${analysis.keywords.map((keyword) => `<span class="pill">${escapeHtml(keyword)}</span>`).join("")}</div></div>` : "",
    analysis.entities.length > 0 ? `<div class="analysis-card"><h3>Entities</h3><div class="pills">${analysis.entities.map((entity) => `<span class="pill">${escapeHtml(entity)}</span>`).join("")}</div></div>` : "",
    analysis.englishTranslation.trim() ? `<div class="analysis-card"><h3>English Translation</h3><p class="translation">${escapeHtml(analysis.englishTranslation.trim())}</p></div>` : "",
  ].filter(Boolean).join("");
  return sections ? `<section class="analysis"><h2 class="section-title">Stored Analysis</h2>${sections}</section>` : "";
}

async function farumaFontFace() {
  try {
    const fontPath = path.join(process.cwd(), "src", "app", "fonts", "Faruma.ttf");
    const font = await readFile(fontPath);
    return `@font-face { font-family: FarumaPdf; src: url(data:font/ttf;base64,${font.toString("base64")}) format('truetype'); font-weight: 400; font-style: normal; font-display: swap; }`;
  } catch {
    return "";
  }
}

function metaItem(label: string, value: string) {
  return `<div class="meta-item"><div class="meta-label">${escapeHtml(label)}</div><div class="meta-value">${escapeHtml(value)}</div></div>`;
}

function footerTemplate() {
  return `<div style="width:100%;font-size:8pt;color:#737373;display:flex;justify-content:space-between;padding:0 18mm;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;">
    <span>Generated by Transcript App</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")} UTC`;
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function routeError(status: number, code: string, message: string): RouteError {
  return { status, code, message };
}

function normalizeRouteError(error: unknown): RouteError {
  if (isRouteError(error)) return error;
  return routeError(500, "PDF_GENERATION_FAILED", "PDF generation failed. Please try again.");
}

function isRouteError(error: unknown): error is RouteError {
  return Boolean(error && typeof error === "object" && "status" in error && "code" in error && "message" in error);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function numberOrZero(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
