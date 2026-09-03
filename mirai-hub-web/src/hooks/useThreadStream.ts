"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "./useThreads";
import type { PendingAttachment, ThreadStreamEvent } from "@/lib/types";

export interface StreamingToolStep {
  id: string;
  name: string;
  args: unknown;
  result?: unknown;
  durationMs?: number;
  status: "running" | "done";
}

interface StreamState {
  streaming: boolean;
  assistantText: string;
  toolSteps: StreamingToolStep[];
  error: string | null;
}

const initialState: StreamState = {
  streaming: false,
  assistantText: "",
  toolSteps: [],
  error: null,
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

      setState({ streaming: true, assistantText: "", toolSteps: [], error: null });

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
          buffer += decoder.decode(value, { stream: true });

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

      function applyEvent(event: ThreadStreamEvent) {
        switch (event.type) {
          case "token":
            setState((s) => ({ ...s, assistantText: s.assistantText + event.delta }));
            break;
          case "tool_start":
            setState((s) => ({
              ...s,
              toolSteps: [
                ...s.toolSteps,
                {
                  id: `${event.name}-${s.toolSteps.length}`,
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
              toolSteps: s.toolSteps.map((step, idx) =>
                idx === s.toolSteps.length - 1 && step.status === "running"
                  ? { ...step, result: event.result, durationMs: event.durationMs, status: "done" }
                  : step,
              ),
            }));
            break;
          case "message_done":
            setState((s) => ({ ...s, streaming: false }));
            queryClient.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
            queryClient.invalidateQueries({ queryKey: queryKeys.threads });
            break;
          case "error":
            setState((s) => ({ ...s, streaming: false, error: event.message }));
            break;
        }
      }
    },
    [threadId, queryClient],
  );

  const stop = useCallback(async () => {
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
