import { test } from "node:test";
import assert from "node:assert/strict";
import { createLiveWriter, readBooksFromHandle, ensureWritable, liveFileSupported, serializeBooks, isBooksFile } from "./livefile.mjs";
import { newBooks } from "./engine.mjs";

// A fake file handle that records every committed write, like a real swap-file write.
function fakeHandle({ failNext = false, slow = false } = {}) {
  const h = { name: "books.json", content: "", commits: 0, failNext, inflight: 0, maxInflight: 0 };
  h.createWritable = async () => {
    h.inflight++; h.maxInflight = Math.max(h.maxInflight, h.inflight);
    let buf = "";
    return {
      write: async (t) => { if (slow) await new Promise((r) => setTimeout(r, 15)); buf += t; },
      close: async () => { h.inflight--; if (h.failNext) { h.failNext = false; throw new Error("disk full"); } h.content = buf; h.commits++; },
    };
  };
  h.getFile = async () => ({ text: async () => h.content });
  return h;
}
const manual = () => { const q = []; return { setTimeout: (f) => { q.push(f); return q.length; }, clearTimeout: () => { q.length = 0; }, fire: () => q.splice(0).forEach((f) => f()) }; };

test("support is detected from the two picker functions", () => {
  assert.equal(liveFileSupported({}), false);
  assert.equal(liveFileSupported({ showSaveFilePicker() {}, showOpenFilePicker() {} }), true);
});

test("a burst of edits is one write holding the newest books", async () => {
  const h = fakeHandle(), t = manual(), books = newBooks(), seen = [];
  const w = createLiveWriter({ handle: h, getBooks: () => books, onStatus: (s) => seen.push(s), timers: t });
  w.schedule(); books.accounts.push({ code: "9999", name: "X", type: "expense" }); w.schedule(); w.schedule();
  await w.flush();
  assert.equal(h.commits, 1);
  assert.equal(JSON.parse(h.content).accounts.at(-1).code, "9999");
  assert.equal(seen.at(-1).ok, true);
});

test("an unchanged book is not rewritten", async () => {
  const h = fakeHandle(), books = newBooks();
  const w = createLiveWriter({ handle: h, getBooks: () => books, timers: manual() });
  await w.flush(); await w.flush();
  assert.equal(h.commits, 1);
});

test("an edit during a write makes one more write and writes never overlap", async () => {
  const h = fakeHandle({ slow: true }), books = newBooks();
  const w = createLiveWriter({ handle: h, getBooks: () => books, timers: manual() });
  const first = w.flush();
  await new Promise((r) => setTimeout(r, 5));
  books.accounts.push({ code: "9998", name: "Y", type: "expense" });
  const second = w.flush();
  await Promise.all([first, second]);
  assert.equal(h.maxInflight, 1);
  assert.equal(JSON.parse(h.content).accounts.at(-1).code, "9998");
});

test("a failed write is reported, keeps the old file, and the next save retries", async () => {
  const h = fakeHandle(), books = newBooks(), seen = [];
  const w = createLiveWriter({ handle: h, getBooks: () => books, onStatus: (s) => seen.push(s), timers: manual() });
  await w.flush();
  const good = h.content;
  books.accounts.push({ code: "9997", name: "Z", type: "expense" });
  h.failNext = true;
  await w.flush();
  assert.equal(seen.at(-1).ok, false);
  assert.match(seen.at(-1).error, /disk full/);
  assert.equal(h.content, good);
  await w.flush();
  assert.equal(seen.at(-1).ok, true);
  assert.equal(JSON.parse(h.content).accounts.at(-1).code, "9997");
});

test("memory that is not a books file is never written over the file", async () => {
  const h = fakeHandle(), seen = [];
  h.content = serializeBooks(newBooks());
  const before = h.content;
  const w = createLiveWriter({ handle: h, getBooks: () => ({ oops: 1 }), onStatus: (s) => seen.push(s), timers: manual() });
  await w.flush();
  assert.equal(h.content, before);
  assert.equal(seen.at(-1).ok, false);
});

test("a stopped writer writes nothing", async () => {
  const h = fakeHandle(), w = createLiveWriter({ handle: h, getBooks: () => newBooks(), timers: manual() });
  w.stop(); await w.flush();
  assert.equal(h.commits, 0);
});

test("a picked file is read only when it is a books file", async () => {
  const h = fakeHandle(); h.content = serializeBooks(newBooks());
  assert.equal(isBooksFile(await readBooksFromHandle(h)), true);
  h.content = JSON.stringify({ transactions: 1 });
  await assert.rejects(readBooksFromHandle(h), /not a books file/);
  h.content = "garbage";
  await assert.rejects(readBooksFromHandle(h));
});

test("permission: granted passes, prompt only inside a click", async () => {
  const mk = (state, after) => ({ queryPermission: async () => state, requestPermission: async () => after });
  assert.equal(await ensureWritable(mk("granted", "denied"), false), true);
  assert.equal(await ensureWritable(mk("prompt", "granted"), false), false);
  assert.equal(await ensureWritable(mk("prompt", "granted"), true), true);
  assert.equal(await ensureWritable(mk("prompt", "denied"), true), false);
  assert.equal(await ensureWritable({}, false), true);
});
