// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: template.tsx
// Description: UI component: template
// First Written on: 03/07/2026
// Edited on: 21/07/2026
// src/app/template.tsx
'use client'

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in duration-500">
      {children}
    </div>
  )
}
