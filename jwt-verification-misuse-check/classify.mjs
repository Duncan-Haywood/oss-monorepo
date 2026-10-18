// Browser port of check.py's scanning logic, kept in lock-step so the verdict
// a visitor sees on this page matches the CLI exactly. Operates on pasted
// source text -- nothing here calls any network API and nothing is uploaded.
//
// The rule tables below (patterns, details, fixes) are copied verbatim from
// check.py's own tables and the scanning logic is hand-ported; the parity test
// is what keeps the two from drifting. classify.test.mjs pins this port against the same scenarios
// test_check.py uses, plus a parity test that shells out to `python3 check.py`
// and asserts identical findings on the same files.

export const DECODE_WITHOUT_VERIFY = "jwt-decode-without-verify";
export const VERIFY_DISABLED = "jwt-verify-disabled";
export const ALG_NONE = "jwt-alg-none";
export const ALGORITHMS_NOT_PINNED = "jwt-algorithms-not-pinned";
export const EXPIRY_DISABLED = "jwt-expiry-disabled";
export const NOT_BEFORE_DISABLED = "jwt-not-before-disabled";
export const HARDCODED_SECRET = "jwt-hardcoded-secret";
export const WEAK_SECRET = "jwt-weak-secret";
export const USER_CONTROLLED_KEY = "jwt-user-controlled-key";

export const RISK_CLASSIFICATIONS = new Set([
  DECODE_WITHOUT_VERIFY, VERIFY_DISABLED, ALG_NONE, ALGORITHMS_NOT_PINNED, EXPIRY_DISABLED,
  NOT_BEFORE_DISABLED, HARDCODED_SECRET, WEAK_SECRET, USER_CONTROLLED_KEY,
]);

const EXTENSIONS = {
  ".js": "js", ".jsx": "js", ".mjs": "js", ".cjs": "js", ".ts": "js", ".tsx": "js",
  ".py": "py",
  ".go": "go",
  ".java": "java", ".kt": "java",
};
const MAX_CALL_CHARS = 2000;

const LINE_RULES = [
  [
    "jwt-decode-without-verify",
    "\\bParseUnverified\\s*\\(",
    "",
    "ParseUnverified reads the token's claims without checking its signature",
    "Use jwt.Parse(tokenString, keyFunc, jwt.WithValidMethods([]string{\"RS256\"})) wherever the claims decide who the caller is; keep ParseUnverified only for claims you never trust."
  ],
  [
    "jwt-decode-without-verify",
    "\\bJWT\\.decode\\s*\\(",
    "",
    "JWT.decode reads the token's claims without checking its signature",
    "Use JWT.require(Algorithm.RSA256(publicKey, null)).build().verify(token) wherever the claims decide who the caller is; keep JWT.decode only for display of claims you never trust."
  ],
  [
    "jwt-decode-without-verify",
    "\\bget_unverified_claims\\s*\\(",
    "",
    "get_unverified_claims reads the token's claims without checking its signature",
    "Use jwt.decode(token, key, algorithms=[\"RS256\"]) wherever the claims decide who the caller is; keep get_unverified_claims only for claims you never trust."
  ],
  [
    "jwt-verify-disabled",
    "\\bverify_signature[\\\"']?\\s*[:=]\\s*(?:False|false)\\b",
    "",
    "signature verification is switched off (verify_signature False)",
    "Delete the verify_signature override. PyJWT verifies by default: jwt.decode(token, key, algorithms=[\"HS256\"]) -- never pass options={\"verify_signature\": False} on a token you act on."
  ],
  [
    "jwt-alg-none",
    "\\balg(?:orithms?)?[\\\"']?\\s*[:=]\\s*(?:\\[[^\\]]*)?[\\\"']none[\\\"']",
    "i",
    "the \"none\" algorithm is accepted, so an unsigned token passes",
    "Remove \"none\" and pin the one algorithm you issue with, e.g. algorithms: ['HS256'] (JS) or algorithms=[\"HS256\"] (Python). Never accept alg none in verification."
  ],
  [
    "jwt-alg-none",
    "\\b(?:SigningMethodNone|UnsafeAllowNoneSignatureType)\\b",
    "",
    "the Go jwt \"none\" signing method is referenced, which accepts unsigned tokens",
    "Remove SigningMethodNone / UnsafeAllowNoneSignatureType and pass jwt.WithValidMethods([]string{\"RS256\"}) to the parser."
  ],
  [
    "jwt-alg-none",
    "\\bAlgorithm\\.none\\s*\\(\\s*\\)|\\bSignatureAlgorithm\\.NONE\\b",
    "",
    "the Java \"none\" algorithm is used, so tokens are unsigned",
    "Use a real algorithm, e.g. Algorithm.RSA256(publicKey, privateKey) or SignatureAlgorithm.RS256, for both signing and verification."
  ],
  [
    "jwt-expiry-disabled",
    "\\bignoreExpiration[\\\"']?\\s*:\\s*true\\b",
    "",
    "token expiry is ignored (ignoreExpiration: true), so a stolen token works forever",
    "Delete ignoreExpiration (it defaults to false) and give tokens a short life: jwt.sign(payload, key, { expiresIn: '15m' }). Handle TokenExpiredError by refreshing."
  ],
  [
    "jwt-expiry-disabled",
    "\\bverify_exp[\\\"']?\\s*[:=]\\s*(?:False|false)\\b",
    "",
    "token expiry is not verified (verify_exp False), so a stolen token works forever",
    "Delete the verify_exp override (PyJWT checks exp by default) and issue short-lived tokens with an exp claim; catch jwt.ExpiredSignatureError and refresh."
  ],
  [
    "jwt-expiry-disabled",
    "\\bWithoutClaimsValidation\\b",
    "",
    "all claim validation, including expiry, is switched off (WithoutClaimsValidation)",
    "Remove jwt.WithoutClaimsValidation; the parser then rejects expired tokens. Add jwt.WithExpirationRequired() so a token with no exp is refused too."
  ],
  [
    "jwt-not-before-disabled",
    "\\bignoreNotBefore[\\\"']?\\s*:\\s*true\\b",
    "",
    "the not-before (nbf) claim is ignored (ignoreNotBefore: true)",
    "Delete ignoreNotBefore (it defaults to false) so tokens are rejected until their nbf time."
  ],
  [
    "jwt-not-before-disabled",
    "\\bverify_nbf[\\\"']?\\s*[:=]\\s*(?:False|false)\\b",
    "",
    "the not-before (nbf) claim is not verified (verify_nbf False)",
    "Delete the verify_nbf override (PyJWT checks nbf by default)."
  ]
].map(([type, rx, flags, detail, fix]) => [type, new RegExp(rx, flags), detail, fix]);

