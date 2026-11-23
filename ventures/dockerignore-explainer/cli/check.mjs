#!/usr/bin/env node
// Runs the .dockerignore explainer over a real build context.
//
//   node cli/check.mjs [context-dir] [-f Dockerfile] [--ignore file]
//                      [--json] [--strict] [--why path] [--fixed]
//
// Like BuildKit, it reads <Dockerfile>.dockerignore next to the Dockerfile
// when that file exists, else <context>/.dockerignore. No network, no deps.
// Exit codes: 0 ok, 1 a high finding with --strict, 2 bad usage or input.
import { readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { join, relative, resolve as resolvePath, basename, dirname } from "node:path";
import { analyze, why, bytes } from "../dockerignore.mjs";

export function listContext(root) {
  const files = [];
  const dirs = [];
  const walkDir = (abs) => {
    let names;
    try {
      names = readdirSync(abs);
    } catch {
      return;
    }
    if (!names.length && abs !== root) dirs.push(relative(root, abs).split("\\").join("/"));
    for (const name of names) {
      const p = join(abs, name);
      let st;
      try {
        st = lstatSync(p);
      } catch {
        continue;
      }
      const rel = relative(root, p).split("\\").join("/");
      if (st.isDirectory()) walkDir(p);
      else files.push({ path: rel, size: st.size });
    }
  };
  walkDir(root);
  return { files, dirs };
}

export function main(argv, out = process.stdout, err = process.stderr) {
  const args = { dir: ".", dockerfile: null, ignore: null, json: false, strict: false, why: null, fixed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (["-f", "--file", "--ignore", "--why"].includes(a) && (i + 1 >= argv.length || argv[i + 1] === "")) {
      err.write(`${a} needs a value\nusage: check.mjs [context-dir] [-f Dockerfile] [--ignore file] [--json] [--strict] [--why path] [--fixed]\n`);
      return 2;
    }
    if (a === "-f" || a === "--file") args.dockerfile = argv[++i];
    else if (a === "--ignore") args.ignore = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--strict") args.strict = true;
    else if (a === "--fixed") args.fixed = true;
    else if (a === "--why") args.why = argv[++i];
    else if (a === "-h" || a === "--help") {
      out.write("usage: check.mjs [context-dir] [-f Dockerfile] [--ignore file] [--json] [--strict] [--why path] [--fixed]\n");
      return 0;
    } else if (a.startsWith("-")) {
      err.write(`unknown option ${a}\n`);
      return 2;
    } else args.dir = a;
  }
  const root = resolvePath(args.dir);
  if (!existsSync(root) || !lstatSync(root).isDirectory()) {
    err.write(`not a directory: ${args.dir}\n`);
    return 2;
  }
  const dfPath = args.dockerfile ? resolvePath(args.dockerfile) : join(root, "Dockerfile");
  let ignorePath = args.ignore ? resolvePath(args.ignore) : null;
  if (!ignorePath) {
    const specific = join(dirname(dfPath), basename(dfPath) + ".dockerignore");
    ignorePath = existsSync(specific) ? specific : join(root, ".dockerignore");
  }
  if (args.ignore && !existsSync(ignorePath)) {
    err.write(`no such file: ${args.ignore}\n`);
    return 2;
  }
  const ignore = existsSync(ignorePath) ? readFileSync(ignorePath, "utf8") : "";
  const dockerfile = existsSync(dfPath) ? readFileSync(dfPath, "utf8") : "";
  const { files, dirs } = listContext(root);
  const list = [...files.map((f) => `${f.size} ${f.path}`), ...dirs.map((d) => `0 ${d}/`)];
  // Folders carry no size; give them 0 so the sized format still holds.
  const text = list.join("\n");

  if (args.why) {
    const w = why({ ignore, path: args.why, files: text });
    if (args.json) out.write(JSON.stringify(w, null, 2) + "\n");
    else if (w.error) out.write(`BuildKit refuses this .dockerignore: ${w.error}\n`);
    else for (const s of w.steps) out.write(`${s.path}: ${s.sent ? "sent" : "not sent"}${s.rule ? ` (line ${s.rule.line}: ${s.rule.text})` : ""}${s.note ? `\n  ${s.note}` : ""}\n`);
    return 0;
  }

  const r = analyze({ ignore, files: text, dockerfile });
  if (args.fixed) {
    out.write(r.fix ? r.fix.text : ignore);
    return 0;
  }
  if (args.json) {
    out.write(JSON.stringify({ ignoreFile: existsSync(ignorePath) ? relative(process.cwd(), ignorePath) : null, dockerfile: existsSync(dfPath) ? relative(process.cwd(), dfPath) : null, ...r, rows: undefined }, null, 2) + "\n");
  } else {
    const t = r.totals;
    out.write(`${existsSync(ignorePath) ? relative(process.cwd(), ignorePath) || ".dockerignore" : "(no .dockerignore)"}: ${t.rules} rules, ${t.sent}/${t.files} files sent${t.bytesSent != null ? ` (${bytes(t.bytesSent)}; ${bytes(t.bytesExcluded)} left out)` : ""}\n`);
    if (r.error) out.write(`BuildKit refuses it: ${r.error}\n`);
    for (const f of r.findings) {
      out.write(`\n[${f.severity}] ${f.title.replace(/`/g, "")}${f.line ? ` (${f.where || ".dockerignore"} line ${f.line})` : ""}\n  ${f.detail.replace(/`/g, "")}\n`);
      if (f.paths) for (const p of f.paths.slice(0, 5)) out.write(`    ${p}\n`);
      if (f.paths && f.paths.length > 5) out.write(`    ... and ${f.paths.length - 5} more\n`);
    }
    if (r.fix && !r.fix.error) out.write(`\nSuggested .dockerignore (checked: ${r.fix.fixed.length} paths fixed, ${r.fix.unfixed.length} not, ${r.fix.sideEffects.length} other paths change): run with --fixed to print it.\n`);
    if (!r.findings.length) out.write("No findings.\n");
  }
  return args.strict && r.totals.high > 0 ? 1 : 0;
}

if (process.argv[1] && resolvePath(process.argv[1]) === resolvePath(new URL(import.meta.url).pathname)) {
  process.exitCode = main(process.argv.slice(2));
}
