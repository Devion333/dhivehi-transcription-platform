// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: config.ts
// Description: Application configuration
// First Written on: 03/07/2026
// Edited on: 21/07/2026
// Browser-facing API base path.
// In production, Next.js proxies /backend/* to the Go container.
export const BACKEND_URL =
    process.env.NEXT_PUBLIC_BACKEND_URL ?? "/backend";
