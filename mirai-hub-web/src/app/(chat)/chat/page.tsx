"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/chat/TopBar";
import { EmptyState } from "@/components/chat/EmptyState";
import { Composer } from "@/components/chat/Composer";
import { usePendingThreadSettings } from "@/components/providers/PendingThreadSettingsProvider";
import * as api from "@/lib/api-client";
import { stashPendingMessage } from "@/lib/pending-message";
import type { PendingAttachment } from "@/lib/types";

export default function EmptyChatPage() {
  const router = useRouter();
  const pending = usePendingThreadSettings();
  const draftThreadIdRef = useRef<string | null>(null);

  // Creates the thread on first use (first attachment or first send) and
  // applies whatever model/MCP the user picked in the sidebar while still
  // on this screen, then reuses that same thread id for the rest of the
  // draft — see lib/pending-message.ts for how the first message follows
  // it over to /chat/[threadId].
  async function ensureThreadId(): Promise<string> {
    if (draftThreadIdRef.current) return draftThreadIdRef.current;
    const { id } = await api.createThread();
    if (pending.model) await api.updateThread(id, { llmModel: pending.model });
    if (pending.mcpProjectId) await api.connectMcp(id, pending.mcpProjectId);
    draftThreadIdRef.current = id;
    return id;
  }

  async function handleSend(content: string, attachments: PendingAttachment[]) {
    const id = await ensureThreadId();
    stashPendingMessage({ threadId: id, content, attachments });
    pending.reset();
    router.push(`/chat/${id}`);
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <TopBar title="New chat" />
      <EmptyState />
      <Composer onSend={handleSend} ensureThreadId={ensureThreadId} streaming={false} />
    </div>
  );
}