const SECRET_LINE_RULES = [
  [
    "\\bsecretOrKey[\\\"']?\\s*:\\s*([\\\"'`])((?:\\\\.|(?!\\1).)*)\\1",
    2,
    "secretOrKey",
    false
  ],
  [
    "\\[\\]byte\\(\\s*([\\\"`])((?:\\\\.|(?!\\1).)*)\\1\\s*\\)",
    2,
    "[]byte literal",
    true
  ],
  [
    "\\b(?:Algorithm\\.HMAC(?:256|384|512)|hmacShaKeyFor|setSigningKey)\\(\\s*\\\"((?:\\\\.|[^\\\"])*)\\\"",
    1,
    "HMAC key literal",
    true
  ],
  [
    "\\bsignWith\\(\\s*SignatureAlgorithm\\.\\w+\\s*,\\s*\\\"((?:\\\\.|[^\\\"])*)\\\"",
    1,
    "signWith key literal",
    true
  ]
].map(([rx, group, label, gated]) => [new RegExp(rx), group, label, gated]);

const WEAK_LITERALS = new Set([
  "",
  "123456",
  "12345678",
  "admin",
  "change-me",
  "changeit",
  "changeme",
  "default",
  "dev",
  "development",
  "example",
  "hs256",
  "jwt-secret",
  "jwt_secret",
  "jwtsecret",
  "key",
  "letmein",
  "my-secret",
  "mysecret",
  "passwd",
  "password",
  "qwerty",
  "secret",
  "secret-key",
  "secret_key",
  "secretkey",
  "shhhhh",
  "super-secret",
  "supersecret",
  "test",
  "testing",
  "token",
  "your-256-bit-secret",
  "your-secret",
  "yoursecret"
]);

