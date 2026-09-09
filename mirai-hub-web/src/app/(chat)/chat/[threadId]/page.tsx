"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { TopBar } from "@/components/chat/TopBar";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { useDeleteThread, useThreadQuery, useUpdateThread } from "@/hooks/useThreads";
import { useThreadStream } from "@/hooks/useThreadStream";
import { popPendingMessage } from "@/lib/pending-message";
import type { PendingAttachment } from "@/lib/types";

// Next.js reuses this component across /chat/A -> /chat/B navigations (same
// route pattern, no remount), so every hook here keeps state across
// threads unless forced to reset. `key={threadId}` below remounts the
// whole subtree per thread instead of patching each hook individually —
// otherwise useThreadStream's in-flight streaming state, TopBar's rename
// draft, and Composer's unsent text all leak from the thread you left into
// the one you switched to.
export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  return <ThreadPageInner key={params.threadId} threadId={params.threadId} />;
}

function ThreadPageInner({ threadId }: { threadId: string }) {
  const router = useRouter();

  const thread = useThreadQuery(threadId);
  const updateThread = useUpdateThread(threadId);
  const deleteThread = useDeleteThread();
  const stream = useThreadStream(threadId);

  const autoSentRef = useRef(false);

  // Picks up the draft stashed by the Empty screen's Composer (see
  // lib/pending-message.ts) so typing on the welcome screen and landing
  // here reads as one continuous send.
  useEffect(() => {
    if (autoSentRef.current) return;
    const pending = popPendingMessage(threadId);
    if (pending) {
      autoSentRef.current = true;
      stream.sendMessage(pending.content, pending.attachments);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function ensureThreadId() {
    return threadId;
  }

  function handleSend(content: string, attachments: PendingAttachment[]) {
    stream.sendMessage(content, attachments);
  }

  async function handleDelete() {
    await deleteThread.mutateAsync(threadId);
    router.push("/chat");
  }

  if (thread.isError) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Không tìm thấy cuộc trò chuyện này.
      </div>
    );
  }

  const title = thread.data?.name ?? "…";

  return (
    // min-h-0: the (chat) layout wraps this in an identical flex-col div
    // (`flex min-w-0 flex-1 flex-col`, stretched to a definite height by
    // the outer h-screen row) -- as ITS single child, this div's own
    // default min-height:auto still lets it refuse to shrink below the
    // full conversation's height, so MessageList's overflow-y-auto never
    // gets a bounded box and the whole document scrolls, dragging the
    // fixed-width sidebar off-screen with it.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <TopBar
        title={title}
        onRename={(name) => updateThread.mutate({ name })}
        onDelete={handleDelete}
      />
      <MessageList
        messages={thread.data?.messages ?? []}
        mcpProjectName={thread.data?.mcpProjectName ?? null}
        streaming={stream.streaming}
        turnItems={stream.turnItems}
        pendingUserMessage={stream.pendingUserMessage}
      />
      {stream.error && (
        <p className="px-8 pb-2 text-center text-[12.5px] text-destructive">{stream.error}</p>
      )}
      <Composer
        onSend={handleSend}
        ensureThreadId={ensureThreadId}
        streaming={stream.streaming}
        onStop={stream.stop}
      />
    </div>
  );
}
