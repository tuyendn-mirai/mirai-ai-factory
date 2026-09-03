import { proxyJson } from "@/lib/backend";

export async function POST(request: Request) {
  return proxyJson(request, "/api/auth/logout", { method: "POST" });
}