const JS_CALLS = /\b(?:jwt|jsonwebtoken)\.(verify|sign|decode)\s*\(/g;
const PY_CALLS = /\b(?:jwt|pyjwt|PyJWT)\.(decode|encode)\s*\(/g;
const GO_CALLS = /\bjwt\.(?:Parse|ParseWithClaims)\s*\(/g;
const STRING_ARG = /^[bBuU]?(["'`])((?:\\.|(?!\1).)*)\1$/;
const KEYWORD_ARG = /^([A-Za-z_]\w*)\s*=(?!=)\s*(.*)$/;
const USER_KEY = /\b(?:req|request|ctx|event)\s*[.\[]|\bheaders?\b|\b(?:params|query|body)\b/;
const GO_METHOD_CHECK = /\.Method\b/;

const SECRET_FIX = "Load the key from the environment or a secret manager (process.env.JWT_SECRET, os.environ[\"JWT_SECRET\"], System.getenv), generate it with `openssl rand -base64 48` (at least 32 random bytes for HS256), and rotate this one -- it is in your version control history. Or move to an asymmetric pair (RS256/ES256) and keep the private key out of the repo.";
const PIN_FIX_JS = "Pin the algorithm you issue with: jwt.verify(token, key, { algorithms: ['HS256'] }) (or ['RS256'] with a public key). Without it the library trusts the token's own alg header.";
const PIN_FIX_PY = "Pin the algorithm you issue with: jwt.decode(token, key, algorithms=[\"HS256\"]) (or [\"RS256\"] with a public key). Never derive it from the token header.";
const PIN_FIX_GO = "Pass jwt.WithValidMethods([]string{\"HS256\"}) to jwt.Parse/ParseWithClaims, or check token.Method inside the keyfunc and return an error for any other method.";
const USER_KEY_FIX = "Never take the verification key from the request. Load it from your own config or key store; if you select one of several keys, look it up by the token's kid in a fixed server-side map and refuse unknown kids.";
const DECODE_JS_FIX = "Use jwt.verify(token, key, { algorithms: ['HS256'] }) wherever the claims decide who the caller is or what they may do; jwt.decode only base64-decodes and checks no signature. Keep decode only for display of claims you never trust.";
const PY_VERIFY_FALSE_FIX = "Remove verify=False. PyJWT verifies by default: jwt.decode(token, key, algorithms=[\"HS256\"]).";

export function languageFor(filename) {
  const base = filename.replace(/\\/g, "/").split("/").pop();
  const dot = base.lastIndexOf(".");
  if (dot === -1) return "any";
  return EXTENSIONS[base.slice(dot).toLowerCase()] || "any";
}

function has(lang, group) {
  return lang === "any" || lang === group;
}

function blankComments(lines, lang) {
  const prefixes = [];
  if (lang === "py" || lang === "any") prefixes.push("#");
  if (lang !== "py") prefixes.push("//", "/*", "*");
  return lines.map((line) => {
    const s = line.trim();
    return prefixes.some((p) => s.startsWith(p)) ? "" : line;
  });
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

function walkCall(text, openIndex) {
  let depth = 0;
  let quote = null;
  const args = [];
  let start = openIndex + 1;
  let i = openIndex;
  const limit = Math.min(text.length, openIndex + MAX_CALL_CHARS);
  while (i < limit) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") { i += 2; continue; }
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      if (depth === 0) {
        args.push(text.slice(start, i));
        const trimmed = args.map((a) => a.trim());
        return { args: trimmed.length === 1 && trimmed[0] === "" ? [] : trimmed, call: text.slice(openIndex, i + 1) };
      }
    } else if (ch === "," && depth === 1) {
      args.push(text.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  return { args: null, call: text.slice(openIndex, limit) };
}

function keyArg(args, group) {
  if (group === "py") {
    if (args.length > 1 && !KEYWORD_ARG.test(args[1])) return args[1];
    for (const a of args) {
      const m = KEYWORD_ARG.exec(a);
      if (m && (m[1] === "key" || m[1] === "secret")) return m[2].trim();
    }
    return null;
  }
  return args.length > 1 ? args[1] : null;
}

function finding(file, line, type, detail, remediation) {
  return { file, line, type, detail, remediation };
}

function secretFinding(literal, callName, line, file) {
  if (literal.includes("${")) return null;
  const n = [...literal].length;
  const lower = literal.toLowerCase();
  if (WEAK_LITERALS.has(lower) || n < 16) {
    let what;
    if (WEAK_LITERALS.has(lower) && literal !== "") what = `the well-known placeholder '${literal}'`;
    else if (literal === "") what = "an empty string";
    else what = `a ${n}-character literal (too short for an HMAC secret)`;
    return finding(file, line, WEAK_SECRET, `${callName} uses ${what} as the key, hard-coded in source`, SECRET_FIX);
  }
  return finding(file, line, HARDCODED_SECRET, `${callName} uses a ${n}-character string literal as the key, hard-coded in source`, SECRET_FIX);
}

function keyFindings(args, group, callName, line, file) {
  const key = keyArg(args, group);
  if (key === null) return [];
  const m = STRING_ARG.exec(key);
  if (m) {
    const f = secretFinding(m[2], callName, line, file);
    return f ? [f] : [];
  }
  if (USER_KEY.test(key) && !/\bkid\b/.test(key)) {
    return [finding(
      file, line, USER_CONTROLLED_KEY,
      `${callName} takes its key from request data (${key.slice(0, 60)}), so the caller can choose what verifies their own token`,
      USER_KEY_FIX,
    )];
  }
  return [];
}

/** Scan one source file's text. Returns finding objects in the same shape
 * check.py's --format json emits. */
export function scanText(text, filename = "<source>") {
  const lang = languageFor(filename);
  const raw = text.replace(/\r\n?/g, "\n").split("\n");
  const lines = blankComments(raw, lang);
  const cleaned = lines.join("\n");
  const mentionsJwt = /jwt/i.test(cleaned);
  const findings = [];

  lines.forEach((line, idx) => {
    const lineno = idx + 1;
    if (line.trim() === "") return;
    for (const [type, rx, detail, fix] of LINE_RULES) {
      if (rx.test(line)) findings.push(finding(filename, lineno, type, detail, fix));
    }
    for (const [rx, group, label, gated] of SECRET_LINE_RULES) {
      if (gated && !mentionsJwt) continue;
      const m = rx.exec(line);
      if (m) {
        const f = secretFinding(m[group], label, lineno, filename);
        if (f) findings.push(f);
      }
    }
  });

  if (has(lang, "js")) {
    for (const m of cleaned.matchAll(JS_CALLS)) {
      const name = "jwt." + m[1];
      const openIndex = m.index + m[0].length - 1;
      const lineno = lineAt(cleaned, m.index);
      const { args } = walkCall(cleaned, openIndex);
      if (m[1] === "decode") {
        findings.push(finding(
          filename, lineno, DECODE_WITHOUT_VERIFY,
          "jwt.decode reads the token's claims without checking its signature",
          DECODE_JS_FIX,
        ));
        continue;
      }
      if (args === null) continue;
      findings.push(...keyFindings(args, "js", name + "()", lineno, filename));
      if (m[1] === "verify") {
        const third = args.length > 2 ? args[2] : null;
        let unpinned = third === null;
        if (third !== null) {
          if (third.startsWith("{")) unpinned = !third.includes("algorithms");
          else if (/^(?:\(|function\b|async\b|\w+\s*=>)/.test(third)) unpinned = true;
        }
        if (unpinned) {
          findings.push(finding(
            filename, lineno, ALGORITHMS_NOT_PINNED,
            "jwt.verify() has no `algorithms` option, so the library trusts the token's own alg header (algorithm-confusion risk)",
            PIN_FIX_JS,
          ));
        }
      }
    }
  }

  if (has(lang, "py")) {
    for (const m of cleaned.matchAll(PY_CALLS)) {
      const name = "jwt." + m[1];
      const openIndex = m.index + m[0].length - 1;
      const lineno = lineAt(cleaned, m.index);
      const { args, call } = walkCall(cleaned, openIndex);
      if (args === null) continue;
      findings.push(...keyFindings(args, "py", name + "()", lineno, filename));
      if (m[1] === "decode") {
        let disabled = /\bverify_signature["']?\s*[:=]\s*(?:False|false)\b/.test(call);
        if (/\bverify\s*=\s*False\b/.test(call)) {
          findings.push(finding(
            filename, lineno, VERIFY_DISABLED,
            "jwt.decode(..., verify=False) switches signature verification off",
            PY_VERIFY_FALSE_FIX,
          ));
          disabled = true;
        }
        if (!disabled && !call.includes("algorithms") && !call.includes("**")) {
          findings.push(finding(
            filename, lineno, ALGORITHMS_NOT_PINNED,
            "jwt.decode() has no `algorithms` argument, so the token's own alg header can pick the algorithm (algorithm-confusion risk; PyJWT 2 raises, older code paths and python-jose do not)",
            PIN_FIX_PY,
          ));
        }
      }
    }
  }

  if (has(lang, "go")) {
    for (const m of cleaned.matchAll(GO_CALLS)) {
      if (cleaned.includes("WithValidMethods") || GO_METHOD_CHECK.test(cleaned)) break;
      findings.push(finding(
        filename, lineAt(cleaned, m.index), ALGORITHMS_NOT_PINNED,
        "jwt.Parse has no WithValidMethods option and no token.Method check in this file, so the token's own alg header picks the method",
        PIN_FIX_GO,
      ));
    }
  }

  const seen = new Set();
  const unique = [];
  for (const f of findings) {
    const key = `${f.line}\u0000${f.type}\u0000${f.detail}`;
    if (!seen.has(key)) { seen.add(key); unique.push(f); }
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  unique.sort((a, b) => a.line - b.line || cmp(a.type, b.type) || cmp(a.detail, b.detail));
  return unique;
}

/** Scan several pasted "files" at once. `files` is an array of {name, text}. */
export function scanFiles(files) {
  const findings = [];
  for (const file of files) {
    findings.push(...scanText(file.text, file.name || "<source>"));
  }
  return findings;
}

export function hasRisk(findings) {
  return findings.some((f) => RISK_CLASSIFICATIONS.has(f.type));
}

/** One-line headline for the page. */
export function summaryLine(findings) {
  if (!findings.length) return "No findings.";
  return `${findings.length} finding${findings.length === 1 ? "" : "s"} across ${new Set(findings.map((f) => f.type)).size} pattern${new Set(findings.map((f) => f.type)).size === 1 ? "" : "s"}.`;
}
