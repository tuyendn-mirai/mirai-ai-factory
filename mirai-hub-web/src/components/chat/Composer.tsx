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

// Picked in preference order — MediaRecorder only ever produces one of these
// container formats (never mp3), and browser support for each varies. The
// backend/AttachmentChip only care that the mime starts with "audio/", so any
// of these is fine to upload as-is.
const RECORDING_MIME_CANDIDATES = ["audio/webm", "audio/mp4", "audio/ogg"];

function pickRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return RECORDING_MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime));
}

export function Composer({ onSend, ensureThreadId, streaming, onStop, placeholder }: ComposerProps) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [focused, setFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  // Default resolved per the plan's open item: send is enabled with text
  // OR at least one staged attachment, not text-only.
  const sendEnabled = (text.trim().length > 0 || attachments.length > 0) && !uploading && !streaming && !recording;

  // Shared by file-picker attach and mic recording — both end up with raw
  // bytes + a filename/mime that need the same presign -> PUT -> confirm
  // round trip (see the elementId note below).
  async function uploadBlob(blob: Blob, filename: string, mime: string) {
    setUploading(true);
    try {
      const threadId = await ensureThreadId();
      // presignUpload's `elementId` is a throwaway UUID minted only to
      // namespace the S3 object key (app/routers/files.py's presign_upload) —
      // it is NOT a real "Element" row yet, so it must never be staged here.
      // The real row (and its own, different, DB-generated id) is created by
      // confirmFileUpload below; using the presign one instead meant
      // chat_loop's reassign_step could never find a matching Element,
      // silently no-opping — every attachment stayed orphaned on its
      // "pending_upload" placeholder step forever, so the model never saw it
      // (this is why a bound MCP tool that expects an audio_url never fired).
      const { uploadUrl, objectKey } = await presignUpload(filename, mime);
      await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "content-type": mime } });
      const { elementId } = await confirmFileUpload(threadId, {
        objectKey,
        name: filename,
        mime,
        size: blob.size,
      });
      setAttachments((prev) => [...prev, { elementId, name: filename, mime, size: blob.size }]);
    } catch {
      // Upload failed silently for now — surfaced space is tight in the
      // composer; a future pass could add an inline error state here.
    } finally {
      setUploading(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadBlob(file, file.name, file.type || "application/octet-stream");
  }

  async function startRecording() {
    if (recording || uploading) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickRecordingMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Always release the mic — leaving the track live keeps the
        // browser's recording indicator (tab/OS icon) on indefinitely.
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType });
        const ext = recorder.mimeType.includes("mp4") ? "m4a" : recorder.mimeType.includes("ogg") ? "ogg" : "webm";
        void uploadBlob(blob, `voice-note-${Date.now()}.${ext}`, recorder.mimeType);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      // Mic permission denied/unavailable, or getUserMedia blocked by an
      // insecure context (it requires HTTPS or a literal "localhost" origin —
      // a custom /etc/hosts hostname like hub.mirai.local over plain HTTP
      // does not qualify, even though it resolves to 127.0.0.1). Same silent
      // failure convention as the rest of this component's upload path.
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setRecording(false);
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
    // isComposing is true while a Vietnamese IME (Telex/VNI, etc.) is still
    // resolving a tone mark or word -- the Enter that confirms that
    // composition also reaches this handler. Without this check, it was
    // treated as "send": the textarea cleared mid-composition, and the IME
    // then committed its pending characters into the now-empty box,
    // leaving stray leftover characters behind after every send.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
            disabled={uploading || recording}
            aria-label="Đính kèm tệp"
            className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted-foreground hover:bg-accent disabled:opacity-50"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.5l-8.5 8.5a4 4 0 01-5.66-5.66l8.49-8.49a2.5 2.5 0 013.54 3.54l-8.49 8.49a1 1 0 01-1.41-1.41l7.78-7.78" />
            </svg>
          </button>

          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={uploading}
            aria-label={recording ? "Dừng ghi âm" : "Ghi âm"}
            className={cn(
              "flex h-8 w-8 flex-none items-center justify-center rounded-lg disabled:opacity-50",
              recording
                ? "bg-destructive text-destructive-foreground animate-pulse"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {recording ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" />
                <path d="M5 10a7 7 0 0 0 14 0" />
                <path d="M12 17v4M8 21h8" />
              </svg>
            )}
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
        <span className="pl-1 text-[11px] text-muted-foreground">
          {recording ? "Đang ghi âm… bấm nút mic để dừng" : "Enter để gửi · Shift+Enter để xuống dòng"}
        </span>
      </div>
    </div>
  );
}
