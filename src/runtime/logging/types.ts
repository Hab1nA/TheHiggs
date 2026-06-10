export type RuntimeLogStage =
  | "frontend"
  | "api"
  | "runtime"
  | "refine"
  | "tool_decision"
  | "tool_execution"
  | "ui_generation"
  | "post_process"
  | "deterministic_post_process"
  | "visual_polish"
  | "consistency_review"
  | "functionality_review"
  | "validation"
  | "post_runtime";

export type RuntimeLogStatus =
  | "started"
  | "success"
  | "failure"
  | "info"
  | "skipped";

export type PageLogContext = {
  pageLogId: string;
  pageStartedAt: string;
  sessionId?: string;
  initialQuery?: string;
};

export type RuntimeLogEvent = {
  id?: string;
  type: string;
  timestamp?: string;
  pageLogId?: string;
  sessionId?: string;
  turn?: number;
  stage?: RuntimeLogStage;
  status?: RuntimeLogStatus;
  durationMs?: number;
  payload?: unknown;
};

export type RuntimeLogAppendInput = Omit<
  RuntimeLogEvent,
  "id" | "timestamp"
> & {
  timestamp?: string;
};

export type RuntimeLogFileRecord = {
  pageLogId: string;
  filePath: string;
};
