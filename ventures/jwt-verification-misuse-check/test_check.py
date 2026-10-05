import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

import check

JS = """\
const jwt = require('jsonwebtoken');
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
"""

PY = """\
import jwt
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
"""

GO = """\
package main
import "github.com/golang-jwt/jwt/v5"
func f(s string) {
	t, _ := jwt.Parse(s, func(t *jwt.Token) (interface{}, error) { return []byte("secret"), nil })
	u, _, _ := new(jwt.Parser).ParseUnverified(s, jwt.MapClaims{})
	_ = jwt.SigningMethodNone
	_ = jwt.WithoutClaimsValidation()
}
"""

JAVA = """\
import com.auth0.jwt.JWT;
class Auth {
  void f(String t) {
    DecodedJWT d = JWT.decode(t);
    Algorithm a = Algorithm.HMAC256("0123456789abcdef0123456789abcdef-hardcoded");
    Algorithm n = Algorithm.none();
    Jwts.builder().signWith(SignatureAlgorithm.HS256, "secret");
  }
}
"""

FIXTURES = {"app.js": JS, "app.py": PY, "main.go": GO, "Auth.java": JAVA}


def lines_of(findings, type_):
    return [f["line"] for f in findings if f["type"] == type_]


class Js(unittest.TestCase):
    def setUp(self):
        self.f = check.scan_text(JS, "app.js")

    def test_decode_flagged(self):
        self.assertEqual(lines_of(self.f, check.DECODE_WITHOUT_VERIFY), [4])

    def test_unpinned_verify_and_callback_form(self):
        self.assertEqual(lines_of(self.f, check.ALGORITHMS_NOT_PINNED), [5, 12])

    def test_pinned_and_variable_options_not_flagged(self):
        unpinned = lines_of(self.f, check.ALGORITHMS_NOT_PINNED)
        for line in (6, 7, 10):
            self.assertNotIn(line, unpinned)

    def test_expiry_and_nbf(self):
        self.assertEqual(lines_of(self.f, check.EXPIRY_DISABLED), [6])
        self.assertEqual(lines_of(self.f, check.NOT_BEFORE_DISABLED), [6])

    def test_user_controlled_key_but_not_kid_lookup(self):
        self.assertEqual(lines_of(self.f, check.USER_CONTROLLED_KEY), [7])

    def test_weak_and_hardcoded_secrets(self):
        self.assertEqual(lines_of(self.f, check.WEAK_SECRET), [8, 14])
        self.assertEqual(lines_of(self.f, check.HARDCODED_SECRET), [9])

    def test_alg_none(self):
        self.assertEqual(lines_of(self.f, check.ALG_NONE), [11])

    def test_comment_line_ignored(self):
        self.assertNotIn(2, [x["line"] for x in self.f])

    def test_env_key_is_not_a_secret_finding(self):
        self.assertFalse([x for x in self.f if x["line"] == 5 and "secret" in x["type"]])


class Py(unittest.TestCase):
    def setUp(self):
        self.f = check.scan_text(PY, "app.py")

    def test_verify_disabled_both_spellings(self):
        self.assertEqual(lines_of(self.f, check.VERIFY_DISABLED), [3, 4])

    def test_multiline_call_secret_and_options(self):
        self.assertEqual(lines_of(self.f, check.WEAK_SECRET), [5, 13])
        self.assertEqual(lines_of(self.f, check.EXPIRY_DISABLED), [9])
        self.assertEqual(lines_of(self.f, check.NOT_BEFORE_DISABLED), [9])

    def test_unpinned_only_where_algorithms_missing_and_verify_on(self):
        self.assertEqual(lines_of(self.f, check.ALGORITHMS_NOT_PINNED), [11])

    def test_none_in_algorithms_list(self):
        self.assertEqual(lines_of(self.f, check.ALG_NONE), [12])

    def test_user_controlled_key_and_unverified_claims(self):
        self.assertEqual(lines_of(self.f, check.USER_CONTROLLED_KEY), [14])
        self.assertEqual(lines_of(self.f, check.DECODE_WITHOUT_VERIFY), [15])

    def test_requests_verify_false_is_not_jwt(self):
        self.assertNotIn(16, [x["line"] for x in self.f])

    def test_correct_call_is_clean(self):
        self.assertNotIn(17, [x["line"] for x in self.f])


