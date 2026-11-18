#!/usr/bin/env node
// Regenerates parity-expected.json from sudo's own parser. Needs cvtsudoers
// and visudo (the sudo package); run it where they exist:
//
//   node parity-gen.mjs
//
// Each case is written to a temporary file, checked with `visudo -c -f`,
// and converted with `cvtsudoers -e -f json` (aliases expanded). Nothing
// here edits /etc/sudoers or runs anything as another user.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CASES } from "./parity-cases.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const FILE_FIXTURES = ["fixtures/sudo-manual-example/sudoers"];

function principal(p) {
  const neg = p.negated ? "!" : "";
  if ("username" in p) return neg + p.username;
  if ("usergroup" in p) return neg + "%" + p.usergroup;
  if ("userid" in p) return neg + "#" + p.userid;
  if ("usergid" in p) return neg + "%#" + p.usergid; // what cvtsudoers 1.9 writes for %#gid
  if ("groupid" in p) return neg + "%#" + p.groupid;
  if ("netgroup" in p) return neg + "+" + p.netgroup;
  if ("nonunixgroup" in p) return neg + "%:" + p.nonunixgroup;
  if ("hostname" in p) return neg + p.hostname;
  if ("ipaddr" in p) return neg + p.ipaddr;
  if ("networkaddr" in p) return neg + p.networkaddr;
  return neg + JSON.stringify(p);
}

const OPTION_TAGS = {
  authenticate: ["PASSWD", "NOPASSWD"],
  noexec: ["NOEXEC", "EXEC"],
  setenv: ["SETENV", "NOSETENV"],
  log_input: ["LOG_INPUT", "NOLOG_INPUT"],
  log_output: ["LOG_OUTPUT", "NOLOG_OUTPUT"],
  send_mail: ["MAIL", "NOMAIL"],
  sudoedit_follow: ["FOLLOW", "NOFOLLOW"],
  intercept: ["INTERCEPT", "NOINTERCEPT"],
};

// '(:adm)' comes out as an empty runas user; read it as no user list.
function list(xs) {
  const out = (xs || []).map(principal).filter((x) => x !== "");
  return out.length ? out : null;
}

// cvtsudoers JSON -> the shape policyEntries() returns (minus file/line).
export function fromCvtsudoers(json) {
  const out = [];
  for (const spec of json.User_Specs || []) {
    const users = spec.User_List.map(principal);
    const hosts = spec.Host_List.map(principal);
    for (const cs of spec.Cmnd_Specs) {
      const tags = [];
      for (const o of cs.Options || []) {
        for (const [k, v] of Object.entries(o)) {
          if (OPTION_TAGS[k]) tags.push(v ? OPTION_TAGS[k][0] : OPTION_TAGS[k][1]);
        }
      }
      for (const c of cs.Commands) {
        out.push({
          users,
          hosts,
          runasUsers: list(cs.runasusers),
          runasGroups: list(cs.runasgroups),
          tags: [...new Set(tags)].sort(),
          negated: Boolean(c.negated),
          command: c.command,
        });
      }
    }
  }
  return out;
}

function main() {
  const dir = mkdtempSync(path.join(tmpdir(), "sudoers-parity-"));
  const results = [];
  for (const [name, text] of CASES) {
    const file = path.join(dir, "case");
    writeFileSync(file, text, { mode: 0o440 });
    try {
      execFileSync("visudo", ["-c", "-q", "-f", file], { stdio: "pipe" });
    } catch (err) {
      results.push({ name, rejected: String(err.stderr || err.stdout).trim() });
      continue;
    }
    const raw = execFileSync("cvtsudoers", ["-e", "-f", "json", file], { encoding: "utf8" });
    let json;
    try {
      json = JSON.parse(raw);
    } catch (err) {
      // cvtsudoers 1.9.15 prints option specs such as CWD= without a comma
      // between keys; such a case is kept out rather than hand-repaired.
      results.push({ name, skipped: `cvtsudoers printed JSON that does not parse (${err.message})` });
      continue;
    }
    results.push({ name, expected: fromCvtsudoers(json) });
  }
  // Whole files too. Only fixtures without include lines: cvtsudoers would
  // follow an @includedir into this machine's own /etc/sudoers.d.
  const files = [];
  for (const rel of FILE_FIXTURES) {
    const json = JSON.parse(execFileSync("cvtsudoers", ["-e", "-f", "json", path.join(here, rel)], { encoding: "utf8" }));
    files.push({ file: rel, expected: fromCvtsudoers(json) });
  }
  const version = execFileSync("cvtsudoers", ["-V"], { encoding: "utf8" }).split("\n")[0].trim();
  writeFileSync(path.join(here, "parity-expected.json"), JSON.stringify({ generator: version, results, files }, null, 1) + "\n");
  for (const r of results) if (r.rejected || r.skipped) process.stderr.write(`${r.name}: ${r.rejected || r.skipped}\n`);
  process.stdout.write(`${results.length} cases written with ${version}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
