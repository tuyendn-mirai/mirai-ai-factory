"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./useThreads";
import type { PendingAttachment, ThreadStreamEvent } from "@/lib/types";

// A live turn is a chronological sequence of text and tool-call segments —
// a tool-calling turn round-trips the model multiple times (see
// app/chat_loop.py's `for round_no in range(...)` loop), so a turn can be
// text, then a tool call, then more text reacting to the result. Keeping
// one ordered list (instead of a single accumulated string plus a
// separate tool-steps array) is what lets the live view render them
// interleaved in the order they actually happened, matching how the
// persisted steps render once the turn finishes and messages refetch.
export type StreamTurnItem =
  | { kind: "text"; id: string; text: string }
  | {
      kind: "tool";
      id: string;
      name: string;
      args: unknown;
      result?: unknown;
      durationMs?: number;
      status: "running" | "done";
    };

export interface PendingUserMessage {
  content: string;
  attachments: PendingAttachment[];
}

interface StreamState {
  streaming: boolean;
  turnItems: StreamTurnItem[];
  error: string | null;
  // The backend persists the user's step immediately, but `messages` (from
  // useThreadQuery) only reflects it once the post-turn invalidation below
  // refetches — without this, the question the user just typed doesn't
  // appear at all until the assistant's whole reply has finished.
  pendingUserMessage: PendingUserMessage | null;
}

const initialState: StreamState = {
  streaming: false,
  turnItems: [],
  error: null,
  pendingUserMessage: null,
};

/**
 * Hand-rolled SSE reader for POST /api/threads/{id}/messages. The event
 * shape (token / tool_start / tool_end / message_done / error) is custom
 * to this backend and doesn't map onto the Vercel AI SDK's useChat wire
 * protocol, so we parse the stream ourselves.
 *
 * This hook owns only the in-flight turn's transient state; once
 * message_done fires we invalidate the TanStack Query cache for this
 * thread (and the thread list, since name/updatedAt may have changed) so
 * the persisted messages become the single source of truth again.
 */
export function useThreadStream(threadId: string) {
  const [state, setState] = useState<StreamState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  const reset = useCallback(() => setState(initialState), []);

  const sendMessage = useCallback(
    async (content: string, attachments: PendingAttachment[]) => {
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        streaming: true,
        turnItems: [],
        error: null,
        pendingUserMessage: { content, attachments },
      });

      try {
        const res = await fetch(`/api/threads/${threadId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            content,
            attachments: attachments.map((a) => ({ elementId: a.elementId })),
          }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Stream request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // sse-starlette (the backend's EventSourceResponse) writes CRLF
          // line endings, not bare LF — normalize before any line-based
          // parsing below, or "\n\n" never matches inside "\r\n\r\n" and no
          // frame ever splits, silently dropping every event.
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

          // SSE frames are separated by a blank line.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const event = parseSseFrame(frame);
            if (event) applyEvent(event);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setState((s) => ({ ...s, error: (err as Error).message, streaming: false }));
        }
        return;
      } finally {
        abortRef.current = null;
      }

      async function settleAfterTurn() {
        await queryClient.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.threads });
        // Clear the live turn now that the same content exists in the
        // just-refetched persisted `messages` -- otherwise `turnItems`
        // lingers until the next sendMessage() call resets it, and every
        // finished reply renders twice: once from persisted messages, once
        // from this now-stale "live" block (hasLiveTurn stays true as long
        // as turnItems is non-empty, independent of `streaming`).
        setState((s) => ({ ...s, pendingUserMessage: null, turnItems: [] }));
      }

      function applyEvent(event: ThreadStreamEvent) {
        switch (event.type) {
          case "token":
            setState((s) => {
              const items = s.turnItems;
              const last = items[items.length - 1];
              if (last?.kind === "text") {
                const updated = { ...last, text: last.text + event.delta };
                return { ...s, turnItems: [...items.slice(0, -1), updated] };
              }
              return {
                ...s,
                turnItems: [...items, { kind: "text", id: `text-${items.length}`, text: event.delta }],
              };
            });
            break;
          case "tool_start":
            setState((s) => ({
              ...s,
              turnItems: [
                ...s.turnItems,
                {
                  kind: "tool",
                  id: `${event.name}-${s.turnItems.length}`,
                  name: event.name,
                  args: event.args,
                  status: "running",
                },
              ],
            }));
            break;
          case "tool_end":
            setState((s) => ({
              ...s,
              turnItems: s.turnItems.map((item, idx) =>
                idx === s.turnItems.length - 1 && item.kind === "tool" && item.status === "running"
                  ? { ...item, result: event.result, durationMs: event.durationMs, status: "done" }
                  : item,
              ),
            }));
            break;
          case "message_done":
            setState((s) => ({ ...s, streaming: false }));
            void settleAfterTurn();
            break;
          case "error":
            // The user's step was already persisted before the backend hit
            // whatever failed (see app/chat_loop.py), so it still needs the
            // same refetch-then-clear handoff, or the question the user
            // typed disappears along with the pending bubble.
            setState((s) => ({ ...s, streaming: false, error: event.message }));
            void settleAfterTurn();
            break;
        }
      }
    },
    [threadId, queryClient],
  );

  const stop = useCallback(async () => {
    // Deliberately leaves turnItems/pendingUserMessage as-is: whatever
    // streamed in before Stop wasn't persisted (chat_loop only writes a
    // step once a round completes), so this is the only copy of it —
    // clearing it here would erase the partial answer instead of freezing
    // it in place. It resets naturally on the next sendMessage() call.
    abortRef.current?.abort();
    setState((s) => ({ ...s, streaming: false }));
    try {
      await fetch(`/api/threads/${threadId}/stop`, { method: "POST" });
    } finally {
      queryClient.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
    }
  }, [threadId, queryClient]);

  return { ...state, sendMessage, stop, reset };
}

function parseSseFrame(frame: string): ThreadStreamEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;

  try {
    const payload = JSON.parse(dataLines.join("\n"));
    return { type: eventName, ...payload } as ThreadStreamEvent;
  } catch {
    return null;
  }
}
