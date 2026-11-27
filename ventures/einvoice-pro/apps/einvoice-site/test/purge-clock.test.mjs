// The daily purge's Durable Object clock (src/purge-clock.mjs), which replaced the cron trigger.
// The same test sits beside each landing site's copy of the module (here the entry is entry.mjs).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  armPurgeClock,
  FIRST_PURGE_MS,
  PURGE_CLOCK_NAME,
  PURGE_EVERY_MS,
  purgeClockClass,
  withPurgeClock,
} from "../purge-clock.mjs";
import worker, { PurgeClock } from "../entry.mjs";

const ROOT = join(import.meta.dirname, "..");

function fakeStorage() {
  const storage = {
    at: null,
    sets: [],
    async getAlarm() {
      return storage.at;
    },
    async setAlarm(t) {
      storage.at = t;
      storage.sets.push(t);
    },
  };
  return storage;
}

/** A namespace whose one object is a real instance of `Clock`, as workerd would run it. */
function fakeNamespace(Clock, env) {
  const state = { storage: fakeStorage() };
  const ns = {
    state,
    names: [],
    calls: 0,
    fail: false,
    instance: null,
    idFromName(name) {
      ns.names.push(name);
      return { name };
    },
    get() {
      return {
        fetch: async (url) => {
          ns.calls += 1;
          if (ns.fail) throw new Error("no such object");
          ns.instance ??= new Clock(state, env);
          return ns.instance.fetch(new Request(url));
        },
      };
    },
  };
  return ns;
}

const quiet = () => {};

test("arming sets the first alarm a minute out, and only once", async () => {
  const Clock = purgeClockClass(async () => 0, quiet);
  const clock = new Clock({ storage: fakeStorage() }, {});
  const before = Date.now();
  assert.equal(await (await clock.fetch()).text(), "armed");
  const first = clock.state.storage.at;
  assert.ok(first >= before + FIRST_PURGE_MS && first <= Date.now() + FIRST_PURGE_MS);
  assert.equal(await (await clock.fetch()).text(), "already armed");
  assert.equal(clock.state.storage.at, first);
});

test("the alarm re-arms a day out before it purges, so a failed purge keeps the chain", async () => {
  const logs = [];
  let calls = 0;
  const Clock = purgeClockClass(
    async () => {
      calls += 1;
      if (calls === 2) throw new Error("D1 down");
      return 3;
    },
    (event, data) => logs.push({ event, ...data }),
  );
  const clock = new Clock({ storage: fakeStorage() }, {});
  const before = Date.now();
  await clock.alarm();
  assert.ok(clock.state.storage.at >= before + PURGE_EVERY_MS);
  assert.deepEqual(logs, [{ event: "early_access.purge", deleted: 3 }]);
  await assert.rejects(clock.alarm(), /D1 down/);
  assert.equal(clock.state.storage.sets.length, 2, "next alarm set even though the purge threw");
});

test("armPurgeClock calls the named object once per namespace and retries after a failure", async () => {
  const Clock = purgeClockClass(async () => 0, quiet);
  const ns = fakeNamespace(Clock, {});
  ns.fail = true;
  const warn = console.warn;
  console.warn = quiet;
  try {
    await armPurgeClock({ PURGE_CLOCK: ns });
  } finally {
    console.warn = warn;
  }
  assert.equal(ns.calls, 1);
  ns.fail = false;
  await armPurgeClock({ PURGE_CLOCK: ns });
  await armPurgeClock({ PURGE_CLOCK: ns });
  assert.equal(ns.calls, 2, "a failed arm is retried, a good one is not repeated");
  assert.deepEqual([...new Set(ns.names)], [PURGE_CLOCK_NAME]);
  await armPurgeClock({}); // no binding (tests, local dev): nothing to do
});

test("withPurgeClock arms alongside the request and still answers it", async () => {
  const Clock = purgeClockClass(async () => 0, quiet);
  const env = {};
  env.PURGE_CLOCK = fakeNamespace(Clock, env);
  const waits = [];
  const handler = withPurgeClock({ fetch: async () => new Response("page") });
  const res = await handler.fetch(new Request("https://x.test/"), env, {
    waitUntil: (p) => waits.push(p),
  });
  assert.equal(await res.text(), "page");
  await Promise.all(waits);
  assert.notEqual(env.PURGE_CLOCK.state.storage.at, null);
  assert.equal(handler.scheduled, undefined, "no cron handler is left to fire");
});

test("the Worker exports the clock its wrangler config binds, and configures no cron", async () => {
  assert.match(readFileSync(join(ROOT, "wrangler.jsonc"), "utf8"), /"main": "entry.mjs"/);
  const config = readFileSync(join(ROOT, "wrangler.jsonc"), "utf8");
  assert.doesNotMatch(config, /"crons"/);
  assert.match(config, /"name": "PURGE_CLOCK", "class_name": "PurgeClock"/);
  assert.match(config, /"new_sqlite_classes": \["PurgeClock"\]/);
  assert.equal(typeof PurgeClock, "function");
  assert.equal(typeof worker.fetch, "function");
  // The exported clock purges through the site's own purgePending: an empty table deletes 0.
  const rows = [];
  const db = {
    prepare: () => ({ bind: () => ({ run: async () => ({ meta: { changes: rows.length } }) }) }),
  };
  const logs = [];
  const log = console.log;
  console.log = (line) => logs.push(line);
  try {
    await new PurgeClock({ storage: fakeStorage() }, { DB: db }).alarm();
  } finally {
    console.log = log;
  }
  // einvoice-site's purge() does not count rows, so the log says null.
  assert.ok(logs.some((l) => l.includes('"early_access.purge"') && l.includes('"deleted":null')));
});
