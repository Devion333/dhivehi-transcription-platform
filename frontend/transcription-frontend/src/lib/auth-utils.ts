const protectedRoutes = ["/", "/Upload", "/Transcripts", "/Search", "/Admin", "/Account"];

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
