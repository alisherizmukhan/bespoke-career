import type { Config } from "tailwindcss";

/**
 * Direction: steady, exact, quietly encouraging — the job-search desk (offer letters, salary tables, ink on paper).
 * Surfaces are warm paper neutrals; the dark hero uses an ink ramp. The brand violet is the only accent.
 * Legacy token names (lavender/violet-100..400) are kept so every component inherits the neutral ramp.
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // accent (brand violet) + neutral steps under the old tint names
        violet: { 100: "#efede8", 200: "#dedad2", 300: "#c9c4ba", 400: "#a8a297", 600: "#6c47d9", 700: "#5634b8", 900: "#11131b" },
        lavender: { 50: "#f7f6f3", 100: "#efede8", 200: "#e4e1da" },
        accent: { DEFAULT: "#6c47d9", ink: "#5634b8", soft: "#efeafc" },
        ink: { DEFAULT: "#1c1a17", muted: "#54504a", faint: "#6e6860" },
        night: { 950: "#07080d", 900: "#0b0d14", 800: "#11141c", 700: "#1a1e28", 600: "#272c38", 500: "#3b4254", line: "rgba(238,240,245,0.08)", text: "#f2f4f8", soft: "#b8bdca", mute: "#8e95a6" },
        line: "#e7e4dd", // decorative hairlines (cards, dividers)
        field: "#8a8478", // form-field borders: 3.7:1 on white, meets WCAG 1.4.11
        success: { DEFAULT: "#1f6b43", soft: "#e6f0e9" },
        warning: { DEFAULT: "#8a5300", soft: "#f6ecdc" },
        danger: { DEFAULT: "#a3221b", soft: "#f7e6e4" },
        rating: "#b98900",
      },
      fontFamily: {
        display: ['"Instrument Sans Variable"', '"Instrument Sans"', "system-ui", "sans-serif"],
        sans: ['"Instrument Sans Variable"', '"Instrument Sans"', "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      // Type scale: the only font sizes used in the interface (Tailwind's xs 12, sm 14, base 16, lg 18, xl 20,
      // 2xl 24 and 4xl 36 stay available). Nothing smaller than 12px.
      fontSize: {
        small: "13px", body: "15px", h3: "28px", h2: "32px", h1: "40px",
        "display-sm": "44px", display: "56px", "display-lg": "68px",
      },
      // Slightly heavier than the defaults so text stays comfortable to read
      fontWeight: { normal: "450", medium: "550", semibold: "620", bold: "680" },
      borderRadius: { sm: "6px", md: "10px", lg: "14px", xl: "20px" },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.05)",
        pop: "0 8px 24px rgba(0,0,0,0.08)",
        float: "0 24px 48px rgba(7,8,13,0.18)",
      },
      transitionTimingFunction: { out: "cubic-bezier(0.22, 1, 0.36, 1)" },
      maxWidth: { content: "1200px" },
    },
  },
  plugins: [],
};
export default config;
