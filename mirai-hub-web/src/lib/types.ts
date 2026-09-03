// Shared types mirroring the backend API contract documented in the
// architecture plan (mirai-hub-api, FastAPI). Keep this file the single
// source of truth for wire shapes on the frontend side.

export interface User {
  username: string;
}

export interface ThreadSummary {
  id: string;
  name: string;
  updatedAt: string;
}

export type StepType = "user_message" | "assistant_message" | "tool";

export interface ThreadAttachment {
  elementId: string;
  name: string;
  mime: string;
  size: number;
}

export interface ThreadMessage {
  id: string;
  type: StepType;
  /** Present for user_message / assistant_message steps. */
  content?: string;
  /** Present for tool steps. */
  name?: string;
  args?: unknown;
  result?: unknown;
  durationMs?: number;
  createdAt: string;
  attachments?: ThreadAttachment[];
}

export interface ThreadDetail {
  id: string;
  name: string;
  messages: ThreadMessage[];
  mcpConnected: boolean;
  mcpProjectId: string | null;
  mcpProjectName: string | null;
  llmModel: string;
}

export interface McpProject {
  id: string;
  name: string;
}

export interface McpConnectResult {
  connected: boolean;
  toolCount: number | null;
  projectName: string | null;
}

// ---- SSE event shapes for POST /api/threads/{id}/messages ----

export interface TokenEvent {
  type: "token";
  delta: string;
}

export interface ToolStartEvent {
  type: "tool_start";
  name: string;
  args: unknown;
}

export interface ToolEndEvent {
  type: "tool_end";
  name: string;
  result: unknown;
  durationMs: number;
}

export interface MessageDoneEvent {
  type: "message_done";
  assistantStepId: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export type ThreadStreamEvent =
  | TokenEvent
  | ToolStartEvent
  | ToolEndEvent
  | MessageDoneEvent
  | ErrorEvent;

export interface PendingAttachment {
  elementId: string;
  name: string;
  mime: string;
  size: number;
}
