import { proxyJson } from "@/lib/backend";

interface RouteParams {
  params: Promise<{ flowId: string; fileName: string }>;
}

// Same-origin passthrough for app/routers/files.py's get_tool_audio — the
// <audio src> this app renders (see Markdown.tsx/MessageList.tsx) points
// here rather than at the FastAPI backend directly so the browser never
// needs BACKEND_INTERNAL_URL / CORS configured for a media element.
export async function GET(request: Request, { params }: RouteParams) {
  const { flowId, fileName } = await params;
  return proxyJson(request, `/api/files/tool-audio/${flowId}/${fileName}`, { method: "GET" });
}
