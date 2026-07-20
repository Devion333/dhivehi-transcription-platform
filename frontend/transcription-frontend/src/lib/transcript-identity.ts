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
