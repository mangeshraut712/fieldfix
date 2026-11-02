import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FieldFix",
  description: "Photo in, repair steps out. Built on Meta Muse Spark and SAM 3.1.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
