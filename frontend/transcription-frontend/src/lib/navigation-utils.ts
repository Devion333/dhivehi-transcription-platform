const knownRoutePrefixes = [
  "/",
  "/Activity",
  "/Admin",
  "/Analysis",
  "/Folders",
  "/Help",
  "/Notifications",
  "/Search",
  "/Transcripts",
  "/Upload",
  "/Account",
  "/About",
];

export function getSafeInternalReturnPath(value: string | null | undefined, fallback: string) {
  const candidate = decodeMaybe(value);
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return fallback;
  try {
    const parsed = new URL(candidate, "http://local.invalid");
    if (parsed.origin !== "http://local.invalid") return fallback;
    if (!knownRoutePrefixes.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function withReturnTo(path: string, returnTo: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}returnTo=${encodeURIComponent(returnTo)}`;
}

function decodeMaybe(value: string | null | undefined) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
