"use client";

import { usePendingThreadSettings } from "@/components/providers/PendingThreadSettingsProvider";
import {
  useConnectMcp,
  useMcpProjectsQuery,
  useModelsQuery,
  useThreadQuery,
  useUpdateThread,
} from "./useThreads";
import type { McpConnectResult } from "@/lib/types";

/**
 * One settings surface for the sidebar's Model / MCP server selects,
 * whether we're editing a persisted thread ([threadId] pages, backed by
 * PATCH /api/threads/{id} and POST /api/threads/{id}/mcp) or the
 * not-yet-created thread on the Empty/new-chat screen (backed by
 * PendingThreadSettingsProvider's local state).
 */
export function useThreadSettings(threadId: string | undefined) {
  const models = useModelsQuery();
  const mcpProjects = useMcpProjectsQuery();
  const thread = useThreadQuery(threadId);
  const updateThread = useUpdateThread(threadId ?? "");
  const connectMcp = useConnectMcp(threadId ?? "");
  const pending = usePendingThreadSettings();

  const modelList = models.data ?? [];
  const projectList = mcpProjects.data ?? [];

  if (threadId) {
    const model = thread.data?.llmModel ?? modelList[0] ?? "";
    return {
      models: modelList,
      mcpProjects: projectList,
      model,
      setModel: (m: string) => updateThread.mutate({ llmModel: m }),
      mcpProjectId: thread.data?.mcpProjectId ?? null,
      mcpProjectName: thread.data?.mcpProjectName ?? null,
      mcpConnected: thread.data?.mcpConnected ?? false,
      setMcpProjectId: (id: string | null): Promise<McpConnectResult | undefined> =>
        connectMcp.mutateAsync(id),
      isLoading: thread.isLoading,
    };
  }

  const model = pending.model ?? modelList[0] ?? "";
  const project = projectList.find((p) => p.id === pending.mcpProjectId) ?? null;
  return {
    models: modelList,
    mcpProjects: projectList,
    model,
    setModel: pending.setModel,
    mcpProjectId: pending.mcpProjectId,
    mcpProjectName: project?.name ?? null,
    mcpConnected: pending.mcpProjectId !== null,
    setMcpProjectId: async (id: string | null): Promise<McpConnectResult | undefined> => {
      pending.setMcpProjectId(id);
      return undefined;
    },
    isLoading: models.isLoading,
  };
}
