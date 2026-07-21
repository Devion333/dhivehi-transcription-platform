// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: upload-validation.ts
// Description: Utility module: upload-validation
// First Written on: 03/07/2026
// Edited on: 21/07/2026
export const audioExtensions = [".wav", ".mp3", ".m4a", ".ogg", ".flac"] as const;
export const videoExtensions = [".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".webm", ".m4v", ".mpeg", ".mpg"] as const;
export const supportedExtensions = [...audioExtensions, ...videoExtensions] as const;

export const categoryOptions = [
  { value: "", label: "No category" },
  { value: "meeting", label: "Meeting" },
  { value: "interview", label: "Interview" },
  { value: "lecture", label: "Lecture" },
  { value: "podcast", label: "Podcast" },
  { value: "presentation", label: "Presentation" },
  { value: "conference", label: "Conference" },
  { value: "webinar", label: "Webinar" },
  { value: "other", label: "Other" },
] as const;

export const referenceNumberMaxLength = 100;
export const notesMaxLength = 1000;
export const clientGuidanceMaxBytes = 2 * 1024 * 1024 * 1024;

export type MediaKind = "audio" | "video" | "unknown";

export interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  extension: string;
  mediaKind: MediaKind;
}

export function fileExtension(filename: string) {
  const trimmed = filename.trim().toLowerCase();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return trimmed.slice(dotIndex);
}

export function mediaKindForExtension(extension: string): MediaKind {
  if ((audioExtensions as readonly string[]).includes(extension)) return "audio";
  if ((videoExtensions as readonly string[]).includes(extension)) return "video";
  return "unknown";
}

export function isSupportedMediaFile(file: Pick<File, "name" | "type">) {
  const extension = fileExtension(file.name);
  if ((supportedExtensions as readonly string[]).includes(extension)) return true;
  return file.type.startsWith("audio/") || file.type.startsWith("video/");
}

export function validateUploadFile(file: File | null): FileValidationResult {
  if (!file) {
    return { valid: false, errors: ["Choose an audio or video file to upload."], warnings: [], extension: "", mediaKind: "unknown" };
  }

  const extension = fileExtension(file.name);
  const mediaKind = mediaKindForExtension(extension);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!file.name.trim()) errors.push("The selected file must have a filename.");
  if (!isSupportedMediaFile(file)) {
    errors.push(`Unsupported file type. Use one of: ${supportedExtensions.join(", ")}.`);
  }
  if (file.size <= 0) errors.push("The selected file appears to be empty.");
  if (file.size > clientGuidanceMaxBytes) {
    warnings.push("This file is very large. The backend has no confirmed hard limit, but upload and processing may take a long time.");
  }

  return { valid: errors.length === 0, errors, warnings, extension, mediaKind };
}

export function validateUploadMetadata(metadata: { referenceNumber: string; notes: string; requestedSpeakers: number }) {
  const errors: Record<string, string> = {};
  if (!metadata.referenceNumber.trim()) {
    errors.referenceNumber = "Reference number is required.";
  }
  if (metadata.referenceNumber.length > referenceNumberMaxLength) {
    errors.referenceNumber = `Reference number must be ${referenceNumberMaxLength} characters or fewer.`;
  }
  if (metadata.notes.length > notesMaxLength) {
    errors.notes = `Notes must be ${notesMaxLength} characters or fewer.`;
  }
  if (!Number.isInteger(metadata.requestedSpeakers) || metadata.requestedSpeakers < 1 || metadata.requestedSpeakers > 10) {
    errors.requestedSpeakers = "Requested speakers must be between 1 and 10.";
  }
  return errors;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function acceptedFileInputValue() {
  return supportedExtensions.join(",");
}
