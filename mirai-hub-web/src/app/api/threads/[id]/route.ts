import { proxyJson } from "@/lib/backend";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return proxyJson(request, `/api/threads/${id}`);
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.text();
  return proxyJson(request, `/api/threads/${id}`, { method: "PATCH", body });
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return proxyJson(request, `/api/threads/${id}`, { method: "DELETE" });
}
