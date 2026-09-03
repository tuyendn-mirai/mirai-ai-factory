import type { PendingAttachment } from "./types";

// Bridges the Empty (new-chat) composer to the freshly created thread
// page: creating a thread is a plain POST (not part of the SSE turn), so
// the empty-state Composer creates the thread, stashes the first message
// here, and navigates to /chat/[threadId] — whose page picks it up on
// mount and immediately starts the stream, so the whole flow reads as one
// continuous send from the user's perspective.
const KEY = "mirai-hub-pending-message";

interface PendingMessage {
  threadId: string;
  content: string;
  attachments: PendingAttachment[];
}

export function stashPendingMessage(msg: PendingMessage) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(msg));
}

export function popPendingMessage(threadId: string): PendingMessage | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(KEY);
  try {
    const parsed = JSON.parse(raw) as PendingMessage;
    return parsed.threadId === threadId ? parsed : null;
  } catch {
    return null;
  }
}
