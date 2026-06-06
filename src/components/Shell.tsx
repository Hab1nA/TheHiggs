// ============================================================
// Shell — 应用外壳组件
// ============================================================

"use client";

import React from "react";

export default function Shell({
  children,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {children}
    </div>
  );
}
