import { describe, expect, it } from "vitest";
import { checkOrigin } from "@/lib/originCheck";

function headers(h: Record<string, string>): Headers {
  return new Headers(h);
}

describe("checkOrigin", () => {
  it("lets a request from the app's own pages through", () => {
    const v = checkOrigin("POST", headers({ origin: "https://quickpick.app", host: "quickpick.app" }));
    expect(v.allowed).toBe(true);
  });

  it("blocks a post from another site", () => {
    const v = checkOrigin("POST", headers({ origin: "https://evil.example", host: "quickpick.app" }));
    expect(v.allowed).toBe(false);
  });

  it("does not treat a subdomain as the same origin", () => {
    // `evil.quickpick.app` is a different origin and a real attack shape when
    // subdomains can be registered by third parties.
    const v = checkOrigin(
      "POST",
      headers({ origin: "https://evil.quickpick.app", host: "quickpick.app" }),
    );
    expect(v.allowed).toBe(false);
  });

  it("compares the port too", () => {
    const v = checkOrigin(
      "POST",
      headers({ origin: "http://localhost:3001", host: "localhost:3000" }),
    );
    expect(v.allowed).toBe(false);
  });

  it("matches the proxy's forwarded host rather than the internal one", () => {
    // On Vercel `host` is the internal hostname; comparing against it would
    // reject every real request from the deployed site.
    const v = checkOrigin(
      "POST",
      headers({
        origin: "https://quickpick.app",
        host: "quick-pick-survey.internal",
        "x-forwarded-host": "quickpick.app",
      }),
    );
    expect(v.allowed).toBe(true);
  });

  it("uses only the first entry of a forwarded-host chain", () => {
    const v = checkOrigin(
      "POST",
      headers({
        origin: "https://quickpick.app",
        host: "internal",
        "x-forwarded-host": "quickpick.app, evil.example",
      }),
    );
    expect(v.allowed).toBe(true);
  });

  it("ignores case in the host, which is case-insensitive", () => {
    const v = checkOrigin("POST", headers({ origin: "https://QuickPick.app", host: "quickpick.app" }));
    expect(v.allowed).toBe(true);
  });

  it("blocks an opaque origin, which cannot be shown to be ours", () => {
    const v = checkOrigin("POST", headers({ origin: "null", host: "quickpick.app" }));
    expect(v.allowed).toBe(false);
  });

  it("blocks a request a browser itself calls cross-site, even with no origin", () => {
    // The header a cross-origin caller would have to omit to get past the
    // origin comparison is exactly the one the browser sets independently.
    const v = checkOrigin("POST", headers({ host: "quickpick.app", "sec-fetch-site": "cross-site" }));
    expect(v.allowed).toBe(false);
  });

  it("allows same-origin and same-site fetch metadata", () => {
    for (const site of ["same-origin", "same-site", "none"]) {
      const v = checkOrigin(
        "POST",
        headers({ origin: "https://quickpick.app", host: "quickpick.app", "sec-fetch-site": site }),
      );
      expect(v.allowed, site).toBe(true);
    }
  });

  it("allows a caller that is not a browser at all", () => {
    // curl, the admin export, the integration suite. No cookie is attached by
    // anything but a browser, so there is nothing here to forge.
    expect(checkOrigin("POST", headers({ host: "quickpick.app" })).allowed).toBe(true);
  });

  it("blocks an origin that is not a URL", () => {
    expect(checkOrigin("POST", headers({ origin: "not a url", host: "quickpick.app" })).allowed).toBe(
      false,
    );
  });

  it("blocks when there is no host to compare against", () => {
    expect(checkOrigin("POST", headers({ origin: "https://quickpick.app" })).allowed).toBe(false);
  });

  it("leaves reads alone, whatever origin they come from", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      const v = checkOrigin(method, headers({ origin: "https://evil.example", host: "quickpick.app" }));
      expect(v.allowed, method).toBe(true);
    }
  });

  it("covers every method that can change state", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "delete"]) {
      const v = checkOrigin(method, headers({ origin: "https://evil.example", host: "quickpick.app" }));
      expect(v.allowed, method).toBe(false);
    }
  });

  it("names why it blocked, so the log says something useful", () => {
    const v = checkOrigin("POST", headers({ origin: "https://evil.example", host: "quickpick.app" }));
    expect(v.allowed === false && v.reason).toBe("origin does not match host");
  });
});