class GoJava(unittest.TestCase):
    def test_go(self):
        f = check.scan_text(GO, "main.go")
        self.assertEqual(lines_of(f, check.ALGORITHMS_NOT_PINNED), [4])
        self.assertEqual(lines_of(f, check.WEAK_SECRET), [4])
        self.assertEqual(lines_of(f, check.DECODE_WITHOUT_VERIFY), [5])
        self.assertEqual(lines_of(f, check.ALG_NONE), [6])
        self.assertEqual(lines_of(f, check.EXPIRY_DISABLED), [7])

    def test_go_with_valid_methods_is_not_flagged(self):
        text = 'import "github.com/golang-jwt/jwt/v5"\nt, _ := jwt.Parse(s, kf, jwt.WithValidMethods([]string{"HS256"}))\n'
        self.assertEqual(check.scan_text(text, "a.go"), [])

    def test_java(self):
        f = check.scan_text(JAVA, "Auth.java")
        self.assertEqual(lines_of(f, check.DECODE_WITHOUT_VERIFY), [4])
        self.assertEqual(lines_of(f, check.HARDCODED_SECRET), [5])
        self.assertEqual(lines_of(f, check.ALG_NONE), [6])
        self.assertEqual(lines_of(f, check.WEAK_SECRET), [7])

    def test_go_secret_needs_jwt_context(self):
        self.assertEqual(check.scan_text('x := []byte("secret")\n', "a.go"), [])


class Misc(unittest.TestCase):
    def test_every_finding_has_the_five_fields(self):
        for name, text in FIXTURES.items():
            for f in check.scan_text(text, name):
                self.assertEqual(set(f), {"file", "line", "type", "detail", "remediation"})
                self.assertIn(f["type"], check.RISK_CLASSIFICATIONS)
                self.assertTrue(f["remediation"])

    def test_secret_value_is_never_echoed_unless_a_known_placeholder(self):
        f = check.scan_text(JS, "app.js")
        for x in f:
            self.assertNotIn("a-long-literal-key", x["detail"])

    def test_empty_and_plain_text(self):
        self.assertEqual(check.scan_text("", "a.js"), [])
        self.assertEqual(check.scan_text("hello world\n", "notes.txt"), [])

    def test_language_for(self):
        self.assertEqual(check.language_for("src/a.TS"), "js")
        self.assertEqual(check.language_for("a.py"), "py")
        self.assertEqual(check.language_for("Makefile"), "any")


class Cli(unittest.TestCase):
    def _repo(self, files):
        d = tempfile.TemporaryDirectory()
        self.addCleanup(d.cleanup)
        for name, text in files.items():
            p = Path(d.name) / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(text)
        return d.name

    def test_fail_on_risk_exit_code(self):
        root = self._repo({"app.js": JS})
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(check.main([root]), 0)
            self.assertEqual(check.main([root, "--fail-on-risk"]), 2)

    def test_clean_repo_exits_zero_even_with_flag(self):
        root = self._repo({"app.js": "const jwt = require('jsonwebtoken');\njwt.verify(t, process.env.K, { algorithms: ['HS256'] });\n"})
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(check.main([root, "--fail-on-risk"]), 0)
        self.assertIn("no findings", out.getvalue())

    def test_skips_node_modules_and_non_source(self):
        root = self._repo({"node_modules/x/a.js": JS, "notes.md": JS})
        with contextlib.redirect_stdout(io.StringIO()) as out:
            check.main([root])
        self.assertIn("No .js", out.getvalue())

    def test_json_output_uses_relative_paths(self):
        root = self._repo({"src/app.py": PY})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root, "--format", "json"])
        data = json.loads(buf.getvalue())
        self.assertTrue(data)
        self.assertEqual({f["file"] for f in data}, {"src/app.py"})

    def test_text_output_shows_location_risk_and_fix(self):
        root = self._repo({"app.py": PY})
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            check.main([root])
        out = buf.getvalue()
        self.assertIn("app.py:3  jwt-verify-disabled", out)
        self.assertIn("risk:", out)
        self.assertIn("fix:", out)


if __name__ == "__main__":
    unittest.main()
