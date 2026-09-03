import { AttachmentChip } from "./AttachmentChip";
import type { ThreadMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ThreadMessage;
}

/** Renders one user_message step — right-aligned filled bubble + any attachment chips, per the Main mockup. */
export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div className="flex flex-col items-end gap-2 self-end">
      {message.content && (
        <div className="max-w-[72%] self-end rounded-[12px_12px_2px_12px] bg-primary px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-primary-foreground">
          {message.content}
        </div>
      )}
      {message.attachments?.map((a) => <AttachmentChip key={a.elementId} attachment={a} />)}
    </div>
  );
}
