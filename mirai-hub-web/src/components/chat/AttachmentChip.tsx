import type { PendingAttachment, ThreadAttachment } from "@/lib/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentChipProps {
  attachment: PendingAttachment | ThreadAttachment;
  onRemove?: () => void;
}

export function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-sidebar-accent px-3 py-2">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
        <path d="M6 2h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" />
        <path d="M14 2v5h5" />
      </svg>
      <span className="text-[12.5px] font-medium text-foreground">{attachment.name}</span>
      <span className="text-[11px] text-muted-foreground">{formatSize(attachment.size)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Bỏ tệp đính kèm"
          className="ml-1 text-muted-foreground hover:text-foreground"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
