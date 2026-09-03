import { proxyJson } from "@/lib/backend";

export async function POST(request: Request) {
  const body = await request.text();
  return proxyJson(request, "/api/auth/login", { method: "POST", body });
}
