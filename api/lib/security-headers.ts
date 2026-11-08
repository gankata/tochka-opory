const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const productionCsp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data: blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

export function applySecurityHeaders(headers: Headers, options: { production: boolean; path: string }) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  headers.set("X-XSS-Protection", "0");

  if (options.production) headers.set("Content-Security-Policy", productionCsp);
  if (options.path.startsWith("/api/") && !options.path.startsWith("/api/note-assets/")) {
    headers.set("Cache-Control", "no-store");
  }
}

export function hasAllowedOrigin(request: Request) {
  if (!unsafeMethods.has(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}
