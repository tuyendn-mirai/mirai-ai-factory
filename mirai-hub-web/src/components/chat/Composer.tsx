"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { cn } from "@/lib/utils";
import { presignUpload, confirmFileUpload } from "@/lib/api-client";
import type { PendingAttachment } from "@/lib/types";
import { AttachmentChip } from "./AttachmentChip";

interface ComposerProps {
  onSend: (content: string, attachments: PendingAttachment[]) => void;
  /** Returns the thread id to upload/confirm attachments against, creating one on first use if needed (Empty screen). */
  ensureThreadId: () => Promise<string>;
  streaming: boolean;
  onStop?: () => void;
  placeholder?: string;
}

export function Composer({ onSend, ensureThreadId, streaming, onStop, placeholder }: ComposerProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [focused, setFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Default resolved per the plan's open item: send is enabled with text
  // OR at least one staged attachment, not text-only.
  const sendEnabled = (text.trim().length > 0 || attachments.length > 0) && !uploading && !streaming;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const threadId = await ensureThreadId();
      const { uploadUrl, elementId, objectKey } = await presignUpload(file.name, file.type || "application/octet-stream");
      await fetch(uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
      await confirmFileUpload(threadId, { objectKey, name: file.name, mime: file.type, size: file.size });
      setAttachments((prev) => [...prev, { elementId, name: file.name, mime: file.type, size: file.size }]);
    } catch {
      // Upload failed silently for now — surfaced space is tight in the
      // composer; a future pass could add an inline error state here.
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(elementId: string) {
    setAttachments((prev) => prev.filter((a) => a.elementId !== elementId));
  }

  function handleSend() {
    if (!sendEnabled) return;
    onSend(text.trim(), attachments);
    setText("");
    setAttachments([]);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-none justify-center border-t border-border px-8 pb-[18px] pt-3.5">
      <div className="flex w-full max-w-[760px] flex-col gap-1.5">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-1">
            {attachments.map((a) => (
              <AttachmentChip key={a.elementId} attachment={a} onRemove={() => removeAttachment(a.elementId)} />
            ))}
          </div>
        )}

        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border bg-background py-2 pl-4 pr-2 transition-colors",
            focused ? "border-primary shadow-[0_0_0_3px_rgba(5,35,98,0.12)]" : "border-border",
          )}
        >
          <TextareaAutosize
            className="mh-input flex-1 resize-none text-[14.5px] leading-[1.4] text-foreground"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder ?? "Nhắn tin cho Mirai Hub…"}
            minRows={1}
            maxRows={8}
          />

          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            aria-label="Đính kèm tệp"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.5l-8.5 8.5a4 4 0 01-5.66-5.66l8.49-8.49a2.5 2.5 0 013.54 3.54l-8.49 8.49a1 1 0 01-1.41-1.41l7.78-7.78" />
            </svg>
          </button>

          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Dừng"
              className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!sendEnabled}
              aria-label="Gửi"
              className={cn(
                "flex h-8 w-8 flex-none items-center justify-center rounded-lg",
                sendEnabled ? "cursor-pointer bg-primary hover:opacity-90" : "cursor-default bg-muted",
              )}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke={sendEnabled ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))"}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
        <span className="pl-1 text-[11px] text-muted-foreground">Enter để gửi · Shift+Enter để xuống dòng</span>
      </div>
    </div>
  );
}
