// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: transcript-identity.ts
// Description: Utility module: transcript-identity
// First Written on: 03/07/2026
// Edited on: 21/07/2026
export function transcriptReferenceLabel(referenceNumber: string | null | undefined) {
  const reference = referenceNumber?.trim();
  return reference || "No reference";
}

export function hasTranscriptReference(referenceNumber: string | null | undefined) {
  return Boolean(referenceNumber?.trim());
}

export function transcriptIdentityTitle(referenceNumber: string | null | undefined, filename: string | null | undefined) {
  return hasTranscriptReference(referenceNumber) ? transcriptReferenceLabel(referenceNumber) : filename?.trim() || "No reference";
}
