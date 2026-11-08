import { describe, expect, it } from "vitest";
import { applySecurityHeaders, hasAllowedOrigin } from "./security-headers";

describe("security headers", () => {
  it("sets browser protections and production CSP", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { production: true, path: "/" });
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Content-Security-Policy")).toContain("img-src 'self' data: blob: https:");
    expect(headers.get("Content-Security-Policy")).toContain("object-src 'none'");
    expect(headers.get("Cache-Control")).toBeNull();
  });

  it("does not impose production CSP on the Vite development server", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { production: false, path: "/" });
    expect(headers.get("Content-Security-Policy")).toBeNull();
  });

  it("prevents browsers from caching private API responses", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, { production: true, path: "/api/trpc/workspace.get" });
    expect(headers.get("Cache-Control")).toBe("no-store");
  });

  it("preserves immutable caching for authenticated note assets", () => {
    const headers = new Headers({ "Cache-Control": "private, max-age=31536000, immutable" });
    applySecurityHeaders(headers, { production: true, path: "/api/note-assets/1" });
    expect(headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
  });
});

describe("origin validation", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])("rejects a cross-origin %s request", (method) => {
    const request = new Request("http://localhost:7100/api/log", {
      method,
      headers: { origin: "https://attacker.example", host: "localhost:7100" },
    });
    expect(hasAllowedOrigin(request)).toBe(false);
  });

  it("accepts same-origin and safe requests", () => {
    expect(hasAllowedOrigin(new Request("http://localhost:7100/api/log", {
      method: "POST",
      headers: { origin: "http://localhost:7100", host: "localhost:7100" },
    }))).toBe(true);
    expect(hasAllowedOrigin(new Request("http://localhost:7100/api/trpc/workspace.get", {
      headers: { origin: "https://attacker.example", host: "localhost:7100" },
    }))).toBe(true);
  });

  it("allows CLI requests without Origin but rejects malformed Origin", () => {
    expect(hasAllowedOrigin(new Request("http://localhost:7100/api/log", { method: "POST" }))).toBe(true);
    expect(hasAllowedOrigin(new Request("http://localhost:7100/api/log", {
      method: "POST",
      headers: { origin: "null", host: "localhost:7100" },
    }))).toBe(false);
  });
});
