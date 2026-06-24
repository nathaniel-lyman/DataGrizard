/**
 * Tailwind config for the precompiled library stylesheet (dist/datagrid.css).
 * Only scans the reusable component so the shipped CSS stays small. Note:
 * consumer-supplied classNames (e.g. statusStyles / conditionalFormats) are NOT
 * scanned here — those are the consumer's responsibility (see README styling).
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ["./src/components/DataGrid/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
