"use client";

import Link from "next/link";
import { useState } from "react";
import { ModelSelect } from "./ModelSelect";
import { McpSelect } from "./McpSelect";
import { useThreadSettings } from "@/hooks/useThreadSettings";
import { cn } from "@/lib/utils";

interface SettingsPanelProps {
  threadId?: string;
}

export function SettingsPanel({ threadId }: SettingsPanelProps) {
  const [open, setOpen] = useState(true);
  const settings = useThreadSettings(threadId);

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="-m-0.5 flex w-[calc(100%+4px)] items-center justify-between p-0.5"
      >
        <span className="flex items-center gap-[7px]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.8" strokeLinecap="round">
            <line x1="4" y1="6" x2="20" y2="6" />
            <circle cx="14" cy="6" r="2" fill="hsl(var(--primary))" stroke="none" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <circle cx="9" cy="12" r="2" fill="hsl(var(--primary))" stroke="none" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="16" cy="18" r="2" fill="hsl(var(--primary))" stroke="none" />
          </svg>
          <span className="text-[13px] font-semibold text-foreground">Settings</span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("transition-transform duration-150", !open && "-rotate-90")}
        >
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2.5">
          <ModelSelect value={settings.model} options={settings.models} onChange={settings.setModel} />

          <div className="flex flex-col gap-[5px]">
            <McpSelect
              value={settings.mcpProjectId}
              connected={settings.mcpConnected}
              projectName={settings.mcpProjectName}
              options={settings.mcpProjects}
              onChange={settings.setMcpProjectId}
            />
            {/* Gap fix vs. the approved mockups: Main/Empty never link to
                the MCP catalog page, only McpServers.dc.html does. */}
            <Link
              href={threadId ? `/chat/mcp-servers?threadId=${threadId}` : "/chat/mcp-servers"}
              className="self-end text-[11px] font-medium text-primary hover:underline"
            >
              Xem tất cả
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
