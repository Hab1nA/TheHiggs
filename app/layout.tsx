import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TheHiggs — AI-UI Co-Execution Runtime",
  description:
    "AI 驻留在自己生成的 UI 中，UI 是 AI 的交互表面，用户事件是 AI 状态转移的输入。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
