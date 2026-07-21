// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: pdfGenerator.ts
// Description: Utility module: pdfGenerator
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { PdfExportPayload } from "./pdf-export-types";
import { pdfDownloadFilename } from "./pdf-export-utils";

export async function generateTranscriptPdf(data: PdfExportPayload): Promise<void> {
  const response = await fetch('/api/export-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(err?.error?.message || `PDF generation failed with status ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/pdf")) throw new Error("The export route did not return a PDF file.");

  const blob = await response.blob();
  if (blob.size === 0) throw new Error("The generated PDF was empty.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.target = '_self';
  a.download = filenameFromContentDisposition(response.headers.get("Content-Disposition")) ?? pdfDownloadFilename(data.transcript);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function filenameFromContentDisposition(value: string | null) {
  if (!value) return null;
  const match = value.match(/filename="?([^";]+)"?/i);
  return match?.[1] || null;
}
