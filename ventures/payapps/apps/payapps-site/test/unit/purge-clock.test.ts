// The daily purge's Durable Object clock (src/worker/purge-clock.ts), which replaced the cron
// trigger. Mirrors seller-books-site's and cmmc-site's test/purge-clock.test.mjs.
import { readFileSync } from "node:fs";
import {
  armPurgeClock,
  FIRST_PURGE_MS,
  PURGE_CLOCK_NAME,
  PURGE_EVERY_MS,
  purgeClockClass,
} from "@worker/purge-clock";
import { describe, expect, it, vi } from "vitest";

function fakeStorage() {
  const s = {
    at: null as number | null,
    sets: [] as number[],
    getAlarm: async () => s.at,
    setAlarm: async (t: number | Date) => {
      s.at = Number(t);
      s.sets.push(Number(t));
    },
  };
  return s;
}

const quiet = () => {};

describe("PurgeClock", () => {
  it("arms the first alarm a minute out, and only once", async () => {
    const Clock = purgeClockClass(async () => 0, quiet);
    const storage = fakeStorage();
    const clock = new Clock({ storage } as never, {});
    const before = Date.now();
    expect(await (await clock.fetch()).text()).toBe("armed");
    const first = storage.at ?? 0;
    expect(first).toBeGreaterThanOrEqual(before + FIRST_PURGE_MS);
    expect(await (await clock.fetch()).text()).toBe("already armed");
    expect(storage.at).toBe(first);
  });

  it("re-arms a day out before purging, so a failed purge keeps the chain", async () => {
    const logs: unknown[] = [];
    let calls = 0;
    const Clock = purgeClockClass(
      async () => {
        calls += 1;
        if (calls === 2) throw new Error("D1 down");
        return 3;
      },
      (event, data) => logs.push({ event, ...data }),
    );
    const storage = fakeStorage();
    const clock = new Clock({ storage } as never, {});
    const before = Date.now();
    await clock.alarm();
    expect(storage.at).toBeGreaterThanOrEqual(before + PURGE_EVERY_MS);
    expect(logs).toEqual([{ event: "early_access.purge", deleted: 3 }]);
    await expect(clock.alarm()).rejects.toThrow("D1 down");
    expect(storage.sets).toHaveLength(2);
  });

  it("armPurgeClock calls the named object once, retrying after a failure", async () => {
    const names: string[] = [];
    let calls = 0;
    let fail = true;
    const ns = {
      idFromName: (name: string) => {
        names.push(name);
        return { name };
      },
      get: () => ({
        fetch: async () => {
          calls += 1;
          if (fail) throw new Error("no such object");
          return new Response("armed");
        },
      }),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(quiet);
    await armPurgeClock({ PURGE_CLOCK: ns as never });
    warn.mockRestore();
    fail = false;
    await armPurgeClock({ PURGE_CLOCK: ns as never });
    await armPurgeClock({ PURGE_CLOCK: ns as never });
    expect(calls).toBe(2);
    expect([...new Set(names)]).toEqual([PURGE_CLOCK_NAME]);
    await armPurgeClock({});
  });

  it("is what wrangler.jsonc binds, with no cron left", () => {
    const config = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    expect(config).not.toMatch(/"crons"/);
    expect(config).toMatch(/"name": "PURGE_CLOCK", "class_name": "PurgeClock"/);
    expect(config).toMatch(/"new_sqlite_classes": \["PurgeClock"\]/);
    const entry = readFileSync(new URL("../../src/worker/index.ts", import.meta.url), "utf8");
    expect(entry).toMatch(/export const PurgeClock = purgeClockClass/);
    expect(entry).not.toMatch(/scheduled\(/);
  });
});
