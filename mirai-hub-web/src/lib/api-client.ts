// Browser-side API client — every call goes through this app's own BFF
// route handlers under src/app/api/**, which forward to the FastAPI
// backend (see lib/backend.ts). Never call the backend origin directly
// from the browser: same-origin keeps the httpOnly session cookie simple
// and avoids CORS entirely.
import type {
  McpConnectResult,
  McpProject,
  ThreadDetail,
  ThreadSummary,
  User,
} from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      // ignore — fall back to the generic message above
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export async function login(username: string, password: string): Promise<{ ok: boolean; user: User }> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return json(res);
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function fetchMe(): Promise<User | null> {
  const res = await fetch("/api/auth/me");
  if (res.status === 401) return null;
  return json(res);
}

export async function fetchModels(): Promise<string[]> {
  const res = await fetch("/api/models");
  return json(res);
}

export async function fetchMcpProjects(): Promise<McpProject[]> {
  const res = await fetch("/api/mcp/projects");
  return json(res);
}

export async function fetchThreads(): Promise<ThreadSummary[]> {
  const res = await fetch("/api/threads");
  return json(res);
}

export async function createThread(): Promise<{ id: string }> {
  const res = await fetch("/api/threads", { method: "POST" });
  return json(res);
}

export async function fetchThread(id: string): Promise<ThreadDetail> {
  const res = await fetch(`/api/threads/${id}`);
  return json(res);
}

export async function updateThread(
  id: string,
  patch: { name?: string; llmModel?: string },
): Promise<void> {
  const res = await fetch(`/api/threads/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  await json(res);
}

export async function deleteThread(id: string): Promise<void> {
  await fetch(`/api/threads/${id}`, { method: "DELETE" });
}

export async function connectMcp(
  threadId: string,
  projectId: string | null,
): Promise<McpConnectResult> {
  const res = await fetch(`/api/threads/${threadId}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId }),
  });
  return json(res);
}

export async function stopGeneration(threadId: string): Promise<void> {
  await fetch(`/api/threads/${threadId}/stop`, { method: "POST" });
}

export async function presignUpload(
  filename: string,
  mime: string,
): Promise<{ uploadUrl: string; elementId: string; objectKey: string }> {
  const res = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename, mime }),
  });
  return json(res);
}

export async function confirmFileUpload(
  threadId: string,
  payload: { objectKey: string; name: string; mime: string; size: number },
): Promise<{ elementId: string }> {
  const res = await fetch(`/api/threads/${threadId}/files/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return json(res);
}
