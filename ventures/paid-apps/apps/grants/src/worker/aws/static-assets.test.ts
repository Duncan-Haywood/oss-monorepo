import { describe, expect, it } from "vitest";
import { assetSegments, parseHeadersFile, parseRedirectsFile, serveAsset } from "./static-assets";

const files: Record<string, string> = {
  "index.html": "<!doctype html>shell",
  "landing.html": "landing",
  "assets/app-1234.js": "js",
  "demo.html": "demo",
  "legal/terms.html": "terms",
  _headers: "secret config",
};
const read = async (p: string) => (p in files ? new TextEncoder().encode(files[p]) : null);
const config = {
  headers: parseHeadersFile(
    "# comment\n/*\n  Content-Security-Policy: default-src 'self'\n  X-Frame-Options: DENY\n/grants/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n",
  ),
  redirects: parseRedirectsFile(
    "# x\n/grants/ /grants/landing 200\n/grants/old /grants/demo 301\n",
  ),
};

describe("static assets on Lambda", () => {
  it("rejects traversal, hidden and platform files", () => {
    for (const p of ["/../etc/passwd", "/%2e%2e/x", "/.env", "/_headers", "/a\\b", "/%E0%A4%A"]) {
      expect(assetSegments(p), p).toBeNull();
    }
  });

  it("serves files, x.html pages, _redirects rewrites and the SPA fallback with _headers", async () => {
    const js = await serveAsset("/assets/app-1234.js", "/grants", read, config);
    expect(js?.headers.get("content-type")).toContain("javascript");
    expect(js?.headers.get("cache-control")).toContain("immutable");
    expect(js?.headers.get("content-security-policy")).toBe("default-src 'self'");
    expect(await (await serveAsset("/demo", "/grants", read, config))?.text()).toBe("demo");
    expect(await (await serveAsset("/legal/terms", "/grants", read, config))?.text()).toBe("terms");
    expect(await (await serveAsset("/", "/grants", read, config))?.text()).toBe("landing");
    const moved = await serveAsset("/old", "/grants", read, config);
    expect(moved?.status).toBe(301);
    expect(moved?.headers.get("location")).toBe("/grants/demo");
    const spa = await serveAsset("/orgs/org_a/dashboard", "/grants", read, config);
    expect(await spa?.text()).toBe("<!doctype html>shell");
    expect(spa?.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
    expect(spa?.headers.get("x-frame-options")).toBe("DENY");
    expect(await serveAsset("/missing.png", "/grants", read, config)).toBeNull();
    expect(await serveAsset("/_headers", "/grants", read, config)).toBeNull();
  });
});
