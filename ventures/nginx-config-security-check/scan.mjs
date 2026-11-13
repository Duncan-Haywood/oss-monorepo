// nginx config security check: the engine shared by the browser page and the
// CLI (check.mjs). A static read of nginx configuration text you supply. It
// never runs nginx, never resolves DNS and makes no network calls.
//
// The checks are well-known nginx misconfigurations. Several of them were
// catalogued by Yandex's Gixy (https://github.com/yandex/gixy, MPL-2.0): the
// off-by-slash alias traversal, $uri in redirects and headers (HTTP
// splitting), add_header redefinition, SSRF through proxy_pass, Host header
// spoofing, unanchored Origin regexes and "valid_referers none". The ideas
// are borrowed with credit; no Gixy code is used. The rest come from the
// nginx module documentation at https://nginx.org/en/docs/.

// ---------------------------------------------------------------- lexer --

function isSpace(ch) {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
}

// Tokenise the way ngx_conf_read_token does, closely enough for analysis:
// unquoted words end at whitespace, ";" or "{" ("${" inside a word stays in
// the word), "#" at the start of a word begins a comment, and quotes may hold
// anything with backslash escapes.
export function tokenize(text, file = "nginx.conf") {
  const tokens = [];
  let i = 0;
  let line = 1;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === "\n") { line++; i++; continue; }
    if (isSpace(ch)) { i++; continue; }
    if (ch === "#") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (ch === ";" || ch === "{" || ch === "}") {
      tokens.push({ kind: ch, line });
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = line;
      let value = "";
      i++;
      while (i < n && text[i] !== quote) {
        if (text[i] === "\\" && i + 1 < n) {
          const next = text[i + 1];
          // nginx unescapes \" \' \\ \t \r \n; other pairs keep the backslash.
          if (next === quote || next === "\\") value += next;
          else if (next === "t") value += "\t";
          else if (next === "r") value += "\r";
          else if (next === "n") value += "\n";
          else value += "\\" + next;
          if (next === "\n") line++;
          i += 2;
          continue;
        }
        if (text[i] === "\n") line++;
        value += text[i];
        i++;
      }
      if (i >= n) throw new Error(`${file}:${start}: unterminated ${quote === '"' ? "double" : "single"} quote`);
      i++;
      tokens.push({ kind: "word", value, quoted: true, line: start });
      continue;
    }
    let value = "";
    const start = line;
    while (i < n) {
      const c = text[i];
      if (isSpace(c) || c === ";") break;
      if (c === "{" && value[value.length - 1] !== "$") break;
      if (c === "\\" && i + 1 < n) { value += c + text[i + 1]; i += 2; continue; }
      value += c;
      i++;
    }
    tokens.push({ kind: "word", value, quoted: false, line: start });
  }
  return tokens;
}

// --------------------------------------------------------------- parser --

// A directive is { name, args, line, file, block } where block is null or
// an array of directives.
export function parse(text, file = "nginx.conf") {
  const tokens = tokenize(text, file);
  let pos = 0;
  function parseBlock(depth, openLine) {
    const out = [];
    while (pos < tokens.length) {
      const t = tokens[pos];
      if (t.kind === "}") {
        if (depth === 0) throw new Error(`${file}:${t.line}: unexpected "}"`);
        pos++;
        return out;
      }
      if (t.kind === ";") { pos++; continue; }
      if (t.kind === "{") throw new Error(`${file}:${t.line}: unexpected "{" with no directive name`);
      const d = { name: t.value, args: [], line: t.line, file, block: null };
      pos++;
      for (;;) {
        const a = tokens[pos];
        if (!a) throw new Error(`${file}:${d.line}: directive "${d.name}" has no ending ";" or "{"`);
        if (a.kind === "word") { d.args.push(a.value); pos++; continue; }
        if (a.kind === ";") { pos++; break; }
        if (a.kind === "{") {
          pos++;
          d.block = parseBlock(depth + 1, a.line);
          break;
        }
        throw new Error(`${file}:${a.line}: unexpected "}" inside directive "${d.name}"`);
      }
      out.push(d);
    }
    if (depth > 0) throw new Error(`${file}:${openLine}: "{" is never closed`);
    return out;
  }
  return parseBlock(0, 0);
}

// ------------------------------------------------------------- includes --

