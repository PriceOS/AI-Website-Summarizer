import type { Metadata } from "next";
import { AppThemeProvider } from "../components/app-theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Website Summarizer",
  description: "Summarize webpages with Next.js, MUI, and the Vercel AI SDK.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
