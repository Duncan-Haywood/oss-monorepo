import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkUrl,
  configureCheckUrlForTests,
  isPlausibleHttpUrl,
  normalizeHtmlToText,
  type FetchFn,
} from "../src/lib/check-url";
import { clearWatchStoreForTests } from "../src/lib/watch-store";

function fakeResponse(status: number, text: string): Response {
  return new Response(text, { status });
}

function fetchReturning(status: number, html: string): FetchFn {
  return async () => fakeResponse(status, html);
}

test("isPlausibleHttpUrl accepts only well-formed public http(s) URLs", () => {
  assert.equal(isPlausibleHttpUrl("https://example.com/terms"), true);
  assert.equal(isPlausibleHttpUrl("http://example.com"), true);
  assert.equal(isPlausibleHttpUrl("ftp://example.com"), false);
  assert.equal(isPlausibleHttpUrl("javascript:alert(1)"), false);
  assert.equal(isPlausibleHttpUrl("not a url"), false);
  assert.equal(isPlausibleHttpUrl(""), false);
  assert.equal(isPlausibleHttpUrl("http://127.0.0.1/"), false);
  assert.equal(isPlausibleHttpUrl("http://localhost/admin"), false);
  assert.equal(isPlausibleHttpUrl("http://192.168.1.1/"), false);
  assert.equal(isPlausibleHttpUrl("http://10.0.0.5/"), false);
  assert.equal(isPlausibleHttpUrl("http://169.254.169.254/latest/meta-data/"), false);
  assert.equal(isPlausibleHttpUrl("http://[::1]/"), false);
  assert.equal(isPlausibleHttpUrl("http://[::ffff:127.0.0.1]/"), false);
});

test("normalizeHtmlToText strips tags, scripts, and collapses whitespace", () => {
  const html = "<html><head><style>.x{}</style></head><body><script>evil()</script>" +
    "<h1>Terms</h1>\n\n<p>You   must   agree &amp; comply.</p></body></html>";
  assert.equal(normalizeHtmlToText(html), "Terms You must agree & comply.");
});

test("first check of a URL stores a snapshot and reports first_snapshot", async () => {
  clearWatchStoreForTests();
  const fetchImpl = fetchReturning(200, "<p>Version one of the terms.</p>");
  const result = await checkUrl("https://example.com/terms", fetchImpl);

  assert.equal(result.outcome, "first_snapshot");
  assert.equal(result.httpStatus, 200);
  assert.equal(result.previous, undefined);
  assert.equal(result.diff, undefined);
});

test("a later check with identical text reports unchanged", async () => {
  clearWatchStoreForTests();
  const html = "<p>Version one of the terms.</p>";
  await checkUrl("https://example.com/terms", fetchReturning(200, html));
  const second = await checkUrl("https://example.com/terms", fetchReturning(200, html));

  assert.equal(second.outcome, "unchanged");
  assert.ok(second.previous);
  assert.equal(second.httpStatus, 200);
});

test("a later check with different text reports changed and includes a diff", async () => {
  clearWatchStoreForTests();
  await checkUrl(
    "https://example.com/terms",
    fetchReturning(200, "<p>You must pay within 30 days.</p>"),
  );
  const second = await checkUrl(
    "https://example.com/terms",
    fetchReturning(200, "<p>You must pay within 60 days.</p>"),
  );

  assert.equal(second.outcome, "changed");
  assert.ok(second.diff);
  assert.ok(second.diff!.some((op) => op.type === "removed" && op.value.includes("30")));
  assert.ok(second.diff!.some((op) => op.type === "added" && op.value.includes("60")));
});

test("a non-2xx response is labeled inconclusive, never unchanged", async () => {
  clearWatchStoreForTests();
  await checkUrl("https://example.com/terms", fetchReturning(200, "<p>Original text.</p>"));
  const second = await checkUrl("https://example.com/terms", fetchReturning(503, "Service unavailable"));

  assert.equal(second.outcome, "inconclusive");
  assert.equal(second.httpStatus, 503);
  assert.ok(second.errorMessage);
  assert.ok(second.previous, "should still reference the last good snapshot for context");
});

test("HTTP 204 and 205 are inconclusive and do not store or overwrite a snapshot", async () => {
  clearWatchStoreForTests();
  const noContentFetch = (status: number): FetchFn => async () => new Response(null, { status });

  const firstEmpty = await checkUrl("https://example.com/empty", noContentFetch(204));
  assert.equal(firstEmpty.outcome, "inconclusive");
  assert.equal(firstEmpty.httpStatus, 204);
  assert.ok(firstEmpty.errorMessage);

  const firstReal = await checkUrl("https://example.com/empty", fetchReturning(200, "<p>Actual page.</p>"));
  assert.equal(firstReal.outcome, "first_snapshot");

  await checkUrl("https://example.com/terms", fetchReturning(200, "<p>Original text.</p>"));
  for (const status of [204, 205]) {
    const result = await checkUrl("https://example.com/terms", noContentFetch(status));
    assert.equal(result.outcome, "inconclusive");
    assert.equal(result.httpStatus, status);
    assert.ok(result.errorMessage);
    assert.ok(result.previous);
  }

  const after = await checkUrl("https://example.com/terms", fetchReturning(200, "<p>Original text.</p>"));
  assert.equal(after.outcome, "unchanged");
});