function globToRegex(glob) {
  let re = "";
  for (const ch of glob) {
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else re += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`(?:^|/)${re}$`);
}

function normalise(name) {
  return name.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
}

// Resolve `include` against the files supplied. A pattern matches a file
// whose path ends with it (so `include conf.d/*.conf;` matches
// `/etc/nginx/conf.d/app.conf` or `conf.d/app.conf`), and an absolute
// pattern also matches by its trailing components. Matches are taken in
// name order, as nginx's glob does.
function matchInclude(pattern, names) {
  const p = normalise(pattern);
  const parts = p.split("/").filter(Boolean);
  for (let k = parts.length; k >= 1; k--) {
    const re = globToRegex(parts.slice(parts.length - k).join("/"));
    const hits = names.filter((nm) => re.test(normalise(nm)));
    if (hits.length) return hits.sort();
  }
  return [];
}

function expandIncludes(directives, parsed, names, stack, used, missing) {
  const out = [];
  for (const d of directives) {
    if (d.name === "include" && !d.block && d.args.length === 1) {
      const hits = matchInclude(d.args[0], names);
      if (!hits.length) {
        missing.push({ file: d.file, line: d.line, pattern: d.args[0] });
        continue;
      }
      for (const h of hits) {
        if (stack.includes(h)) throw new Error(`${d.file}:${d.line}: include loop through ${h}`);
        used.add(h);
        out.push(...expandIncludes(parsed.get(h), parsed, names, [...stack, h], used, missing));
      }
      continue;
    }
    if (d.block) out.push({ ...d, block: expandIncludes(d.block, parsed, names, stack, used, missing) });
    else out.push(d);
  }
  return out;
}

// ----------------------------------------------------------- helpers ---

const SEV_ORDER = { high: 0, medium: 1, low: 2 };

