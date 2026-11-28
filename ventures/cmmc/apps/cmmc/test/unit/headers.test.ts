// The SPA's static headers (public/_headers). Cloudflare Web Analytics injects
// https://static.cloudflareinsights.com/beacon.min.js into each HTML page and reports to /cdn-cgi/rum
// on the same origin (or cloudflareinsights.com); a CSP that refuses either leaves usage unmeasured.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const headers = readFileSync(
  fileURLToPath(new URL("../../public/_headers", import.meta.url)),
  "utf8",
);
const csp = headers.match(/Content-Security-Policy:\s*(.+)/)?.[1] ?? "";
const directive = (name: string) =>
  csp
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `))
    ?.split(/\s+/)
    .slice(1) ?? [];

describe("public/_headers CSP", () => {
  it("lets the Cloudflare Web Analytics beacon load and report", () => {
    expect(directive("script-src")).toEqual(["'self'", "https://static.cloudflareinsights.com"]);
    expect(directive("connect-src")).toEqual(["'self'", "https://cloudflareinsights.com"]);
  });

  it("keeps everything else locked down", () => {
    expect(directive("default-src")).toEqual(["'self'"]);
    expect(directive("frame-ancestors")).toEqual(["'none'"]);
    expect(directive("base-uri")).toEqual(["'none'"]);
    expect(csp).not.toMatch(/unsafe-eval|script-src[^;]*unsafe-inline|\*/);
  });
});
