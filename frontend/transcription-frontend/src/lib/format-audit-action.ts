const ACRONYMS = new Set(["API", "PDF", "ID", "URL", "IP"]);

const actionLabels: Record<string, string> = {
  "auth.login_succeeded": "Signed in",
  "auth.login_failed": "Sign-in failed",
  "auth.logout": "Signed out",
  "admin.user_created": "User created",
  "admin.user_updated": "User updated",
  "admin.user_activated": "User activated",
  "admin.user_deactivated": "User deactivated",
  "admin.password_reset": "Password reset",
  "admin.job_retry_requested": "Job retry requested",
  "admin.job_retry_succeeded": "Job retry queued",
  "admin.job_retry_failed": "Job retry failed",
  "transcript.uploaded": "Transcript uploaded",
  "transcript.viewed": "Transcript viewed",
  "transcript.segment_updated": "Transcript edited",
  "analysis.started": "Analysis started",
  "analysis.completed": "Analysis completed",
  "analysis.failed": "Analysis failed",
  "search.executed": "Search executed",
  "export.pdf_generated": "PDF exported",
  "export.pdf_failed": "PDF export failed",
  "transcript.deleted": "Transcript deleted",
  "transcript.downloaded": "Transcript downloaded",
  "transcript.assigned": "Transcript assigned",
  "transcript.folder_changed": "Folder changed",
  "admin.settings_updated": "Settings updated",
  "admin.settings_restored": "Settings restored to defaults",
  "admin.user_assigned": "User assigned",
  "admin.notification_sent": "Notification sent",
  "admin.api_key_created": "API key created",
  "admin.api_key_revoked": "API key revoked",
};

function splitWords(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "_" || char === "-" || char === ".") {
      if (current) { parts.push(current); current = ""; }
    } else if (char >= "A" && char <= "Z" && current && current.charCodeAt(current.length - 1) >= 97) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function capitalizeWord(word: string): string {
  if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase();
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function formatAuditAction(action: string): string {
  const custom = actionLabels[action];
  if (custom) return custom;
  const words = splitWords(action);
  return words.map(capitalizeWord).join(" ");
}