test("a network/fetch error is labeled inconclusive and preserves the prior snapshot", async () => {
  clearWatchStoreForTests();
  await checkUrl("https://example.com/terms", fetchReturning(200, "<p>Original text.</p>"));

  const throwingFetch: FetchFn = async () => {
    throw new Error("getaddrinfo ENOTFOUND example.com");
  };
  const second = await checkUrl("https://example.com/terms", throwingFetch);

  assert.equal(second.outcome, "inconclusive");
  assert.equal(second.httpStatus, null);
  assert.match(second.errorMessage ?? "", /ENOTFOUND/);

  // Because the failed fetch must not overwrite the last good snapshot,
  // a subsequent successful fetch with the *same* text as before the
  // failure should still report "unchanged", not treat the gap as a change.
  const third = await checkUrl("https://example.com/terms", fetchReturning(200, "<p>Original text.</p>"));
  assert.equal(third.outcome, "unchanged");
});

test("an aborted/timed-out fetch is labeled inconclusive", async () => {
  clearWatchStoreForTests();
  const abortingFetch: FetchFn = async (_url, init) => {
    return new Promise((_resolve, reject) => {
      const rejectAbort = () => {
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (init?.signal?.aborted) {
        rejectAbort();
        return;
      }
      init?.signal?.addEventListener("abort", rejectAbort);
    });
  };
  const controller = new AbortController();
  // Simulate an immediate abort so the test does not wait out the real timeout.
  queueMicrotask(() => controller.abort());
  const wrapped: FetchFn = async (url) => abortingFetch(url, { signal: controller.signal });

  const result = await checkUrl("https://example.com/terms", wrapped);
  assert.equal(result.outcome, "inconclusive");
  assert.equal(result.httpStatus, null);
});

test("a failure while reading the response body is labeled inconclusive", async () => {
  clearWatchStoreForTests();
  await checkUrl("https://example.com/terms", fetchReturning(200, "<p>Original text.</p>"));

  const body = new ReadableStream({
    start(controller) {
      controller.error(new Error("stream reset"));
    },
  });
  const fetchImpl: FetchFn = async () => new Response(body, { status: 200 });
  const second = await checkUrl("https://example.com/terms", fetchImpl);

  assert.equal(second.outcome, "inconclusive");
  assert.equal(second.httpStatus, null);
  assert.match(second.errorMessage ?? "", /stream reset/);

  const third = await checkUrl("https://example.com/terms", fetchReturning(200, "<p>Original text.</p>"));
  assert.equal(third.outcome, "unchanged");
});

test("does not follow a redirect onto a private or loopback address", async () => {
  clearWatchStoreForTests();
  const requested: string[] = [];
  const fetchImpl: FetchFn = async (input) => {
    requested.push(String(input));
    if (String(input) === "https://example.com/terms") {
      return new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/secret" },
      });
    }
    return new Response("internal secret", { status: 200 });
  };

  const result = await checkUrl("https://example.com/terms", fetchImpl);
  assert.equal(result.outcome, "inconclusive");
  assert.equal(result.httpStatus, null);
  assert.ok(!requested.some((value) => value.includes("127.0.0.1")));
});

test("refuses a hostname whose resolved addresses include a blocked IP", async () => {
  clearWatchStoreForTests();
  configureCheckUrlForTests({
    lookup: async () => [{ address: "127.0.0.1", family: 4 }],
  });
  let fetched = false;
  const fetchImpl: FetchFn = async () => {
    fetched = true;
    return fakeResponse(200, "<p>should not be fetched</p>");
  };

  try {
    const result = await checkUrl("https://example.com/terms", fetchImpl);
    assert.equal(result.outcome, "inconclusive");
    assert.equal(result.httpStatus, null);
    assert.match(result.errorMessage ?? "", /not a public http\(s\) address/);
    assert.equal(fetched, false);
  } finally {
    configureCheckUrlForTests();
  }
});

test("pins the request to the pre-resolved address so fetch cannot rebind DNS", async () => {
  clearWatchStoreForTests();
  configureCheckUrlForTests({
    timeoutMs: 400,
    // TEST-NET-1 is not blocked, but nothing answers there. If the default
    // fetch path re-resolved example.com instead of pinning this address,
    // the check would succeed with HTTP 200.
    lookup: async () => [{ address: "192.0.2.1", family: 4 }],
  });

  try {
    const result = await checkUrl("https://example.com/terms");
    assert.equal(result.outcome, "inconclusive");
    // Some CI networks return a synthetic non-200 response for TEST-NET-1;
    // the security property is that the real example.com response is never
    // reached after DNS resolution is pinned.
    assert.notEqual(result.httpStatus, 200);
    assert.ok(result.errorMessage);
  } finally {
    configureCheckUrlForTests();
  }
});

test("a hanging DNS lookup is aborted by the check timeout", async () => {
  clearWatchStoreForTests();
  configureCheckUrlForTests({
    timeoutMs: 30,
    lookup: () => new Promise(() => {}),
  });

  try {
    const started = Date.now();
    const result = await checkUrl("https://example.com/terms", fetchReturning(200, "<p>unused</p>"));
    assert.equal(result.outcome, "inconclusive");
    assert.equal(result.httpStatus, null);
    assert.match(result.errorMessage ?? "", /timed out after 30ms/);
    assert.ok(Date.now() - started < 1000, "DNS wait should not exceed the check timeout");
  } finally {
    configureCheckUrlForTests();
  }
});

test("stops reading an oversized response body before it is fully buffered", async () => {
  clearWatchStoreForTests();
  let pulled = 0;
  const chunk = new Uint8Array(8192);
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  const fetchImpl: FetchFn = async () => new Response(body, { status: 200 });
  const result = await checkUrl("https://example.com/huge", fetchImpl);

  assert.equal(result.outcome, "first_snapshot");
  assert.ok(pulled < 512_000, `read ${pulled} bytes before cancelling`);
});
