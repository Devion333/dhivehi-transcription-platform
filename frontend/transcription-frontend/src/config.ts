// Browser-facing API base path.
// In production, Next.js proxies /backend/* to the Go container.
export const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "/backend";