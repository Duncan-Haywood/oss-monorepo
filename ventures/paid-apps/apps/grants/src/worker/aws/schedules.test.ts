import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AWS_SCHEDULES, workersCronFor } from "./schedules";

const app = join(import.meta.dirname, "..", "..", "..");

describe("AWS schedules", () => {
  it("cover every Workers cron in wrangler.jsonc", () => {
    const wrangler = readFileSync(join(app, "wrangler.jsonc"), "utf8");
    const crons = JSON.parse(/"crons":\s*(\[[^\]]*\])/.exec(wrangler)?.[1] ?? "[]") as string[];
    const mapped = Object.values(AWS_SCHEDULES).map(workersCronFor).filter(Boolean);
    expect([...mapped].sort()).toEqual([...crons].sort());
  });

  it("are the ones the OpenTofu module call configures", () => {
    const tf = readFileSync(join(app, "infra/aws/main.tf"), "utf8");
    for (const [name, expr] of Object.entries(AWS_SCHEDULES)) {
      const escaped = expr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(tf, name).toMatch(new RegExp(`${name}\\s*=\\s*"${escaped}"`));
    }
  });
});
