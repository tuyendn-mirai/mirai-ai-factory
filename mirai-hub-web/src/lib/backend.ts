// Small helper shared by every BFF route handler in src/app/api/**.
//
// These handlers are thin proxies to the FastAPI backend's ClusterIP
// service: the browser only ever talks to this Next.js origin (no CORS to
// configure), and this file re-forwards the session cookie both ways so
// the backend's httpOnly `mirai_hub_session` cookie keeps working exactly
// as if the browser hit it directly.

const DEFAULT_BACKEND_URL = "http://localhost:8000";

export function backendBaseUrl(): string {
  return process.env.BACKEND_INTERNAL_URL || DEFAULT_BACKEND_URL;
}

export function backendUrl(path: string): string {
  return `${backendBaseUrl()}${path}`;
}

/**
 * Proxy an incoming Next.js request to the backend, forwarding the
 * Cookie header in and Set-Cookie headers back out. Use for ordinary
 * JSON request/response routes (not SSE — see proxyStream below).
 */
export async function proxyJson(
  request: Request,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const backendRes = await fetch(backendUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  const contentType = backendRes.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  for (const setCookie of backendRes.headers.getSetCookie?.() ?? []) {
    responseHeaders.append("set-cookie", setCookie);
  }

  const body = await backendRes.arrayBuffer();
  return new Response(body, {
    status: backendRes.status,
    headers: responseHeaders,
  });
}

/**
 * Proxy an incoming request to a backend SSE endpoint, piping the
 * ReadableStream straight through unbuffered so tokens reach the browser
 * as they're produced instead of being held until the response ends.
 */
export async function proxyStream(
  request: Request,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const backendRes = await fetch(backendUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  responseHeaders.set("content-type", "text/event-stream");
  responseHeaders.set("cache-control", "no-cache, no-transform");
  responseHeaders.set("connection", "keep-alive");
  responseHeaders.set("x-accel-buffering", "no");
  for (const setCookie of backendRes.headers.getSetCookie?.() ?? []) {
    responseHeaders.append("set-cookie", setCookie);
  }

  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: responseHeaders,
  });
}
