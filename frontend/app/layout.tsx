import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/lib/auth";
import "./globals.css";

const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-display" });
const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "Bespoke — Your career, thoughtfully built", template: "%s · Bespoke" },
  description: "AI-powered career intelligence: resumes that pass ATS, real salary data, live jobs and an assistant that knows your search.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = { themeColor: "#6C47D9", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen bg-lavender-50 font-sans text-ink">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
