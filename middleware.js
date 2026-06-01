function unauthorized() {
  return new Response("Authentification requise.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Agency SaaS"',
    },
  });
}

export default function middleware(request) {
  const username = process.env.BASIC_AUTH_USER || "admin";
  const password = process.env.BASIC_AUTH_PASSWORD || "changeme";
  const header = request.headers.get("authorization");

  if (!header || !header.startsWith("Basic ")) {
    return unauthorized();
  }

  const decoded = atob(header.slice(6));
  const separatorIndex = decoded.indexOf(":");
  const providedUser = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : "";
  const providedPassword = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

  if (providedUser !== username || providedPassword !== password) {
    return unauthorized();
  }

  return;
}

export const config = {
  matcher: ["/((?!favicon.ico).*)"],
};