// Request values an attacker sets freely; $http_host is left to the
// Host-header check below, which is a smaller risk when server_name is fixed.
const CLIENT_HOST_VARS = /\$(?:\{)?(?:arg_[A-Za-z0-9_]+|http_(?!host\b)[A-Za-z0-9_]+|cookie_[A-Za-z0-9_]+|args|query_string|request_uri|uri|document_uri|request_body)\b/;
const DECODED_URI_VARS = /\$(?:\{)?(?:uri|document_uri)\b/;
const CLIENT_VARS_AT_START = /^\$(?:\{)?(?:arg_[A-Za-z0-9_]+|http_[A-Za-z0-9_]+|cookie_[A-Za-z0-9_]+|args|query_string)\b/;

function locationPath(d) {
  // [modifier?, path]
  const a = d.args;
  if (a.length === 1) {
    if (a[0].startsWith("@")) return { mod: "@", path: a[0] };
    if (/^(?:~\*?|\^~|=)./.test(a[0])) {
      const m = a[0].match(/^(~\*?|\^~|=)(.*)$/);
      return { mod: m[1], path: m[2] };
    }
    return { mod: "", path: a[0] };
  }
  return { mod: a[0], path: a[1] ?? "" };
}

// The authority part of an upstream URL. $uri, $document_uri and
// $request_uri always begin with "/", so the host ends where one starts.
function hostPart(url) {
  const m = url.match(/^[^/]*:\/\/([^/]*)/);
  const raw = m ? m[1] : (url.startsWith("$") ? url.split("/")[0] : "");
  return raw.replace(/\$(?:\{)?(?:uri|document_uri|request_uri)\b.*$/, "");
}

const BLOCK_LEVELS = new Set(["http", "server", "location", "if", "limit_except"]);

// ----------------------------------------------------------- analysis --

function analyse(directives, ctx, findings) {
  const add = (d, type, severity, detail, remediation) =>
    findings.push({ file: d.file, line: d.line, type, severity, detail, remediation });

  // inherited: state from enclosing levels for directives nginx merges
  // "from the previous level only if none is set on this level".
  function walk(list, level, inh, locInfo) {
    const own = (name) => list.filter((d) => d.name === name);

    // add_header: an add_header here drops every add_header above.
    // add_header_inherit (nginx 1.29.3+) changes that: merge appends this
    // level's headers to the inherited ones, off drops the inherited ones on
    // purpose. The mode itself inherits in the standard way.
    const ownHeaders = own("add_header");
    const ownMode = own("add_header_inherit");
    const mode = ownMode.length ? ownMode.at(-1).args[0] : inh.mode;
    let headers = inh.headers;
    if (mode === "merge") headers = [...inh.headers, ...ownHeaders];
    else if (mode === "off") headers = ownHeaders;
    else if (ownHeaders.length) {
      if (inh.headers.length) {
        const mine = new Set(ownHeaders.map((d) => (d.args[0] || "").toLowerCase()));
        const dropped = [...new Map(inh.headers
          .filter((h) => !mine.has((h.args[0] || "").toLowerCase()))
          .map((h) => [(h.args[0] || "").toLowerCase(), h])).values()];
        if (dropped.length) {
          const where = dropped.map((h) => `${h.args[0]} (${h.file}:${h.line})`).join(", ");
          add(ownHeaders[0], "add-header-drops-inherited", "medium",
            `This ${level} block sets its own add_header, so nginx stops sending the add_header lines from the enclosing level here: ${where}. Responses from this block go out without them.`,
            "On nginx 1.29.3 or later, add add_header_inherit merge; to this block or the http block. On older versions, repeat the dropped add_header lines in this block (an include file of shared headers keeps them in one place).");
        }
      }
      headers = ownHeaders;
    }

    // allow/deny: inherited as a set, evaluated in order, first match wins.
    const ownAccess = list.filter((d) => d.name === "allow" || d.name === "deny");
    for (let k = 0; k < ownAccess.length; k++) {
      const d = ownAccess[k];
      if (d.name === "allow" && d.args[0] === "all") {
        const later = ownAccess.slice(k + 1).find((x) => x.name === "deny");
        if (later) {
          add(later, "deny-after-allow-all", "medium",
            `"deny ${later.args.join(" ")}" comes after "allow all" (line ${d.line}); nginx checks the rules in order and stops at the first match, so this deny never applies.`,
            "Put the deny lines first and end with allow all, or drop allow all and end with deny all.");
        }
        break;
      }
    }
    const access = ownAccess.length > 0 || own("auth_basic").some((d) => d.args[0] !== "off") || own("auth_request").some((d) => d.args[0] !== "off") || inh.access;
    const localOnly = inh.localOnly || (level === "server" && own("listen").length > 0 && own("listen").every((d) => /^(?:127\.|\[::1\]|localhost|unix:)/.test(d.args[0] || "")));

    const sslVerify = own("proxy_ssl_verify").length ? own("proxy_ssl_verify").at(-1).args[0] === "on" : inh.sslVerify;

    const allowOrigin = ownHeaders.find((d) => /^access-control-allow-origin$/i.test(d.args[0] || ""));
    if (allowOrigin && /\$(?:\{)?http_origin\b/.test(allowOrigin.args[1] || "")) {
      const creds = headers.find((d) => /^access-control-allow-credentials$/i.test(d.args[0] || "") && /^true$/i.test(d.args[1] || ""));
      const guarded = inh.originChecked;
      if (!guarded) {
        add(allowOrigin, "cors-reflects-any-origin", creds ? "high" : "medium",
          `Access-Control-Allow-Origin is set to $http_origin with no check of the origin around it, so any website gets a CORS grant${creds ? ", and with Access-Control-Allow-Credentials true it can read logged-in users' responses" : ""}.`,
          "Allow-list origins with a map ($http_origin to the allowed value, empty otherwise) using an anchored regex such as ^https://(app|www)\\.example\\.com$, and send the map's variable.");
      }
    }

    for (const d of list) {
      const a = d.args;
      switch (d.name) {
        case "autoindex":
          if (a[0] === "on") add(d, "autoindex-on", "medium",
            "Directory listing is on: anyone can browse the names of every file under this root, including backups and files never linked.",
            "Set autoindex off (the default) unless the listing is meant to be public, and keep private files out of the web root.");
          break;
        case "server_tokens":
          if (a[0] === "on" || a[0] === "build") add(d, "server-tokens-on", "low",
            `server_tokens ${a[0]} puts the exact nginx version in the Server header and on error pages, which tells a scanner which published vulnerabilities to try.`,
            "Set server_tokens off in the http block.");
          break;
        case "ssl_protocols": {
          const bad = a.filter((p) => /^(?:SSLv2|SSLv3)$/.test(p));
          const old = a.filter((p) => /^(?:TLSv1|TLSv1\.1)$/.test(p));
          if (bad.length) add(d, "ssl-protocol-broken", "high",
            `${bad.join(" and ")} ${bad.length > 1 ? "are" : "is"} enabled. SSLv3 is broken by POODLE (CVE-2014-3566) and RFC 7568 prohibits it; SSLv2 is prohibited by RFC 6176.`,
            "Use ssl_protocols TLSv1.2 TLSv1.3; (nginx's default since 1.23.4).");
          if (old.length) add(d, "ssl-protocol-deprecated", "medium",
            `${old.join(" and ")} ${old.length > 1 ? "are" : "is"} enabled. RFC 8996 deprecates TLS 1.0 and 1.1, and current browsers refuse them.`,
            "Use ssl_protocols TLSv1.2 TLSv1.3; unless you have measured clients that still need the old versions.");
          break;
        }
        case "ssl_ciphers": {
          const spec = a.join(":");
          const weak = spec.split(/[:\s,]+/).filter((c) => c && !/^[!\-+]/.test(c) && /(?:^|[-_+])(?:RC4|DES|3DES|EXPORT|EXP|NULL|MD5|aNULL|eNULL|ADH|AECDH)(?:$|[-_+])/i.test(c));
          if (weak.length) add(d, "ssl-cipher-weak", "medium",
            `ssl_ciphers enables ${weak.join(", ")}: RC4, DES/3DES, export-grade, NULL and anonymous suites are broken or give no authentication.`,
            "Remove them, or start from a current published profile such as Mozilla's \"intermediate\" configuration.");
          break;
        }
        case "alias": {
          if (level !== "location" || !locInfo) break;
          const { mod, path } = locInfo;
          if (mod === "" || mod === "^~") {
            if (!path.endsWith("/") && (a[0] || "").endsWith("/")) add(d, "alias-path-traversal", "high",
              `location ${path} has no trailing slash but alias ${a[0]} has one, so a request for ${path}../ maps to the directory above the alias (the "off-by-slash" traversal): ${path}../secret reads ${a[0]}../secret.`,
              `Make the two match: location ${path}/ with alias ${a[0]}, or drop the slash from both.`);
          }
          break;
        }
        case "return": {
          const code = /^\d{3}$/.test(a[0] || "") ? Number(a[0]) : null;
          const target = code === null ? a[0] : a[1];
          if (target && (code === null || (code >= 300 && code < 400)) && DECODED_URI_VARS.test(target)) add(d, "crlf-injection-uri", "high",
            `return uses $uri or $document_uri, which hold the decoded path: a request containing %0d%0a puts a raw line break into the Location header, letting an attacker add their own headers (HTTP response splitting).`,
            "Use $request_uri, which keeps the client's encoding, e.g. return 301 https://$host$request_uri;");
          if (target && (code === null || (code >= 300 && code < 400)) && (CLIENT_VARS_AT_START.test(target) || /^[a-z]+:\/\/\$(?:\{)?(?:arg_|http_|cookie_)/i.test(target))) add(d, "open-redirect", "medium",
            "The redirect target's host comes from the request (a query argument, header or cookie), so anyone can craft a link on your domain that sends visitors to a site of their choosing.",
            "Redirect to a fixed host, or map the value to an allow-list of destinations.");
          break;
        }
        case "rewrite": {
          const repl = a[1] || "";
          if (DECODED_URI_VARS.test(repl) && (/^https?:\/\//.test(repl) || a[2] === "redirect" || a[2] === "permanent")) add(d, "crlf-injection-uri", "high",
            "The rewrite's redirect target uses $uri or $document_uri, which hold the decoded path: %0d%0a in a request becomes a raw line break in the Location header (HTTP response splitting).",
            "Use $request_uri, or a capture from the rewrite's own regex.");
          break;
        }
        case "add_header":
          if (DECODED_URI_VARS.test(a[1] || "")) add(d, "crlf-injection-uri", "high",
            `add_header ${a[0]} uses $uri or $document_uri, which hold the decoded path, so %0d%0a in a request injects new response headers.`,
            "Use $request_uri, or a value that does not come from the path.");
          break;
        case "proxy_set_header":
          if (/^host$/i.test(a[0] || "") && /^\$(?:\{)?http_host\b/.test(a[1] || "")) add(d, "host-header-spoofing", "low",
            "proxy_set_header Host $http_host passes the client's Host header through unchecked (it may be missing or name another site), so the upstream builds links, password-reset URLs or cache keys from it.",
            "Use $host, which nginx sets from the request line, the Host header or the matched server_name, and give the server a fixed server_name with a default_server that rejects unknown hosts.");
          if (DECODED_URI_VARS.test(a[1] || "")) add(d, "crlf-injection-uri", "high",
            `proxy_set_header ${a[0]} uses $uri or $document_uri, which hold the decoded path, so %0d%0a in a request injects headers into the request sent upstream.`,
            "Use $request_uri.");
          break;
        case "proxy_pass":
        case "fastcgi_pass":
        case "uwsgi_pass":
        case "scgi_pass":
        case "grpc_pass": {
          const url = a[0] || "";
          const host = hostPart(url);
          if (CLIENT_HOST_VARS.test(host)) add(d, "ssrf-upstream-from-request", "high",
            `${d.name} takes its upstream host from the request (${host}), so a client can make nginx connect to any address it can reach, including internal services and cloud metadata endpoints (server-side request forgery).`,
            "Proxy to a fixed upstream, or map the request value to an allow-list of named upstreams.");
          else if (/\$(?:\{)?(?:host|http_host)\b/.test(host)) add(d, "ssrf-upstream-from-host", "medium",
            `${d.name} takes its upstream host from the Host header (${host}); in a server that answers any name, a client chooses where nginx connects.`,
            "Proxy to a fixed upstream name, or make sure this server only answers an explicit server_name and a default_server rejects the rest.");
          if (d.name === "proxy_pass" && DECODED_URI_VARS.test(url.slice(url.indexOf(host) + host.length))) add(d, "crlf-injection-uri", "high",
            "proxy_pass builds its path from $uri or $document_uri, the decoded path, so %0d%0a in a request splits the request sent upstream into two.",
            "Use $request_uri, or proxy_pass with no URI part so nginx passes the original request URI.");
          if (d.name === "proxy_pass" && /^https:\/\//i.test(url) && !sslVerify) {
            const h = host.replace(/:\d+$/, "");
            if (!/^(?:127\.|localhost$|\[::1\]$|unix:)/.test(h)) add(d, "upstream-tls-unverified", "low",
              `proxy_pass to ${url} with proxy_ssl_verify off (nginx's default): nginx encrypts the connection but accepts any certificate, so anyone on the path to ${h} can impersonate it.`,
              "Add proxy_ssl_verify on; proxy_ssl_trusted_certificate <CA bundle>; and proxy_ssl_server_name on; (plus proxy_ssl_name if the name differs).");
          }
          break;
        }
        case "valid_referers":
          if (a.includes("none")) add(d, "valid-referers-none", "low",
            "valid_referers none accepts requests with no Referer header at all, which is what a hotlinker or script sends by simply omitting it.",
            "Drop none unless direct visits must pass, and do not use $invalid_referer as an access control for anything private.");
          break;
        case "client_max_body_size":
          if (a[0] === "0") add(d, "unbounded-request-body", "low",
            "client_max_body_size 0 turns off the request body limit, so one client can send an upload of any size to fill the disk or tie up the upstream.",
            "Set the largest size the application really accepts, e.g. client_max_body_size 25m;");
          break;
        case "stub_status":
          if (!access && !localOnly) add(d, "status-page-public", "medium",
            "stub_status is served with no allow/deny or authentication on this location or above it, so anyone can read the server's connection and request counters.",
            "Add allow 127.0.0.1; deny all; (or your monitoring network) in this location.");
          break;
        case "if": {
          const cond = a.join(" ");
          const m = cond.match(/^\(?\s*\$(?:\{)?http_(origin|referer)\}?\s+(~\*?)\s+(.+?)\s*\)?$/);
          if (m) {
            const re = m[3].replace(/^["']|["']$/g, "");
            const problems = [];
            if (!re.startsWith("^")) problems.push("it has no ^ at the start, so https://attacker.example/?https://example.com matches");
            if (!re.endsWith("$")) problems.push("it has no $ at the end, so https://example.com.attacker.example matches");
            if (/[A-Za-z0-9]\.[A-Za-z0-9]/.test(re.replace(/\\\./g, ""))) problems.push("an unescaped . matches any character, so exampleXcom matches example.com");
            if (problems.length) add(d, "origin-regex-unanchored", "medium",
              `The $http_${m[1]} check is a regex that lets other sites through: ${problems.join("; ")}.`,
              "Anchor and escape it: ~ ^https://(www\\.)?example\\.com$");
          }
          break;
        }
      }
    }

    for (const d of list) {
      if (!d.block) continue;
      if (d.name === "server" || d.name === "location" || d.name === "if" || d.name === "limit_except" || d.name === "http") {
        const childLevel = d.name;
        const originChecked = inh.originChecked || (d.name === "if" && /\$(?:\{)?http_origin\b/.test(d.args.join(" ")));
        walk(d.block, childLevel, {
          headers, mode, access, localOnly: childLevel === "server" ? false : localOnly, sslVerify, originChecked,
        }, d.name === "location" ? locationPath(d) : (d.name === "if" ? locInfo : null));
      } else if (d.name === "map" || d.name === "types" || d.name === "upstream" || d.name === "geo" || d.name === "split_clients" || d.name === "events") {
        // data blocks, not directive contexts
      } else {
        walk(d.block, d.name, { headers: [], mode: "on", access: false, localOnly: false, sslVerify: false, originChecked: false }, null);
      }
    }
  }
  walk(directives, ctx, { headers: [], mode: "on", access: false, localOnly: false, sslVerify: false, originChecked: false }, null);
}

// Which context the top of a pasted file is: a whole nginx.conf (main),
// a sites-available file of server blocks (http) or a snippet of
// location blocks (server).
function guessContext(directives) {
  const names = new Set(directives.map((d) => d.name));
  if (names.has("http") || names.has("events") || names.has("worker_processes")) return "main";
  if (names.has("server") || names.has("upstream") || names.has("map")) return "http";
  if (names.has("location") || names.has("listen") || names.has("server_name")) return "server";
  return "http";
}

// files: [{ name, text }]. Returns { findings, notes }.
export function scanFiles(files) {
  const names = files.map((f) => f.name);
  const parsed = new Map();
  for (const f of files) parsed.set(f.name, parse(f.text, f.name));
  const used = new Set();
  const missing = [];
  const roots = [];
  // Expand every file once to learn which ones are included by others.
  for (const f of files) expandIncludes(parsed.get(f.name), parsed, names, [f.name], used, []);
  for (const f of files) {
    if (used.has(f.name)) continue;
    roots.push({ name: f.name, tree: expandIncludes(parsed.get(f.name), parsed, names, [f.name], new Set(), missing) });
  }
  const findings = [];
  for (const r of roots) {
    analyse(r.tree, guessContext(r.tree), findings);
  }
  // A directive reached twice (a file included from two server blocks)
  // reports once.
  const seen = new Set();
  const unique = findings.filter((f) => {
    const k = `${f.file}\0${f.line}\0${f.type}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((x, y) => SEV_ORDER[x.severity] - SEV_ORDER[y.severity] || x.file.localeCompare(y.file) || x.line - y.line);
  const notes = missing.map((m) => `${m.file}:${m.line}: include ${m.pattern} matched none of the files given, so its contents were not checked.`);
  return { findings: unique, notes };
}

export function hasRisk(findings) {
  return findings.some((f) => f.severity === "high" || f.severity === "medium");
}

export function summaryLine(findings) {
  if (!findings.length) return "None of the patterns this tool checks for were found.";
  const count = (s) => findings.filter((f) => f.severity === s).length;
  const parts = ["high", "medium", "low"].filter((s) => count(s)).map((s) => `${count(s)} ${s}`);
  return `${findings.length} finding${findings.length === 1 ? "" : "s"}: ${parts.join(", ")}.`;
}

export const TYPES = [
  "alias-path-traversal", "crlf-injection-uri", "ssrf-upstream-from-request", "cors-reflects-any-origin",
  "ssl-protocol-broken", "add-header-drops-inherited", "deny-after-allow-all", "autoindex-on",
  "open-redirect", "origin-regex-unanchored", "ssl-protocol-deprecated", "ssl-cipher-weak",
  "ssrf-upstream-from-host", "status-page-public", "server-tokens-on", "host-header-spoofing",
  "upstream-tls-unverified", "valid-referers-none", "unbounded-request-body",
];
