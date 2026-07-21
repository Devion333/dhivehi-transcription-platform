// Programmer Name : Mr. Reehan Mohamed Ashraf, TP077077, APD3F2511SE, Software Engineering Student, APU, Technology Park Malaysia
// Program Name: tailwind.config.js
// Description: Tailwind CSS configuration
// First Written on: 03/07/2026
// Edited on: 21/07/2026
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'], // ðŸŒ™ Enables dark mode via a .dark class
  content: [
    './src/app/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
    './src/lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
