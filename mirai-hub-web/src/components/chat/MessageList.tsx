"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { groupMessagesIntoBlocks } from "@/lib/group-messages";
import type { ThreadMessage } from "@/lib/types";
import { Markdown } from "./Markdown";
import { MessageBubble } from "./MessageBubble";
import { ToolStepCard } from "./ToolStepCard";
import type { PendingUserMessage, StreamTurnItem } from "@/hooks/useThreadStream";

interface MessageListProps {
  messages: ThreadMessage[];
  mcpProjectName: string | null;
  streaming: boolean;
  turnItems: StreamTurnItem[];
  pendingUserMessage: PendingUserMessage | null;
}

function AssistantHeader() {
  return (
    <div className="flex items-center gap-2">
      <Image src="/favicon.png" alt="" width={20} height={20} className="block rounded-[5px]" />
      <span className="text-xs font-semibold text-muted-foreground">Mirai Hub</span>
    </div>
  );
}

function AssistantStep({ step, mcpProjectName }: { step: ThreadMessage; mcpProjectName: string | null }) {
  if (step.type === "tool") {
    return (
      <ToolStepCard
        name={step.name ?? "tool"}
        args={step.args}
        result={step.result}
        durationMs={step.durationMs}
        mcpProjectName={mcpProjectName}
        status="done"
      />
    );
  }
  // A tool-calling turn persists an assistant_message step before the tool
  // call too (see app/chat_loop.py), often with empty text when the model
  // went straight to the call with no preceding commentary -- an empty
  // line box still takes up visible space, so skip it instead of rendering
  // a blank gap between the header and the tool card.
  if (!step.content) return null;
  return <Markdown content={step.content} />;
}

export function MessageList({
  messages,
  mcpProjectName,
  streaming,
  turnItems,
  pendingUserMessage,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const blocks = groupMessagesIntoBlocks(messages);
  const hasLiveTurn = streaming || turnItems.length > 0;

  // The post-turn refetch (see useThreadStream's settleAfterTurn) can land
  // a render where `messages` already includes the persisted user_message
  // (and by then usually the assistant's reply too) before pendingUserMessage
  // itself has been cleared -- checking only whether the *last* message
  // matches broke as soon as that reply became the last message, showing
  // the user's bubble a second time *after* the reply it was answered by.
  // Instead, remember how many messages existed when this pendingUserMessage
  // was created and hide it as soon as the list has grown past that count,
  // regardless of what the new entries are.
  const baselineRef = useRef<{ token: PendingUserMessage | null; count: number }>({
    token: null,
    count: messages.length,
  });
  if (pendingUserMessage && baselineRef.current.token !== pendingUserMessage) {
    baselineRef.current = { token: pendingUserMessage, count: messages.length };
  }
  const showPendingUserMessage = !!pendingUserMessage && messages.length <= baselineRef.current.count;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, turnItems]);

  return (
    // min-h-0 overrides this flex-1 item's default min-height:auto -- without
    // it, this column refuses to shrink below the full conversation's
    // height, overflow-y-auto never engages, and the whole document scrolls
    // instead (dragging the fixed-width sidebar off-screen with it).
    //
    // items-start: this row container's cross axis is vertical, and the
    // default align-items:stretch was forcing its single child (the
    // message column below) to a *fixed* height equal to this container's
    // own visible height -- not its natural, much taller content height.
    // With a definite height, that child then had to flex-shrink its own
    // children to fit: message blocks refused (their text sets a
    // content-based floor) but the empty bottom-anchor div has no such
    // floor, so it always got crushed to 0, silently eating any spacer
    // height put on it. items-start lets the column size to its actual
    // content instead of being squeezed into the viewport.
    <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-8 py-6">
      <div className="flex w-full max-w-[760px] flex-col gap-[22px]">
        {blocks.map((block, i) =>
          block.kind === "user" ? (
            <MessageBubble key={block.message.id} message={block.message} />
          ) : (
            <div key={block.steps[0]?.id ?? i} className="flex max-w-[80%] flex-col gap-2 self-start">
              <AssistantHeader />
              {block.steps.map((step) => (
                <AssistantStep key={step.id} step={step} mcpProjectName={mcpProjectName} />
              ))}
            </div>
          ),
        )}

        {showPendingUserMessage && (
          <MessageBubble
            message={{
              id: "pending-user-message",
              type: "user_message",
              content: pendingUserMessage.content,
              createdAt: new Date().toISOString(),
              attachments: pendingUserMessage.attachments,
            }}
          />
        )}

        {hasLiveTurn && (
          <div className="flex max-w-[80%] flex-col gap-2 self-start">
            <AssistantHeader />
            {turnItems.map((item) =>
              item.kind === "tool" ? (
                <ToolStepCard
                  key={item.id}
                  name={item.name}
                  args={item.args}
                  result={item.result}
                  durationMs={item.durationMs}
                  mcpProjectName={mcpProjectName}
                  status={item.status}
                />
              ) : (
                item.text.length > 0 && <Markdown key={item.id} content={item.text} />
              ),
            )}
          </div>
        )}

        {/* A real fixed-height spacer, not padding-bottom on the scroll
            container above -- verified live that a flex scroll container's
            trailing padding doesn't reliably make it into the scrollable
            area (it gets clipped once content overflows), so scrolling to
            "max" left the last message flush against the composer with
            zero visible gap despite the padding being set. An actual child
            element with real height doesn't have that problem. */}
        <div ref={bottomRef} className="h-6" />
      </div>
    </div>
  );
}
