import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  scanText, scanFiles, hasRisk, summaryLine, languageFor,
  DECODE_WITHOUT_VERIFY, VERIFY_DISABLED, ALG_NONE, ALGORITHMS_NOT_PINNED, EXPIRY_DISABLED,
  NOT_BEFORE_DISABLED, HARDCODED_SECRET, WEAK_SECRET, USER_CONTROLLED_KEY,
} from "./classify.mjs";

const JS = `const jwt = require('jsonwebtoken');
// jwt.verify(token, 'secret')  <- commented out, must be ignored
function auth(req, res, next) {
  const claims = jwt.decode(req.headers.authorization);
  const a = jwt.verify(token, process.env.KEY);
  const b = jwt.verify(token, key, { algorithms: ['RS256'], ignoreExpiration: true, ignoreNotBefore: true });
  const c = jwt.verify(token, req.header('x-key'), { algorithms: ['HS256'] });
  const d = jwt.sign({ id: 1, role: 'admin' }, 'secret', { expiresIn: '1h' });
  const e = jwt.sign(payload, 'a-long-literal-key-that-is-hardcoded-in-source-0123');
  const f = jwt.verify(token, keys[header.kid], opts);
  const g = jwt.sign(payload, key, { algorithm: 'none' });
  jwt.verify(token, key, (err, decoded) => {});
}
passport.use(new JwtStrategy({ secretOrKey: 'shhhhh' }, cb));
`;

const PY = `import jwt
# jwt.decode(t, options={"verify_signature": False})
a = jwt.decode(token, options={"verify_signature": False})
b = jwt.decode(token, key, verify=False)
c = jwt.decode(
    token,
    "changeme",
    algorithms=["HS256"],
    options={"verify_exp": False, "verify_nbf": False},
)
d = jwt.decode(token, key)
e = jwt.decode(token, key, algorithms=["HS256", "none"])
f = jwt.encode(payload, "x")
g = jwt.decode(token, request.headers["X-Key"], algorithms=["HS256"])
h = jwt.get_unverified_claims(token)
requests.get(url, verify=False)
good = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
`;

const GO = `package main
import "github.com/golang-jwt/jwt/v5"
func f(s string) {
	t, _ := jwt.Parse(s, func(t *jwt.Token) (interface{}, error) { return []byte("secret"), nil })
	u, _, _ := new(jwt.Parser).ParseUnverified(s, jwt.MapClaims{})
	_ = jwt.SigningMethodNone
	_ = jwt.WithoutClaimsValidation()
}
`;

const JAVA = `import com.auth0.jwt.JWT;
class Auth {
  void f(String t) {
    DecodedJWT d = JWT.decode(t);
    Algorithm a = Algorithm.HMAC256("0123456789abcdef0123456789abcdef-hardcoded");
    Algorithm n = Algorithm.none();
    Jwts.builder().signWith(SignatureAlgorithm.HS256, "secret");
  }
}
`;

const FIXTURES = { "app.js": JS, "app.py": PY, "main.go": GO, "Auth.java": JAVA };
const lines = (findings, type) => findings.filter((f) => f.type === type).map((f) => f.line);

test("JavaScript: decode, unpinned verify, expiry, nbf, user key, secrets, alg none", () => {
  const f = scanText(JS, "app.js");
  assert.deepEqual(lines(f, DECODE_WITHOUT_VERIFY), [4]);
  assert.deepEqual(lines(f, ALGORITHMS_NOT_PINNED), [5, 12]);
  assert.deepEqual(lines(f, EXPIRY_DISABLED), [6]);
  assert.deepEqual(lines(f, NOT_BEFORE_DISABLED), [6]);
  assert.deepEqual(lines(f, USER_CONTROLLED_KEY), [7]);
  assert.deepEqual(lines(f, WEAK_SECRET), [8, 14]);
  assert.deepEqual(lines(f, HARDCODED_SECRET), [9]);
  assert.deepEqual(lines(f, ALG_NONE), [11]);
  assert.ok(!f.some((x) => x.line === 2), "a commented-out line is ignored");
});

test("Python: verify disabled both ways, multi-line call, none in list, unverified claims", () => {
  const f = scanText(PY, "app.py");
  assert.deepEqual(lines(f, VERIFY_DISABLED), [3, 4]);
  assert.deepEqual(lines(f, WEAK_SECRET), [5, 13]);
  assert.deepEqual(lines(f, EXPIRY_DISABLED), [9]);
  assert.deepEqual(lines(f, ALGORITHMS_NOT_PINNED), [11]);
  assert.deepEqual(lines(f, ALG_NONE), [12]);
  assert.deepEqual(lines(f, USER_CONTROLLED_KEY), [14]);
  assert.deepEqual(lines(f, DECODE_WITHOUT_VERIFY), [15]);
  assert.ok(!f.some((x) => x.line === 16 || x.line === 17));
});

test("Go and Java line patterns", () => {
  const go = scanText(GO, "main.go");
  assert.deepEqual(lines(go, ALGORITHMS_NOT_PINNED), [4]);
  assert.deepEqual(lines(go, ALG_NONE), [6]);
  assert.deepEqual(lines(go, EXPIRY_DISABLED), [7]);
  const java = scanText(JAVA, "Auth.java");
  assert.deepEqual(lines(java, HARDCODED_SECRET), [5]);
  assert.deepEqual(lines(java, WEAK_SECRET), [7]);
  assert.deepEqual(scanText('x := []byte("secret")\n', "a.go"), []);
});

test("secret values are never echoed unless a known placeholder", () => {
  for (const x of scanText(JS, "app.js")) assert.ok(!x.detail.includes("a-long-literal-key"));
});

test("languageFor, scanFiles, hasRisk, summaryLine", () => {
  assert.equal(languageFor("src/a.TS"), "js");
  assert.equal(languageFor("Makefile"), "any");
  const findings = scanFiles([{ name: "app.py", text: PY }]);
  assert.equal(findings[0].file, "app.py");
  assert.ok(hasRisk(findings));
  assert.match(summaryLine(findings), /^\d+ findings across \d+ patterns\.$/);
  assert.equal(summaryLine([]), "No findings.");
  assert.equal(hasRisk([]), false);
});

test("parity: classify.mjs and check.py agree on every fixture, field for field", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "jwt-parity-"));
  try {
    mkdirSync(path.join(dir, "src"), { recursive: true });
    for (const [name, text] of Object.entries(FIXTURES)) writeFileSync(path.join(dir, "src", name), text);
    const out = execFileSync(
      "python3",
      [new URL("./check.py", import.meta.url).pathname, dir, "--format", "json"],
      { encoding: "utf8" },
    );
    const py = JSON.parse(out);
    const js = Object.entries(FIXTURES)
      .map(([name, text]) => [`src/${name}`, text])
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .flatMap(([name, text]) => scanText(text, name));
    assert.ok(py.length >= 25, "expected the fixtures to produce plenty of findings");
    assert.deepEqual(js, py);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
