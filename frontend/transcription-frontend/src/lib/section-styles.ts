// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: section-styles.ts
// Description: Utility module: section-styles
// First Written on: 03/07/2026
// Edited on: 21/07/2026
export type SectionTone = "primary" | "transcript" | "analysis" | "folder" | "notification" | "admin" | "success" | "warning" | "danger" | "neutral";

export const sectionToneClasses: Record<SectionTone, { border: string; icon: string; text: string; panel: string }> = {
  primary: {
    border: "border-[var(--accent-primary-border)]",
    icon: "bg-[var(--accent-primary-bg)] text-[var(--accent-primary)] ring-1 ring-[var(--accent-primary-border)]",
    text: "text-[var(--accent-primary)]",
    panel: "border-[var(--accent-primary-border)] bg-[var(--accent-primary-bg)] text-[var(--accent-primary)]",
  },
  transcript: {
    border: "border-[var(--accent-transcript-border)]",
    icon: "bg-[var(--accent-transcript-bg)] text-[var(--accent-transcript)] ring-1 ring-[var(--accent-transcript-border)]",
    text: "text-[var(--accent-transcript)]",
    panel: "border-[var(--accent-transcript-border)] bg-[var(--accent-transcript-bg)] text-[var(--accent-transcript)]",
  },
  analysis: {
    border: "border-[var(--accent-analysis-border)]",
    icon: "bg-[var(--accent-analysis-bg)] text-[var(--accent-analysis)] ring-1 ring-[var(--accent-analysis-border)]",
    text: "text-[var(--accent-analysis)]",
    panel: "border-[var(--accent-analysis-border)] bg-[var(--accent-analysis-bg)] text-[var(--accent-analysis)]",
  },
  folder: {
    border: "border-[var(--accent-folder-border)]",
    icon: "bg-[var(--accent-folder-bg)] text-[var(--accent-folder)] ring-1 ring-[var(--accent-folder-border)]",
    text: "text-[var(--accent-folder)]",
    panel: "border-[var(--accent-folder-border)] bg-[var(--accent-folder-bg)] text-[var(--accent-folder)]",
  },
  notification: {
    border: "border-[var(--accent-notification-border)]",
    icon: "bg-[var(--accent-notification-bg)] text-[var(--accent-notification)] ring-1 ring-[var(--accent-notification-border)]",
    text: "text-[var(--accent-notification)]",
    panel: "border-[var(--accent-notification-border)] bg-[var(--accent-notification-bg)] text-[var(--accent-notification)]",
  },
  admin: {
    border: "border-[var(--accent-admin-border)]",
    icon: "bg-[var(--accent-admin-bg)] text-[var(--accent-admin)] ring-1 ring-[var(--accent-admin-border)]",
    text: "text-[var(--accent-admin)]",
    panel: "border-[var(--accent-admin-border)] bg-[var(--accent-admin-bg)] text-[var(--accent-admin)]",
  },
  success: {
    border: "border-[var(--accent-success-border)]",
    icon: "bg-[var(--accent-success-bg)] text-[var(--accent-success)] ring-1 ring-[var(--accent-success-border)]",
    text: "text-[var(--accent-success)]",
    panel: "border-[var(--accent-success-border)] bg-[var(--accent-success-bg)] text-[var(--accent-success)]",
  },
  warning: {
    border: "border-[var(--accent-warning-border)]",
    icon: "bg-[var(--accent-warning-bg)] text-[var(--accent-warning)] ring-1 ring-[var(--accent-warning-border)]",
    text: "text-[var(--accent-warning)]",
    panel: "border-[var(--accent-warning-border)] bg-[var(--accent-warning-bg)] text-[var(--accent-warning)]",
  },
  danger: {
    border: "border-[var(--accent-danger-border)]",
    icon: "bg-[var(--accent-danger-bg)] text-[var(--accent-danger)] ring-1 ring-[var(--accent-danger-border)]",
    text: "text-[var(--accent-danger)]",
    panel: "border-[var(--accent-danger-border)] bg-[var(--accent-danger-bg)] text-[var(--accent-danger)]",
  },
  neutral: {
    border: "border-[var(--accent-neutral-border)]",
    icon: "bg-[var(--accent-neutral-bg)] text-[var(--accent-neutral)] ring-1 ring-[var(--accent-neutral-border)]",
    text: "text-[var(--accent-neutral)]",
    panel: "border-[var(--accent-neutral-border)] bg-[var(--accent-neutral-bg)] text-[var(--accent-neutral)]",
  },
};
