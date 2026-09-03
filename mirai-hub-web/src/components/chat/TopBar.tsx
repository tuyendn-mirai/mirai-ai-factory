"use client";

import { useState, type KeyboardEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface TopBarProps {
  title: string;
  onRename?: (name: string) => void;
  onDelete?: () => void;
}

export function TopBar({ title, onRename, onDelete }: TopBarProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) onRename?.(trimmed);
    else setDraft(title);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") {
      setDraft(title);
      setEditing(false);
    }
  }

  return (
    <div className="flex h-[52px] flex-none items-center justify-between border-b border-border px-7">
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="mh-input h-7 max-w-[360px] rounded border border-primary px-1.5 text-sm font-semibold text-foreground"
        />
      ) : (
        <button
          type="button"
          onClick={() => onRename && setEditing(true)}
          className="flex items-center gap-2 text-left"
          disabled={!onRename}
        >
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {onRename && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          )}
        </button>
      )}

      {onDelete && (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" aria-label="Tuỳ chọn" className="text-muted-foreground hover:text-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <button
              type="button"
              onClick={onDelete}
              className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-[13px] text-destructive hover:bg-accent"
            >
              Xoá cuộc trò chuyện
            </button>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
