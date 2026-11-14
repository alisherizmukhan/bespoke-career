import type { Config } from "tailwindcss";

// Tokens from the brand book (violet / lavender / white / ink), adapted for Bespoke.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        violet: { 100: "#EBE4FD", 200: "#DCD0FA", 300: "#C9B8F7", 400: "#A68BEE", 600: "#6C47D9", 700: "#4A2DB5", 900: "#1E1645" },
        lavender: { 50: "#F7F4FE", 100: "#EFEAFC", 200: "#E4DCF8" },
        ink: { DEFAULT: "#15122A", muted: "#5E5873" },
        line: "#ECE8F5",
        success: { DEFAULT: "#24663F", soft: "#E4F2E8" },
        warning: { DEFAULT: "#8A5300", soft: "#FCEFD9" },
        danger: { DEFAULT: "#A3221B", soft: "#FBE7E5" },
        rating: "#E0A800",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
      borderRadius: { sm: "8px", md: "12px", lg: "18px", xl: "28px" },
      boxShadow: {
        card: "0 1px 2px rgba(36,27,58,0.05), 0 6px 20px rgba(36,27,58,0.05)",
        pop: "0 12px 40px rgba(36,27,58,0.16)",
        float: "0 18px 50px rgba(74,45,181,0.12)",
      },
      maxWidth: { content: "1200px" },
    },
  },
  plugins: [],
};
export default config;
