import { proxyJson } from "@/lib/backend";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return proxyJson(request, `/api/threads/${id}/stop`, { method: "POST" });
}
