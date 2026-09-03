import type { ThreadMessage } from "./types";

export type MessageBlock =
  | { kind: "user"; message: ThreadMessage }
  | { kind: "assistant"; steps: ThreadMessage[] };

/**
 * Steps are persisted flat and chronologically (user_message, tool, tool,
 * assistant_message, user_message, ...). The mockup renders one
 * "Mirai Hub" header per AI turn with its tool-step cards and final text
 * nested under it, so we group everything between two user messages into
 * a single assistant block.
 */
export function groupMessagesIntoBlocks(messages: ThreadMessage[]): MessageBlock[] {
  const blocks: MessageBlock[] = [];

  for (const message of messages) {
    if (message.type === "user_message") {
      blocks.push({ kind: "user", message });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === "assistant") {
      last.steps.push(message);
    } else {
      blocks.push({ kind: "assistant", steps: [message] });
    }
  }

  return blocks;
}
