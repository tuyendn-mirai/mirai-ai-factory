"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { McpToolList } from "@/components/mcp/McpToolList";
import { useThreadSettings } from "@/hooks/useThreadSettings";
import { cn } from "@/lib/utils";

const LANGFLOW_URL = process.env.NEXT_PUBLIC_LANGFLOW_URL || "http://langflow.mirai.local";

export default function McpServerDetailPage() {
  return (
    <Suspense fallback={null}>
      <McpServerDetailPageInner />
    </Suspense>
  );
}

function McpServerDetailPageInner() {
  const { projectId } = useParams<{ projectId: string }>();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId") ?? undefined;
  const settings = useThreadSettings(threadId);
  const [pending, setPending] = useState(false);

  const project = settings.mcpProjects.find((p) => p.id === projectId);
  const connected = settings.mcpProjectId === projectId;
  const backHref = threadId ? `/chat/mcp-servers?threadId=${threadId}` : "/chat/mcp-servers";

  async function handleToggle() {
    setPending(true);
    try {
      await settings.setMcpProjectId(connected ? null : projectId);
    } finally {
      setPending(false);
    }
  }

  return (
    // min-h-0: see chat/[threadId]/page.tsx -- without it this div refuses
    // to shrink below its content, so the tool list below never gets a
    // bounded box for overflow-y-auto and the whole document scrolls
    // instead, dragging the sidebar off-screen with it.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-[52px] flex-none items-center gap-3.5 border-b border-border px-7">
        <Link href={backHref} className="group flex items-center gap-1.5 text-muted-foreground">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="text-[13px] font-semibold group-hover:text-foreground">MCP servers</span>
        </Link>
        <span className="h-4 w-px bg-border" />
        <span className="text-sm font-semibold text-foreground">{project?.name ?? projectId}</span>
        {connected && (
          <span className="flex items-center gap-[5px] rounded-full bg-sidebar-accent px-2 py-[3px]">
            <span className="h-1.5 w-1.5 rounded-full bg-green-600" />
            <span className="text-[11px] font-semibold text-primary">Đã kết nối cho thread này</span>
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mb-5 flex items-center justify-between">
          <p className="max-w-[560px] text-[13px] leading-[1.6] text-muted-foreground">
            Danh sách tool project này expose qua MCP, kèm mô tả và tham số đầu vào.
          </p>
          <div className="flex flex-none items-center gap-3">
            <a
              href={`${LANGFLOW_URL}/flow/${projectId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Mở trong Langflow
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 17L17 7M8 7h9v9" />
              </svg>
            </a>
            <button
              type="button"
              onClick={handleToggle}
              disabled={pending || !threadId}
              title={threadId ? undefined : "Chọn một thread để kết nối"}
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
          </div>
        </div>

        <McpToolList projectId={projectId} />
      </div>
    </div>
  );
}
