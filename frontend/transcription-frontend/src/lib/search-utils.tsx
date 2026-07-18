import * as React from "react";

import { isProbablyDhivehi } from "./transcript-details-utils";

export const searchPageSize = 20;

export function normalizeSearchPage(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function normalizeSearchText(value: string | null) {
  return (value ?? "").trim();
}

export function normalizeSearchStatus(value: string | null) {
  return value?.trim() || "all";
}

export function searchTextProps(text: string) {
  return {
    dir: isProbablyDhivehi(text) ? "rtl" : "auto",
    className: isProbablyDhivehi(text) ? "transcript-text text-right" : "whitespace-pre-wrap",
  } as const;
}

export function highlightedText(text: string, query: string) {
  const parts = splitMatches(text, query);
  if (parts.length === 1) return text;
  return parts.map((part, index) => part.match ? <mark key={`${part.text}-${index}`} className="rounded bg-[var(--accent-warning-bg)] px-0.5 text-[var(--accent-warning)] ring-1 ring-[var(--accent-warning-border)]">{part.text}</mark> : <React.Fragment key={`${part.text}-${index}`}>{part.text}</React.Fragment>);
}

function splitMatches(text: string, query: string) {
  const source = Array.from(text);
  const target = Array.from(query.trim());
  if (source.length === 0 || target.length === 0 || target.length > source.length) return [{ text, match: false }];
  const lowerSource = Array.from(text.toLowerCase());
  const lowerTarget = Array.from(query.trim().toLowerCase());
  const parts: Array<{ text: string; match: boolean }> = [];
  let buffer: string[] = [];
  for (let i = 0; i < source.length;) {
    let matched = true;
    for (let j = 0; j < lowerTarget.length; j++) {
      if (lowerSource[i + j] !== lowerTarget[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      if (buffer.length) parts.push({ text: buffer.join(""), match: false });
      parts.push({ text: source.slice(i, i + target.length).join(""), match: true });
      buffer = [];
      i += target.length;
    } else {
      buffer.push(source[i]);
      i++;
    }
  }
  if (buffer.length) parts.push({ text: buffer.join(""), match: false });
  return parts.length ? parts : [{ text, match: false }];
}
