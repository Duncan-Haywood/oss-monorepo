// Reads the context paths a Dockerfile uses: COPY and ADD sources, and
// RUN --mount=type=bind sources, each with its line number. Follows the
// Dockerfile reference for what matters here: parser directives (# escape=),
// line continuations, comment lines, heredocs (skipped), JSON and shell form,
// and flags. Sources from another stage or image (--from=), URLs and git
// sources are not from the context and are left out; a source with a
// variable is returned with `variable: true` because it cannot be resolved
// from the text alone.

function logicalLines(text) {
  const raw = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  let escape = "\\";
  // Parser directives: leading "# key=value" lines before anything else.
  for (const line of raw) {
    const m = line.match(/^\s*#\s*([a-zA-Z]+)\s*=\s*(\S+)\s*$/);
    if (!m) break;
    if (m[1].toLowerCase() === "escape" && (m[2] === "`" || m[2] === "\\")) escape = m[2];
  }
  const out = [];
  let buf = null;
  let start = 0;
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (buf === null && /^\s*$/.test(line)) continue;
    if (/^\s*#/.test(line)) continue; // comments, also inside a continuation
    const trimmed = line.replace(/\s+$/, "");
    if (buf === null) start = i + 1;
    const cont = trimmed.endsWith(escape);
    const piece = cont ? trimmed.slice(0, -1) : line;
    buf = buf === null ? piece : buf + piece;
    if (!cont) {
      out.push({ line: start, text: buf, next: i + 1 });
      // Heredoc bodies (RUN/COPY <<EOF ... EOF) are content, not instructions.
      if (/^\s*(RUN|COPY|ADD)\b/i.test(buf)) {
        for (const h of buf.matchAll(/<<(-?)(["']?)([A-Za-z_][A-Za-z0-9_]*)\2/g)) {
          while (i + 1 < raw.length) {
            i++;
            const body = h[1] ? raw[i].replace(/^\t+/, "") : raw[i];
            if (body.replace(/\r$/, "") === h[3]) break;
          }
        }
      }
      buf = null;
    }
  }
  if (buf !== null) out.push({ line: start, text: buf, next: raw.length });
  return { lines: out, raw };
}

function splitFlags(rest) {
  const flags = {};
  let s = rest.trimStart();
  for (;;) {
    const m = s.match(/^--([a-zA-Z-]+)(?:=(\S*))?\s+/);
    if (!m) break;
    flags[m[1].toLowerCase()] = m[2] ?? true;
    s = s.slice(m[0].length);
  }
  return { flags, args: s.trim() };
}

function argList(args) {
  if (args.startsWith("[")) {
    try {
      const a = JSON.parse(args);
      if (Array.isArray(a) && a.every((x) => typeof x === "string")) return a;
    } catch {
      /* falls through to shell form */
    }
  }
  return args.split(/\s+/).filter(Boolean);
}

const NOT_CONTEXT = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^git@/.test(s);

export function normaliseSource(src) {
  let s = src.replace(/^\/+/, "");
  const parts = [];
  for (const p of s.split("/")) {
    if (p === "" || p === ".") continue;
    if (p === "..") parts.pop();
    else parts.push(p);
  }
  s = parts.join("/");
  return s === "" ? "." : s;
}

// Returns { uses: [{ line, instruction, source, path, glob, variable }],
// stages, skipped: [{ line, instruction, source, why }] }.
export function contextUses(text) {
  const { lines } = logicalLines(text);
  const uses = [];
  const skipped = [];
  const stages = [];
  for (const l of lines) {
    const m = l.text.match(/^\s*([A-Za-z]+)(\s+([\s\S]*))?$/);
    if (!m) continue;
    const ins = m[1].toUpperCase();
    const rest = m[3] || "";
    if (ins === "FROM") {
      const fm = rest.match(/\s+AS\s+(\S+)\s*$/i);
      if (fm) stages.push(fm[1].toLowerCase());
      continue;
    }
    if (ins === "COPY" || ins === "ADD") {
      const { flags, args } = splitFlags(rest);
      if (/<<-?["']?[A-Za-z_]/.test(args)) {
        // Heredoc sources come from the Dockerfile itself.
        const list = argList(args).filter((a) => !/^<<-?/.test(a));
        if (list.length < 2) continue;
      }
      if (flags.from) {
        skipped.push({ line: l.line, instruction: ins, source: argList(args).slice(0, -1).join(" "), why: `--from=${flags.from} reads another stage or image, not the context` });
        continue;
      }
      const list = argList(args).filter((a) => !/^<<-?/.test(a));
      if (list.length < 2) continue;
      for (const src of list.slice(0, -1)) {
        if (ins === "ADD" && NOT_CONTEXT(src)) {
          skipped.push({ line: l.line, instruction: ins, source: src, why: "a URL or git source, not the context" });
          continue;
        }
        const variable = /\$/.test(src);
        uses.push({ line: l.line, instruction: ins, source: src, path: normaliseSource(src), glob: /[*?[]/.test(src), variable, parents: !!flags.parents });
      }
      continue;
    }
    if (ins === "RUN") {
      for (const mm of rest.matchAll(/--mount=(\S+)/g)) {
        const kv = Object.fromEntries(mm[1].split(",").map((p) => {
          const i = p.indexOf("=");
          return i < 0 ? [p.toLowerCase(), "true"] : [p.slice(0, i).toLowerCase(), p.slice(i + 1)];
        }));
        const type = kv.type || "bind";
        if (type !== "bind" || kv.from) continue;
        const src = kv.source || kv.src || ".";
        uses.push({ line: l.line, instruction: "RUN --mount", source: src, path: normaliseSource(src), glob: false, variable: /\$/.test(src), parents: false });
      }
    }
  }
  return { uses, stages, skipped };
}
