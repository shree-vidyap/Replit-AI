import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Builder",
  description: "Describe a React app, edit it in the browser, run it instantly, and deploy it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
