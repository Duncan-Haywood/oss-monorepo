// Keep the books in a file the user chose, not only in the browser's storage.
// Chrome, Edge and Opera (desktop and Android) let a page write to a file the
// user picked (File System Access API); Firefox and Safari do not, and the
// page falls back to the "Download the books file" button. Nothing here leaves
// the device: the handle is a local file and its reference sits in this
// browser's IndexedDB.

export const serializeBooks = (books) => JSON.stringify(books, null, 1);

export const isBooksFile = (b) => !!b && Array.isArray(b.transactions) && Array.isArray(b.accounts);

export const liveFileSupported = (win = globalThis) =>
  typeof win.showSaveFilePicker === "function" && typeof win.showOpenFilePicker === "function";

const PICKER_TYPES = [{ description: "Books file", accept: { "application/json": [".json"] } }];

export const pickNewFile = (win = globalThis, day = new Date().toISOString().slice(0, 10)) =>
  win.showSaveFilePicker({ suggestedName: `books-${day}.json`, types: PICKER_TYPES });

export const pickExistingFile = async (win = globalThis) => (await win.showOpenFilePicker({ types: PICKER_TYPES, multiple: false }))[0];

// Read a picked file and refuse anything that is not a books file, so a wrong
// pick can never be overwritten by the next save.
export async function readBooksFromHandle(handle) {
  const b = JSON.parse(await (await handle.getFile()).text());
  if (!isBooksFile(b)) throw new Error("not a books file");
  return b;
}

// A queryPermission/requestPermission round trip. `ask` is true only inside a
// click handler: browsers refuse to prompt otherwise.
export async function ensureWritable(handle, ask) {
  const mode = { mode: "readwrite" };
  if (typeof handle.queryPermission !== "function") return true;
  if ((await handle.queryPermission(mode)) === "granted") return true;
  return ask && typeof handle.requestPermission === "function" && (await handle.requestPermission(mode)) === "granted";
}

// Debounced, coalescing writer. A burst of edits makes one write; an edit that
// lands while a write is running makes exactly one more afterwards, with the
// newest books. `createWritable` writes to a swap file and replaces the target
// on close, so a crash mid-write leaves the old file intact.
export function createLiveWriter({ handle, getBooks, onStatus = () => {}, delayMs = 700, timers = globalThis }) {
  let timer = null, running = false, dirty = false, lastWritten = null, stopped = false;

  async function write() {
    if (stopped) return;
    if (running) { dirty = true; return; }
    running = true;
    try {
      do {
        dirty = false;
        const books = getBooks();
        if (!isBooksFile(books)) throw new Error("the books in memory are not a books file; nothing written");
        const text = serializeBooks(books);
        if (text === lastWritten) continue;
        const w = await handle.createWritable();
        try { await w.write(text); } finally { await w.close(); }
        lastWritten = text;
        onStatus({ ok: true, name: handle.name, bytes: text.length, at: Date.now() });
      } while (dirty && !stopped);
    } catch (e) {
      onStatus({ ok: false, name: handle.name, error: e.message || String(e) });
    } finally { running = false; }
  }

  return {
    schedule() { if (stopped) return; timers.clearTimeout(timer); timer = timers.setTimeout(write, delayMs); },
    async flush() { timers.clearTimeout(timer); timer = null; await write(); },
    stop() { stopped = true; timers.clearTimeout(timer); },
    get name() { return handle.name; },
  };
}

// Remember the handle between visits (FileSystemFileHandle is structured
// cloneable, so IndexedDB can hold it). Every call is best effort: a private
// window or a blocked store just means "pick the file again".
const DB = "ai-bookkeeper-live", STORE_NAME = "handles", KEY = "books";
const open = (idb) => new Promise((res, rej) => { const r = idb.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE_NAME); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (idb, mode, fn) => { const db = await open(idb); return new Promise((res, rej) => { const t = db.transaction(STORE_NAME, mode), q = fn(t.objectStore(STORE_NAME)); t.oncomplete = () => { db.close(); res(q?.result); }; t.onerror = () => { db.close(); rej(t.error); }; }); };
export const rememberHandle = async (handle, idb = globalThis.indexedDB) => { try { await tx(idb, "readwrite", (s) => s.put(handle, KEY)); return true; } catch { return false; } };
export const recallHandle = async (idb = globalThis.indexedDB) => { try { return (await tx(idb, "readonly", (s) => s.get(KEY))) ?? null; } catch { return null; } };
export const forgetHandle = async (idb = globalThis.indexedDB) => { try { await tx(idb, "readwrite", (s) => s.delete(KEY)); } catch { /* optional */ } };
