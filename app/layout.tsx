import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Elevate — Tracking Dashboard",
  description: "Acquisition funnel: visitors → opt-ins → checkouts → purchases.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}
