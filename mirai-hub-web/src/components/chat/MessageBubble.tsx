import { AttachmentChip } from "./AttachmentChip";
import type { ThreadMessage } from "@/lib/types";

interface MessageBubbleProps {
  message: ThreadMessage;
}

/** Renders one user_message step — right-aligned filled bubble + any attachment chips, per the Main mockup. */
export function MessageBubble({ message }: MessageBubbleProps) {
  return (
    // max-w-[72%] lives here, on the direct child of the (definite-width)
    // message list, not on the bubble div below -- a percentage max-width
    // has no basis to resolve against when its parent is itself a
    // shrink-to-fit flex item (self-end with no explicit width), which
    // collapsed the bubble to near-zero and forced a line break after
    // nearly every character.
    <div className="flex max-w-[72%] flex-col items-end gap-2 self-end">
      {message.content && (
        <div className="whitespace-pre-wrap break-words rounded-[12px_12px_2px_12px] bg-primary px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-primary-foreground">
          {message.content}
        </div>
      )}
      {message.attachments?.map((a) => <AttachmentChip key={a.elementId} attachment={a} />)}
    </div>
  );
}
