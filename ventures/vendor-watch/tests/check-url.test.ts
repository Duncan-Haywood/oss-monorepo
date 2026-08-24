import assert from "node:assert/strict";
import { test } from "node:test";
import { checkUrl, isPlausibleHttpUrl, normalizeHtmlToText, type FetchFn } from "../src/lib/check-url";
import { clearWatchStoreForTests } from "../src/lib/watch-store";

function fakeResponse(status: number, text: string): Response {
  return new Response(text, { status });
}

function fetchReturning(status: number, html: string): FetchFn {
  return async () => fakeResponse(status, html);
}

test("isPlausibleHttpUrl accepts only well-formed http(s) URLs", () => {
  assert.equal(isPlausibleHttpUrl("https://example.com/terms"), true);
  assert.equal(isPlausibleHttpUrl("http://example.com"), true);
  assert.equal(isPlausibleHttpUrl("ftp://example.com"), false);
  assert.equal(isPlausibleHttpUrl("javascript:alert(1)"), false);
  assert.equal(isPlausibleHttpUrl("not a url"), false);
  assert.equal(isPlausibleHttpUrl(""), false);
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
      init?.signal?.addEventListener("abort", () => {
        const err = new Error("This operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
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
