import { proxyJson } from "@/lib/backend";

export async function GET(request: Request) {
  return proxyJson(request, "/api/mcp/projects");
}
