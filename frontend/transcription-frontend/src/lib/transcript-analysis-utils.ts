// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: transcript-analysis-utils.ts
// Description: Utility module: transcript-analysis-utils
// First Written on: 03/07/2026
// Edited on: 21/07/2026
import type { TranscriptAnalysis, TranscriptDetail } from "./api/types";
import { transcriptTextProps } from "./transcript-details-utils";

export type EntityGroup = {
  label: string;
  values: string[];
};

export function canRunAnalysis(detail: TranscriptDetail | null) {
  return detail?.status === "transcribed";
}

export function hasAnalysisContent(analysis: TranscriptAnalysis | null) {
  if (!analysis) return false;
  return Boolean(
    analysis.summary.trim() ||
      analysis.classification.trim() ||
      analysis.englishTranslation.trim() ||
      analysis.keywords.length > 0 ||
      normalizeEntities(analysis.entities).some((group) => group.values.length > 0),
  );
}

export function normalizeEntities(entities: unknown): EntityGroup[] {
  if (!entities || typeof entities !== "object" || Array.isArray(entities)) return [];
  return Object.entries(entities)
    .map(([key, value]) => ({ label: entityLabel(key), values: normalizeEntityValues(value) }))
    .filter((group) => group.values.length > 0);
}

export function analysisTextProps(text: string) {
  return transcriptTextProps(text);
}

function normalizeEntityValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, nested]) => normalizeEntityValues(nested).map((item) => `${entityLabel(key)}: ${item}`));
  }
  if (value === null || value === undefined) return [];
  return [String(value)];
}

function entityLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
