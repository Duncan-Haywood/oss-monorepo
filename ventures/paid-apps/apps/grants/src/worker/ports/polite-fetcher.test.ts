import { describe, expect, it } from "vitest";
import { fromBase64, PoliteWebFetcher, WebFetchError } from "./polite-fetcher";

const UA = "GrantAutopilotBot/0.1 (+https://example.org/bot)";

type Route = (req: { url: string; headers: Headers }) => Response;

function harness(routes: Record<string, Route | Response>) {
  const calls: string[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push(url);
    const r = routes[url];
    if (!r) return new Response("nope", { status: 404 });
    return typeof r === "function" ? r({ url, headers: new Headers(init?.headers) }) : r.clone();
  }) as typeof fetch;
  const fetcher = new PoliteWebFetcher(UA, {
    fetch: fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  });
  return { fetcher, calls, sleeps };
}

const html = (body: string, extra: Record<string, string> = {}) =>
  new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...extra },
  });

describe("PoliteWebFetcher", () => {
  it("obeys robots.txt Disallow for our token and sends our user agent", async () => {
    let seenUa = "";
    const { fetcher, calls } = harness({
      "https://org.example.org/robots.txt": new Response(
        "User-agent: GrantAutopilotBot\nDisallow: /private\n\nUser-agent: *\nDisallow: /\n",
      ),
      "https://org.example.org/about": ({ headers }) => {
        seenUa = headers.get("user-agent") ?? "";
        return html("<p>About</p>");
      },
    });
    expect(await fetcher.fetchPage("https://org.example.org/private/x")).toBeNull();
    const page = await fetcher.fetchPage("https://org.example.org/about");
    expect(page?.status).toBe(200);
    expect(page?.body).toContain("About");
    expect(seenUa).toBe(UA);
    // robots.txt fetched once and cached
    expect(calls.filter((c) => c.endsWith("/robots.txt"))).toHaveLength(1);
    expect(calls).not.toContain("https://org.example.org/private/x");
  });

  it("treats 404 robots.txt as allow-all and 5xx as disallow-all", async () => {
    const a = harness({ "https://a.example.org/x": html("<p>x</p>") });
    expect((await a.fetcher.fetchPage("https://a.example.org/x"))?.status).toBe(200);
    const b = harness({
      "https://b.example.org/robots.txt": new Response("err", { status: 503 }),
      "https://b.example.org/x": html("<p>x</p>"),
    });
    expect(await b.fetcher.fetchPage("https://b.example.org/x")).toBeNull();
  });

  it("waits at least 1s between requests to a host, or the crawl-delay", async () => {
    const { fetcher, sleeps } = harness({
      "https://slow.example.org/robots.txt": new Response("User-agent: *\nCrawl-delay: 3\n"),
      "https://slow.example.org/a": html("a"),
      "https://slow.example.org/b": html("b"),
    });
    await fetcher.fetchPage("https://slow.example.org/a");
    await fetcher.fetchPage("https://slow.example.org/b");
    // robots fetch → wait ≥1s → /a → wait 3s (crawl-delay) → /b
    expect(sleeps).toEqual([1000, 3000]);
  });

  it("re-validates redirects: follows safe ones, blocks private targets, caps hops", async () => {
    const { fetcher } = harness({
      "https://r.example.org/start": new Response(null, {
        status: 302,
        headers: { location: "/final" },
      }),
      "https://r.example.org/final": html("final"),
      "https://r.example.org/evil": new Response(null, {
        status: 301,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      }),
      "https://r.example.org/loop": new Response(null, {
        status: 302,
        headers: { location: "/loop" },
      }),
    });
    const ok = await fetcher.fetchPage("https://r.example.org/start");
    expect(ok?.url).toBe("https://r.example.org/final");
    await expect(fetcher.fetchPage("https://r.example.org/evil")).rejects.toMatchObject({
      code: "blocked_url",
    });
    await expect(fetcher.fetchPage("https://r.example.org/loop")).rejects.toMatchObject({
      code: "too_many_redirects",
    });
  });

  it("refuses unsafe URLs before any network call", async () => {
    const { fetcher, calls } = harness({});
    await expect(fetcher.fetchPage("http://localhost/admin")).rejects.toBeInstanceOf(WebFetchError);
    await expect(fetcher.fetchPage("http://10.0.0.1/")).rejects.toMatchObject({
      code: "blocked_url",
    });
    expect(calls).toHaveLength(0);
  });

  it("enforces the content-type allowlist and the size cap", async () => {
    const big = "x".repeat(3 * 1024 * 1024 + 10);
    const { fetcher } = harness({
      "https://c.example.org/img.png": new Response("png", {
        headers: { "content-type": "image/png" },
      }),
      "https://c.example.org/big": html(big),
    });
    await expect(fetcher.fetchPage("https://c.example.org/img.png")).rejects.toMatchObject({
      code: "unsupported_content_type",
    });
    await expect(fetcher.fetchPage("https://c.example.org/big")).rejects.toMatchObject({
      code: "too_large",
    });
  });

  it("returns PDFs base64-encoded (fetchPage) or as bytes (fetchBinary)", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0x00]);
    const { fetcher } = harness({
      "https://p.example.org/rfp.pdf": new Response(bytes, {
        headers: { "content-type": "application/pdf" },
      }),
    });
    const page = await fetcher.fetchPage("https://p.example.org/rfp.pdf");
    expect(page?.encoding).toBe("base64");
    expect(new Uint8Array(fromBase64(page?.body ?? ""))).toEqual(bytes);
    const bin = await fetcher.fetchBinary("https://p.example.org/rfp.pdf");
    expect(new Uint8Array(bin?.bytes ?? new ArrayBuffer(0))).toEqual(bytes);
  });

  it("passes non-2xx statuses through", async () => {
    const { fetcher } = harness({
      "https://e.example.org/gone": new Response("gone", { status: 410 }),
    });
    expect((await fetcher.fetchPage("https://e.example.org/gone"))?.status).toBe(410);
  });
});

describe("fetchJson (official APIs)", () => {
  it("parses JSON but never follows a redirect (could point at an internal host)", async () => {
    const { fetcher, calls } = harness({
      "https://api.example.org/ok": Response.json({ hits: 3 }),
      "https://api.example.org/moved": new Response(null, {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      }),
    });
    expect(await fetcher.fetchJson<{ hits: number }>("https://api.example.org/ok")).toEqual({
      hits: 3,
    });
    await expect(fetcher.fetchJson("https://api.example.org/moved")).rejects.toThrow(/302/);
    expect(calls).not.toContain("http://169.254.169.254/latest/meta-data/");
    await expect(fetcher.fetchJson("http://127.0.0.1/admin")).rejects.toThrow(WebFetchError);
  });
});
