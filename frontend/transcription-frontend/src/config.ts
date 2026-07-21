// Browser-facing config. The rebuilt frontend talks to the Go backend only.
export const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8100";
