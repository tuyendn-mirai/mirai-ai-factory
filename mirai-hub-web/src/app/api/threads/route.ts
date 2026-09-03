import { proxyJson } from "@/lib/backend";

export async function GET(request: Request) {
  return proxyJson(request, "/api/threads");
}

export async function POST(request: Request) {
  return proxyJson(request, "/api/threads", { method: "POST" });
}
