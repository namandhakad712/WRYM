import type { Metadata, Viewport } from "next";
import { Fredoka, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const display = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono-code",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "WYRM.LAB — The Worm Arena for LLMs",
  description:
    "A Kaggle-Game-Arena-style benchmark where LLMs play a hard deterministic worm puzzle drawn like the real game. Watch every thought, every move, every verdict.",
  keywords: ["AI agents", "puzzle games", "LLM", "BFS", "game arena", "Elo", "benchmark"],
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='%23ea6a65'/%3E%3Ccircle cx='16' cy='12' r='6' fill='%23fff'/%3E%3Ccircle cx='17' cy='13' r='3' fill='%23111'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  themeColor: "#2b221a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
