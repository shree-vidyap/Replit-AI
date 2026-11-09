import { NextRequest, NextResponse } from "next/server";

const APP_HOSTS = (process.env.APP_HOSTS ?? "localhost:3000,127.0.0.1:3000").split(",").map((h) => h.trim());

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  const { pathname } = req.nextUrl;

  // Deployed sites and custom domains: <slug>.localhost, app.customer.com, ...
  if (!APP_HOSTS.includes(host)) {
    const url = req.nextUrl.clone();
    url.pathname = `/sites/${encodeURIComponent(host)}${pathname}`;
    return NextResponse.rewrite(url);
  }

  const needsLogin =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/billing") ||
    (pathname.startsWith("/workspace/") && pathname !== "/workspace/local");

  if (needsLogin) {
    const has = req.cookies.has("authjs.session-token") || req.cookies.has("__Secure-authjs.session-token");
    if (!has) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
