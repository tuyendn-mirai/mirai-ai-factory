import "server-only";
import { cookies } from "next/headers";
import { backendUrl } from "./backend";
import type { McpProject, ThreadSummary } from "./types";

/**
 * Server-side fetch straight to the backend (not through the BFF proxy —
 * there's no self-referential origin to resolve on the server, and this
 * runs inside the same trusted network anyway). Used only for the
 * TanStack Query SSR prefetch in app/(chat)/layout.tsx.
 */
async function getBackendJson<T>(path: string): Promise<T | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const res = await fetch(backendUrl(path), {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
    cache: "no-store",
  });

  if (!res.ok) return null;
  return (await res.json()) as T;
}

export async function getThreadsServer(): Promise<ThreadSummary[]> {
  return (await getBackendJson<ThreadSummary[]>("/api/threads")) ?? [];
}

export async function getModelsServer(): Promise<string[]> {
  return (await getBackendJson<string[]>("/api/models")) ?? [];
}

export async function getMcpProjectsServer(): Promise<McpProject[]> {
  return (await getBackendJson<McpProject[]>("/api/mcp/projects")) ?? [];
}
