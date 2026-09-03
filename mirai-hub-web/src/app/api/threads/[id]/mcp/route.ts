import { proxyJson } from "@/lib/backend";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(request, `/api/threads/${id}/mcp`, { method: "POST", body });
}
