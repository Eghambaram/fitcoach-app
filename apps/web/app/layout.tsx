import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "FitCoach — Personal Trainer Copilot", template: "%s · FitCoach" },
  description:
    "Spend less time managing your coaching business and more time helping clients get results.",
};

export const viewport: Viewport = {
  themeColor: "#18211D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
