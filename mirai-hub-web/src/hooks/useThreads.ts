"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api-client";

export const queryKeys = {
  threads: ["threads"] as const,
  thread: (id: string) => ["threads", id] as const,
  models: ["models"] as const,
  mcpProjects: ["mcp-projects"] as const,
  me: ["me"] as const,
};

export function useThreadsQuery() {
  return useQuery({ queryKey: queryKeys.threads, queryFn: api.fetchThreads });
}

export function useThreadQuery(threadId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.thread(threadId ?? ""),
    queryFn: () => api.fetchThread(threadId as string),
    enabled: !!threadId,
  });
}

export function useModelsQuery() {
  return useQuery({ queryKey: queryKeys.models, queryFn: api.fetchModels });
}

export function useMcpProjectsQuery() {
  return useQuery({ queryKey: queryKeys.mcpProjects, queryFn: api.fetchMcpProjects });
}

export function useMeQuery() {
  return useQuery({ queryKey: queryKeys.me, queryFn: api.fetchMe });
}

export function useCreateThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createThread,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads });
    },
  });
}

export function useUpdateThread(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; llmModel?: string }) => api.updateThread(threadId, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads });
      queryClient.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
    },
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (threadId: string) => api.deleteThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads });
    },
  });
}

export function useConnectMcp(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string | null) => api.connectMcp(threadId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thread(threadId) });
    },
  });
}
