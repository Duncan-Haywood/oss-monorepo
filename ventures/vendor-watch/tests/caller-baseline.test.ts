// The browser keeps its own baseline and hands it to checkUrl, so a visitor's
// history survives a deploy and is never answered from another visitor's
// snapshot. These cover that path; check-url.test.ts still covers the
// server-store path taken when no baseline is supplied.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkUrl, type FetchFn } from "../src/lib/check-url";
import { clearWatchStoreForTests, getSnapshot, saveSnapshot } from "../src/lib/watch-store";

function fetchReturning(status: number, html: string): FetchFn {
  return async () => new Response(html, { status });
}

const URL_UNDER_TEST = "https://example.com/terms";

test("a supplied baseline drives the comparison instead of the shared store", async () => {
  clearWatchStoreForTests();
  // Someone else already checked this URL and left a snapshot behind.
  saveSnapshot({
    url: URL_UNDER_TEST,
    normalizedText: "Somebody else's page text.",
    hash: "not-the-callers-hash",
    fetchedAt: "2026-08-20T00:00:00.000Z",
    httpStatus: 200,
  });

  const mine = {
    url: URL_UNDER_TEST,
    normalizedText: "Version one of the terms.",
    hash: "",
    fetchedAt: "2026-08-25T00:00:00.000Z",
    httpStatus: 200,
  };
  // Same text, deliberately mismatched hash, so a "changed" result proves the
  // diff ran against *my* text and not the store's.
  const result = await checkUrl(
    URL_UNDER_TEST,
    fetchReturning(200, "<p>Version one of the terms.</p>"),
    { ...mine, hash: "stale-hash" },
  );

  assert.equal(result.outcome, "changed");
  assert.equal(result.previous?.fetchedAt, "2026-08-25T00:00:00.000Z");
  const removed = (result.diff ?? []).filter((op) => op.type === "removed");
  assert.equal(removed.length, 0, "my baseline matched the fetched text word for word");
});

test("a supplied baseline never writes back to the shared store", async () => {
  clearWatchStoreForTests();
  await checkUrl(URL_UNDER_TEST, fetchReturning(200, "<p>Private to this visitor.</p>"), null);
  assert.equal(getSnapshot(URL_UNDER_TEST), undefined);
});

test("an explicit null baseline reports first_snapshot even when the store has one", async () => {
  clearWatchStoreForTests();
  saveSnapshot({
    url: URL_UNDER_TEST,
    normalizedText: "Somebody else's page text.",
    hash: "someone-elses-hash",
    fetchedAt: "2026-08-20T00:00:00.000Z",
    httpStatus: 200,
  });

  const result = await checkUrl(URL_UNDER_TEST, fetchReturning(200, "<p>My first look.</p>"), null);
  assert.equal(result.outcome, "first_snapshot");
  assert.equal(result.previous, undefined);
});

test("a successful check returns the snapshot for the caller to store", async () => {
  clearWatchStoreForTests();
  const result = await checkUrl(URL_UNDER_TEST, fetchReturning(200, "<p>Version one.</p>"), null);
  assert.equal(result.snapshot?.url, URL_UNDER_TEST);
  assert.equal(result.snapshot?.normalizedText, "Version one.");
  assert.equal(result.snapshot?.httpStatus, 200);
  assert.ok((result.snapshot?.hash ?? "").length > 0);
});

test("the returned snapshot round-trips as the next baseline", async () => {
  clearWatchStoreForTests();
  const html = "<p>Version one.</p>";
  const first = await checkUrl(URL_UNDER_TEST, fetchReturning(200, html), null);
  const second = await checkUrl(URL_UNDER_TEST, fetchReturning(200, html), first.snapshot);
  assert.equal(second.outcome, "unchanged");
  assert.equal(second.previous?.fetchedAt, first.fetchedAt);
});

test("an inconclusive check returns no snapshot, so the caller keeps its baseline", async () => {
  clearWatchStoreForTests();
  const good = await checkUrl(URL_UNDER_TEST, fetchReturning(200, "<p>Version one.</p>"), null);
  const failed = await checkUrl(URL_UNDER_TEST, fetchReturning(503, "Service unavailable"), good.snapshot);

  assert.equal(failed.outcome, "inconclusive");
  assert.equal(failed.snapshot, undefined);
  // Nothing overwrote it, so the next good fetch still compares against the
  // page text that was actually seen.
  const recovered = await checkUrl(URL_UNDER_TEST, fetchReturning(200, "<p>Version two.</p>"), good.snapshot);
  assert.equal(recovered.outcome, "changed");
  assert.equal(recovered.previous?.fetchedAt, good.fetchedAt);
});

test("omitting the baseline still uses and writes the shared store", async () => {
  clearWatchStoreForTests();
  const first = await checkUrl(URL_UNDER_TEST, fetchReturning(200, "<p>Version one.</p>"));
  assert.equal(first.outcome, "first_snapshot");
  assert.ok(getSnapshot(URL_UNDER_TEST), "store-backed path still persists");

  const second = await checkUrl(URL_UNDER_TEST, fetchReturning(200, "<p>Version two.</p>"));
  assert.equal(second.outcome, "changed");
});
