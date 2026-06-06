// ============================================================
// CopilotProvider — CopilotKit 集成封装（可选占位）
// ============================================================

"use client";

import React from "react";

export function AppCopilotProvider({ children }: { children: React.ReactNode }) {
  // 第一版不启用 CopilotKit，直接透传 children
  // 启用时取消下面的注释：
  // import { CopilotKit } from "@copilotkit/react-core";
  // import "@copilotkit/react-ui/styles.css";
  // return <CopilotKit runtimeUrl="/api/copilotkit">{children}</CopilotKit>;

  return <>{children}</>;
}
