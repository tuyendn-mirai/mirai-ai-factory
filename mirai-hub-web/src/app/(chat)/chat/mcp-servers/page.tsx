"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { McpSearchBar } from "@/components/mcp/McpSearchBar";
import { McpServerGrid } from "@/components/mcp/McpServerGrid";
import { useThreadSettings } from "@/hooks/useThreadSettings";

export default function McpServersPage() {
  return (
    <Suspense fallback={null}>
      <McpServersPageInner />
    </Suspense>
  );
}

function McpServersPageInner() {
  const searchParams = useSearchParams();
  const threadId = searchParams.get("threadId") ?? undefined;
  const settings = useThreadSettings(threadId);
  const [query, setQuery] = useState("");
  const [lastToolCount, setLastToolCount] = useState<number | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);

  async function handleToggle(projectId: string) {
    const nextId = settings.mcpProjectId === projectId ? null : projectId;
    setPendingProjectId(projectId);
    try {
      const result = await settings.setMcpProjectId(nextId);
      setLastToolCount(result?.toolCount ?? null);
    } finally {
      setPendingProjectId(null);
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex h-[52px] flex-none items-center justify-between border-b border-border px-7">
        <div className="flex items-center gap-3.5">
          <Link
            href={threadId ? `/chat/${threadId}` : "/chat"}
            className="group flex items-center gap-1.5 text-muted-foreground"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span className="text-[13px] font-semibold group-hover:text-foreground">Quay lại chat</span>
          </Link>
          <span className="h-4 w-px bg-border" />
          <span className="text-sm font-semibold text-foreground">MCP servers</span>
        </div>
        <McpSearchBar value={query} onChange={setQuery} />
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <p className="mb-[22px] max-w-[640px] text-[13px] leading-[1.6] text-muted-foreground">
          Danh sách project lấy trực tiếp từ Langflow — mỗi project có thể expose flow của nó thành một
          MCP server. Mỗi thread chat chỉ kết nối được tối đa{" "}
          <strong className="font-semibold text-foreground">một</strong> server tại một thời điểm.
        </p>

        <McpServerGrid
          projects={settings.mcpProjects}
          query={query}
          connectedProjectId={settings.mcpProjectId}
          connectedToolCount={lastToolCount}
          pendingProjectId={pendingProjectId}
          onToggle={handleToggle}
        />
      </div>
    </div>
  );
}
