import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vibe UI Runtime — AUIR",
  description:
    "LLM-driven semantic UI runtime. The AI generates UI descriptions; the frontend renders them. No code execution.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        {children}
      </body>
    </html>
  );
}
