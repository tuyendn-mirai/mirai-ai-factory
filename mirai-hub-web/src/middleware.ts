import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "mirai_hub_session";

export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";

  if (!hasSession && !isLoginPage) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSession && isLoginPage) {
    const chatUrl = new URL("/chat", request.url);
    return NextResponse.redirect(chatUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every page request except static assets and the BFF proxy
  // routes (those forward the cookie to the backend themselves and must
  // return 401 JSON rather than an HTML redirect).
  matcher: ["/((?!api|_next/static|_next/image|.*\\.(?:png|svg|ico|jpg|jpeg|webp)$).*)"],
};
