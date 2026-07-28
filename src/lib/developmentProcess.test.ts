import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  DEFINITION_OF_DONE,
  GATES,
  GOALS,
  PRINCIPLES,
  PRIORITIES,
  PRIORITY_MEANING,
  STAGES,
  WORKSTREAMS,
} from "@/lib/developmentProcess";

/**
 * A process document is only worth having if it stays true. These are the
 * cheap structural truths — every claim traceable, nothing orphaned, no
 * duplicate ids — so that the document fails the build rather than quietly
 * describing a process nobody follows.
 */

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("development process document", () => {
  it("gives everything a unique id", () => {
    for (const list of [GOALS, PRINCIPLES, STAGES, GATES, DEFINITION_OF_DONE, WORKSTREAMS]) {
      expect(new Set(ids(list)).size).toBe(list.length);
    }
  });

  it("states a signal for every goal", () => {
    for (const g of GOALS) {
      expect(g.statement.length).toBeGreaterThan(0);
      // A goal you cannot observe is a slogan.
      expect(g.signal.length).toBeGreaterThan(0);
    }
  });

  it("gives every principle a reason, not just a rule", () => {
    for (const p of PRINCIPLES) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.why.length).toBeGreaterThan(20);
    }
  });

  it("gives every stage at least one exit condition", () => {
    for (const s of STAGES) {
      expect(s.exit.length).toBeGreaterThan(0);
      for (const e of s.exit) expect(e.length).toBeGreaterThan(0);
    }
  });

  it("gives every gate a runnable command and something it catches", () => {
    for (const g of GATES) {
      expect(g.command.length).toBeGreaterThan(0);
      expect(g.catches.length).toBeGreaterThan(0);
    }
  });

  it("keeps at least one blocking gate", () => {
    // A process where nothing blocks is a process with no gates.
    expect(GATES.some((g) => g.blocking)).toBe(true);
  });

  it("names an npm script for every non-database gate", () => {
    const scripted = GATES.filter((g) => g.command.startsWith("npm"));
    expect(scripted.length).toBeGreaterThanOrEqual(4);
    for (const g of scripted) {
      expect(g.command).toMatch(/^npm (run )?[a-z:-]+$/);
    }
  });

  /**
   * A gate naming a script that does not exist is worse than no gate: it reads
   * as enforcement and fails with "missing script" if anyone ever runs it.
   */
  it("only names npm scripts that actually exist", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    for (const g of GATES.filter((x) => x.command.startsWith("npm"))) {
      const script = g.command.replace(/^npm (run )?/, "");
      expect(Object.keys(pkg.scripts)).toContain(script);
    }
  });

  it("ties every done-check to a goal or principle that exists", () => {
    const known = new Set([...ids(GOALS), ...ids(PRINCIPLES)]);
    for (const d of DEFINITION_OF_DONE) {
      expect(known.has(d.defends)).toBe(true);
    }
  });

  it("ties every workstream to a real goal and a real priority", () => {
    const goalIds = new Set(ids(GOALS));
    for (const w of WORKSTREAMS) {
      expect(goalIds.has(w.goal)).toBe(true);
      expect(PRIORITIES).toContain(w.priority);
      expect(w.note.length).toBeGreaterThan(0);
    }
  });

  it("explains what every priority level commits you to", () => {
    for (const p of PRIORITIES) {
      expect(PRIORITY_MEANING[p]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /**
   * The document exists to steer work. If nothing is P0 or P1 and nothing is
   * in progress, it has stopped describing a project and become an archive —
   * which is the point at which people stop reading it.
   */
  it("still describes live work", () => {
    expect(WORKSTREAMS.some((w) => w.status === "in-progress" || w.status === "next")).toBe(true);
  });

  it("covers every goal with at least one workstream", () => {
    const covered = new Set(WORKSTREAMS.map((w) => w.goal));
    for (const g of GOALS) expect(covered.has(g.id)).toBe(true);
  });
});
