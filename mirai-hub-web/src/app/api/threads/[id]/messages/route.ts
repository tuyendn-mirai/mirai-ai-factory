import { proxyStream } from "@/lib/backend";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// SSE endpoint — must not be statically optimized or buffered.
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const body = await request.text();
  return proxyStream(request, `/api/threads/${id}/messages`, { method: "POST", body });
}
