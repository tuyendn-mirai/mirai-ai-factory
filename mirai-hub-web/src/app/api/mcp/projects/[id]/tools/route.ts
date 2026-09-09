import { proxyJson } from "@/lib/backend";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return proxyJson(request, `/api/mcp/projects/${id}/tools`);
}
