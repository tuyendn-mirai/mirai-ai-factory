"use client";

import { useState } from "react";
import { useMcpProjectToolsQuery } from "@/hooks/useThreads";
import type { McpTool } from "@/lib/types";

function ToolListItem({ tool }: { tool: McpTool }) {
  const [schemaOpen, setSchemaOpen] = useState(false);
  const hasParams = !!tool.parameters && Object.keys((tool.parameters.properties as object) ?? {}).length > 0;

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border bg-background p-3.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[13px] font-semibold text-foreground">{tool.actionName}</span>
        {tool.name !== tool.actionName && (
          <span className="text-[12px] text-muted-foreground">({tool.name})</span>
        )}
        {!tool.mcpEnabled && (
          <span className="rounded-full bg-muted px-1.5 py-[1px] text-[10px] font-semibold text-muted-foreground">
            MCP tắt
          </span>
        )}
      </div>
      {tool.description && (
        <span className="text-[12.5px] leading-relaxed text-muted-foreground">{tool.description}</span>
      )}
      {hasParams && (
        <button
          type="button"
          onClick={() => setSchemaOpen((v) => !v)}
          className="mt-0.5 self-start text-[11.5px] font-semibold text-primary hover:underline"
        >
          {schemaOpen ? "Ẩn tham số" : "Xem tham số"}
        </button>
      )}
      {schemaOpen && (
        <pre className="mt-1 whitespace-pre-wrap break-all rounded-md bg-muted/40 px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-foreground/80">
          {JSON.stringify(tool.parameters, null, 2)}
        </pre>
      )}
    </li>
  );
}

/** Full tool listing for one MCP server (project), used by the dedicated
 * server-detail screen — see app/(chat)/chat/mcp-servers/[projectId]/page.tsx.
 * Split out of McpServerCard, which only needs a summary count: showing
 * every tool's description and schema inline in a grid card made the grid
 * unreadable as soon as more than one card was expanded. */
export function McpToolList({ projectId }: { projectId: string }) {
  const toolsQuery = useMcpProjectToolsQuery(projectId);

  if (toolsQuery.isLoading) {
    return <p className="text-[13px] text-muted-foreground">Đang tải danh sách tool…</p>;
  }
  if (toolsQuery.isError) {
    return <p className="text-[13px] text-destructive">Không tải được danh sách tool.</p>;
  }
  if (!toolsQuery.data || toolsQuery.data.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Project này chưa có flow nào bật MCP.</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {toolsQuery.data.map((tool) => (
        <ToolListItem key={tool.id} tool={tool} />
      ))}
    </ul>
  );
}
