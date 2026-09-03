"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { groupMessagesIntoBlocks } from "@/lib/group-messages";
import type { ThreadMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { ToolStepCard } from "./ToolStepCard";
import type { StreamingToolStep } from "@/hooks/useThreadStream";

interface MessageListProps {
  messages: ThreadMessage[];
  mcpProjectName: string | null;
  streaming: boolean;
  streamingText: string;
  streamingToolSteps: StreamingToolStep[];
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
  return <div className="text-[14.5px] leading-[1.6] text-foreground">{step.content}</div>;
}

export function MessageList({ messages, mcpProjectName, streaming, streamingText, streamingToolSteps }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const blocks = groupMessagesIntoBlocks(messages);
  const hasLiveTurn = streaming || streamingToolSteps.length > 0 || streamingText.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, streamingText, streamingToolSteps.length]);

  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-8 py-6">
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

        {hasLiveTurn && (
          <div className="flex max-w-[80%] flex-col gap-2 self-start">
            <AssistantHeader />
            {streamingToolSteps.map((step) => (
              <ToolStepCard
                key={step.id}
                name={step.name}
                args={step.args}
                result={step.result}
                durationMs={step.durationMs}
                mcpProjectName={mcpProjectName}
                status={step.status}
              />
            ))}
            {streamingText.length > 0 && (
              <div className="text-[14.5px] leading-[1.6] text-foreground">{streamingText}</div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
