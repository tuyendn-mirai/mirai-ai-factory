import { cn } from "@/lib/utils";
import type { McpProject } from "@/lib/types";

// The API contract (GET /api/mcp/projects -> [{id, name}]) doesn't expose
// a per-project Langflow deep link, so this is a best-effort URL built
// from the langflow-ide Ingress host used elsewhere in this repo
// (infra/apps/langflow-ide) — override via NEXT_PUBLIC_LANGFLOW_URL if
// the real path differs.
const LANGFLOW_URL = process.env.NEXT_PUBLIC_LANGFLOW_URL || "http://langflow.mirai.local";

interface McpServerCardProps {
  project: McpProject;
  connected: boolean;
  toolCount: number | null;
  onToggle: () => void;
  pending?: boolean;
}

export function McpServerCard({ project, connected, toolCount, onToggle, pending }: McpServerCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-[10px] border bg-background p-4",
        connected ? "border-primary" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[14.5px] font-semibold text-foreground">{project.name}</span>
        <span
          className={cn(
            "flex flex-none items-center gap-[5px] rounded-full px-2 py-[3px]",
            connected ? "bg-sidebar-accent" : "bg-muted",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-green-600" : "bg-border")} />
          <span className={cn("text-[11px] font-semibold", connected ? "text-primary" : "text-muted-foreground")}>
            {connected ? "Đã kết nối cho thread này" : "Chưa kết nối"}
          </span>
        </span>
      </div>

      <span className={cn("text-[12.5px]", toolCount !== null ? "text-muted-foreground" : "italic text-muted-foreground/70")}>
        {toolCount !== null ? `${toolCount} tool khả dụng` : connected ? "Đã kết nối" : "Kết nối để xem số tool"}
      </span>

      <div className="mt-auto flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[12.5px] font-semibold disabled:opacity-60",
            connected ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {connected && (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          )}
          {connected ? "Đang dùng" : "Kết nối cho thread này"}
        </button>
        <a
          href={`${LANGFLOW_URL}/flow/${project.id}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
        >
          Mở trong Langflow
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7M8 7h9v9" />
          </svg>
        </a>
      </div>
    </div>
  );
}
