"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ToolStepCardProps {
  name: string;
  args?: unknown;
  result?: unknown;
  durationMs?: number;
  mcpProjectName?: string | null;
  status: "running" | "done";
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function ToolStepCard({ name, args, result, durationMs, mcpProjectName, status }: ToolStepCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-[9px] text-left"
      >
        {status === "running" ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" className="flex-none animate-[mh-spin_0.8s_linear_infinite]">
            <path d="M12 2a10 10 0 100 20" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94z" />
          </svg>
        )}
        <span className="flex-1 text-[12.5px] text-foreground/80">
          {status === "running" ? "Đang dùng tool " : "Đã dùng tool "}
          <span className="font-mono text-foreground">{name}</span>
          {mcpProjectName && <> trên MCP {mcpProjectName}</>}
        </span>
        {durationMs !== undefined && (
          <span className="text-[11px] text-muted-foreground">{formatDuration(durationMs)}</span>
        )}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("flex-none transition-transform duration-150", expanded && "rotate-180")}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className="border-t border-border bg-background px-3 py-2.5">
          <pre className="whitespace-pre-wrap break-all font-mono text-[11.5px] leading-relaxed text-foreground/80">
            {JSON.stringify(args ?? {}, null, 2)}
          </pre>
          {result !== undefined && (
            <pre className="mt-2 whitespace-pre-wrap break-all border-t border-border pt-2 font-mono text-[11.5px] leading-relaxed text-foreground/80">
              → {JSON.stringify(result)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
