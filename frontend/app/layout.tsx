import type { Metadata, Viewport } from "next";
// Fonts are self-hosted (bundled at build time) so builds never depend on Google Fonts being reachable.
import "@fontsource-variable/instrument-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import { Providers } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bespoke — Your career, thoughtfully built", template: "%s · Bespoke" },
  description: "AI-powered career intelligence: resumes that pass ATS, real salary data, live jobs and an assistant that knows your search.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { themeColor: "#0b0d14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-lavender-50 font-sans text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
