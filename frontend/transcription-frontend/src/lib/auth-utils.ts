// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: auth-utils.ts
// Description: Utility module: auth-utils
// First Written on: 03/07/2026
// Edited on: 21/07/2026
const protectedRoutes = ["/", "/Upload", "/Transcripts", "/Folders", "/Search", "/Admin", "/Account", "/Notifications", "/Activity", "/Analysis", "/Help", "/Supported-Formats", "/About"];

export function isPublicRoute(pathname: string) {
  return pathname === "/Login";
}

export function isProtectedRoute(pathname: string) {
  if (isPublicRoute(pathname)) return false;
  return protectedRoutes.some((route) => route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`));
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value) return "/";
  let path = value.trim();
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(path);
      if (decoded === path) break;
      path = decoded;
    } catch {
      return "/";
    }
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(path)) return "/";
  if (path.toLowerCase().startsWith("/login")) return "/";
  return path;
}

export function isAdminRoute(pathname: string) {
  return pathname === "/Admin" || pathname.startsWith("/Admin/");
}
