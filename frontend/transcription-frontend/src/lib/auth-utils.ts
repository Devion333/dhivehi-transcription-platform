const protectedRoutes = ["/", "/Transcripts", "/Search", "/Admin"];

export function isPublicRoute(pathname: string) {
  return pathname === "/Login";
}

export function isProtectedRoute(pathname: string) {
  if (isPublicRoute(pathname)) return false;
  return protectedRoutes.some((route) => route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`));
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  if (value.startsWith("/Login")) return "/";
  return value;
}

export function isAdminRoute(pathname: string) {
  return pathname === "/Admin" || pathname.startsWith("/Admin/");
}
