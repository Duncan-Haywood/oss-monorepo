import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize, parse, scanFiles, hasRisk, summaryLine, TYPES } from "./scan.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

const one = (text, name = "site.conf") => scanFiles([{ name, text }]).findings;
const types = (text) => one(text).map((f) => f.type);
const srv = (body) => `server {\n  listen 80;\n${body}\n}\n`;

test("lexer: quotes, escapes, comments, ${var} and line numbers", () => {
  const t = tokenize('a "b c" \'d;e\' f#g # comment\nh ${x}y;');
  assert.deepEqual(t.filter((x) => x.kind === "word").map((x) => x.value), ["a", "b c", "d;e", "f#g", "h", "${x}y"]);
  assert.equal(t.find((x) => x.value === "h").line, 2);
  assert.throws(() => tokenize('a "b'), /unterminated double quote/);
});

test("parser: nested blocks and unbalanced braces", () => {
  const tree = parse("http {\n server {\n  location / { return 200; }\n }\n}\n");
  assert.equal(tree[0].block[0].block[0].name, "location");
  assert.equal(tree[0].block[0].block[0].line, 3);
  assert.throws(() => parse("server {\n listen 80;\n"), /never closed/);
  assert.throws(() => parse("listen 80;\n}"), /unexpected "\}"/);
  assert.throws(() => parse("listen 80"), /no ending/);
});

test("alias off-by-slash, and its fixed forms", () => {
  assert.deepEqual(types(srv("location /img { alias /data/img/; }")), ["alias-path-traversal"]);
  assert.deepEqual(types(srv("location ^~ /img { alias /data/img/; }")), ["alias-path-traversal"]);
  assert.deepEqual(types(srv("location /img/ { alias /data/img/; }")), []);
  assert.deepEqual(types(srv("location /img { alias /data/img; }")), []);
  assert.deepEqual(types(srv("location ~ ^/img/(.*)$ { alias /data/img/$1; }")), []);
});

test("$uri in redirects and headers is CRLF injection; $request_uri is not", () => {
  assert.deepEqual(types(srv("location / { return 301 https://$host$uri; }")), ["crlf-injection-uri"]);
  assert.deepEqual(types(srv("location / { return https://$host$document_uri; }")), ["crlf-injection-uri"]);
  assert.deepEqual(types(srv("location / { return 301 https://$host$request_uri; }")), []);
  assert.deepEqual(types(srv("location / { return 200 \"$uri\"; }")), []);
  assert.deepEqual(types(srv("rewrite ^/old(.*)$ https://example.com$uri permanent;")), ["crlf-injection-uri"]);
  assert.deepEqual(types(srv("rewrite ^/old(.*)$ /new$1 last;")), []);
  assert.deepEqual(types(srv("location / { add_header X-Path $uri; }")), ["crlf-injection-uri"]);
  assert.deepEqual(types(srv("location / { proxy_set_header X-Path $uri; proxy_pass http://up; }")), ["crlf-injection-uri"]);
  assert.deepEqual(types(srv("location / { proxy_pass http://up$uri; }")), ["crlf-injection-uri"]);
  assert.deepEqual(types(srv("location / { proxy_pass http://up$request_uri; }")), []);
});

test("SSRF: upstream host from the request", () => {
  assert.deepEqual(types(srv("location / { proxy_pass http://$arg_host; }")), ["ssrf-upstream-from-request"]);
  assert.deepEqual(types(srv("location / { proxy_pass http://$http_x_backend:8080/; }")), ["ssrf-upstream-from-request"]);
  assert.deepEqual(types(srv("location / { proxy_pass $scheme://$cookie_node; }")), ["ssrf-upstream-from-request"]);
  assert.deepEqual(types(srv("location / { proxy_pass http://$host; }")), ["ssrf-upstream-from-host"]);
  assert.deepEqual(types(srv("location / { proxy_pass http://$http_host; }")), ["ssrf-upstream-from-host"]);
  assert.deepEqual(types(srv("location / { proxy_pass http://backend/$arg_page; }")), []);
  assert.deepEqual(types(srv("location / { proxy_pass http://$upstream_name; }")), []);
  assert.deepEqual(types(srv("location ~ \\.php$ { fastcgi_pass unix:/run/php/php-fpm.sock; }")), []);
});

test("CORS reflecting $http_origin, guarded or not", () => {
  const bare = one(srv("location / { add_header Access-Control-Allow-Origin $http_origin; }"));
  assert.equal(bare[0].type, "cors-reflects-any-origin");
  assert.equal(bare[0].severity, "medium");
  const creds = one(srv("location / { add_header Access-Control-Allow-Origin $http_origin; add_header Access-Control-Allow-Credentials true; }"));
  assert.equal(creds[0].severity, "high");
  assert.deepEqual(types(srv("location / { if ($http_origin ~ ^https://app\\.example\\.com$) { add_header Access-Control-Allow-Origin $http_origin; } }")), []);
  assert.deepEqual(types(srv("location / { add_header Access-Control-Allow-Origin $cors_origin; }")), []);
});

test("Origin and Referer regexes: anchors and dots", () => {
  const f = one(srv("location / { if ($http_origin ~* \"example.com\") { set $ok 1; } }"));
  assert.equal(f[0].type, "origin-regex-unanchored");
  assert.match(f[0].detail, /no \^/);
  assert.match(f[0].detail, /no \$/);
  assert.match(f[0].detail, /unescaped \./);
  assert.deepEqual(types(srv("location / { if ($http_origin ~* ^https://(www\\.)?example\\.com$) { set $ok 1; } }")), []);
  assert.deepEqual(types(srv("location / { if ($http_referer ~ \"^https://example\\.com/\") { set $ok 1; } }")).length, 1);
});

test("add_header in a nested block drops the enclosing ones, unless redefined or merged", () => {
  const conf = "http {\n add_header X-Frame-Options DENY;\n add_header X-Content-Type-Options nosniff;\n server {\n  location / { add_header Cache-Control no-store; }\n }\n}\n";
  const f = scanFiles([{ name: "nginx.conf", text: conf }]).findings;
  assert.deepEqual(f.map((x) => x.type), ["add-header-drops-inherited"]);
  assert.equal(f[0].line, 5);
  assert.match(f[0].detail, /X-Frame-Options \(nginx\.conf:2\), X-Content-Type-Options \(nginx\.conf:3\)/);
  const repeated = conf.replace("add_header Cache-Control no-store;", "add_header Cache-Control no-store; add_header X-Frame-Options DENY; add_header X-Content-Type-Options nosniff;");
  assert.deepEqual(scanFiles([{ name: "nginx.conf", text: repeated }]).findings, []);
  const merged = conf.replace("http {\n", "http {\n add_header_inherit merge;\n");
  assert.deepEqual(scanFiles([{ name: "nginx.conf", text: merged }]).findings, []);
  const off = conf.replace("location / {", "location / { add_header_inherit off;");
  assert.deepEqual(scanFiles([{ name: "nginx.conf", text: off }]).findings, []);
  // A level with no add_header keeps inheriting: nothing to report.
  assert.deepEqual(scanFiles([{ name: "nginx.conf", text: conf.replace("add_header Cache-Control no-store;", "root /srv;") }]).findings, []);
});

test("allow all before deny; stub_status exposure", () => {
  assert.deepEqual(types(srv("location / { allow all; deny 10.0.0.1; }")), ["deny-after-allow-all"]);
  assert.deepEqual(types(srv("location / { deny 10.0.0.1; allow all; }")), []);
  assert.deepEqual(types(srv("location /s { stub_status; }")), ["status-page-public"]);
  assert.deepEqual(types(srv("location /s { stub_status; allow 127.0.0.1; deny all; }")), []);
  assert.deepEqual(types(srv("allow 10.0.0.0/8; deny all; location /s { stub_status; }")), []);
  assert.deepEqual(types(srv("location /s { stub_status; auth_basic \"status\"; }")), []);
  assert.deepEqual(types("server { listen 127.0.0.1:8081; location /s { stub_status; } }"), []);
});

test("TLS protocols and ciphers", () => {
  assert.deepEqual(types("ssl_protocols SSLv3 TLSv1 TLSv1.2;").sort(), ["ssl-protocol-broken", "ssl-protocol-deprecated"]);
  assert.deepEqual(types("ssl_protocols TLSv1.2 TLSv1.3;"), []);
  assert.deepEqual(types("ssl_ciphers 'HIGH:!aNULL:!MD5';"), []);
  assert.deepEqual(types("ssl_ciphers AES128-SHA:RC4-SHA:DES-CBC3-SHA;"), ["ssl-cipher-weak"]);
  assert.match(one("ssl_ciphers AES128-SHA:RC4-SHA:DES-CBC3-SHA;")[0].detail, /RC4-SHA, DES-CBC3-SHA/);
});

test("the smaller ones", () => {
  assert.deepEqual(types(srv("autoindex on;")), ["autoindex-on"]);
  assert.deepEqual(types(srv("autoindex off;")), []);
  assert.deepEqual(types("server_tokens on;"), ["server-tokens-on"]);
  assert.deepEqual(types("server_tokens off;"), []);
  assert.deepEqual(types(srv("location / { proxy_set_header Host $http_host; proxy_pass http://up; }")), ["host-header-spoofing"]);
  assert.deepEqual(types(srv("location / { proxy_set_header Host $host; proxy_pass http://up; }")), []);
  assert.deepEqual(types(srv("valid_referers none blocked example.com;")), ["valid-referers-none"]);
  assert.deepEqual(types(srv("client_max_body_size 0;")), ["unbounded-request-body"]);
  assert.deepEqual(types(srv("client_max_body_size 20m;")), []);
  assert.deepEqual(types(srv("location / { return 302 $arg_next; }")), ["open-redirect"]);
  assert.deepEqual(types(srv("location / { return 302 https://$arg_host/; }")), ["open-redirect"]);
  assert.deepEqual(types(srv("location / { return 302 https://example.com/?next=$arg_next; }")), []);
});

test("upstream TLS verification follows proxy_ssl_verify inheritance", () => {
  assert.deepEqual(types(srv("location / { proxy_pass https://api.example.net; }")), ["upstream-tls-unverified"]);
  assert.deepEqual(types(srv("proxy_ssl_verify on; location / { proxy_pass https://api.example.net; }")), []);
  assert.deepEqual(types(srv("location / { proxy_pass https://127.0.0.1:8443; }")), []);
  assert.deepEqual(types(srv("location / { proxy_pass http://api.example.net; }")), []);
});

test("includes resolve against the files given, globbed and in name order", () => {
  const files = [
    { name: "/etc/nginx/nginx.conf", text: "http {\n add_header X-Frame-Options DENY;\n include /etc/nginx/conf.d/*.conf;\n include mime.types;\n}\n" },
    { name: "conf.d/b.conf", text: "server { listen 80; location /b { alias /srv/b/; } }\n" },
    { name: "conf.d/a.conf", text: "server { listen 80; location / { add_header X-A 1; } }\n" },
  ];
  const { findings, notes } = scanFiles(files);
  assert.deepEqual(findings.map((f) => `${f.file}:${f.type}`), ["conf.d/b.conf:alias-path-traversal", "conf.d/a.conf:add-header-drops-inherited"]);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /mime\.types matched none/);
  assert.throws(() => scanFiles([{ name: "a.conf", text: "include b.conf;" }, { name: "b.conf", text: "include a.conf;" }]), /include loop/);
});

test("a snippet of location blocks is read in server context", () => {
  assert.deepEqual(types("location /x { alias /srv/x/; }"), ["alias-path-traversal"]);
});

test("every finding type is documented and covered", () => {
  const readme = execFileSync("cat", [path.join(here, "README.md")], { encoding: "utf8" });
  for (const t of TYPES) assert.ok(readme.includes(`\`${t}\``), `README does not document ${t}`);
});

test("summary and risk", () => {
  assert.equal(summaryLine([]), "None of the patterns this tool checks for were found.");
  const f = one(srv("autoindex on; server_tokens on;"));
  assert.equal(summaryLine(f), "2 findings: 1 medium, 1 low.");
  assert.ok(hasRisk(f));
  assert.ok(!hasRisk(one("server_tokens on;")));
});

test("CLI: the fixture tree, json and --fail-on-risk", () => {
  const cli = path.join(here, "check.mjs");
  const fx = path.join(here, "fixtures", "etc-nginx");
  const text = execFileSync("node", [cli, fx], { encoding: "utf8" });
  assert.match(text, /15 findings: 4 high, 7 medium, 4 low\. \(4 files read\)/);
  const json = JSON.parse(execFileSync("node", [cli, fx, "--format", "json"], { encoding: "utf8" }));
  assert.equal(json.findings.length, 15);
  assert.ok(json.findings.every((f) => !f.file.endsWith("clean.conf")));
  const r = spawnSync("node", [cli, fx, "--fail-on-risk"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  const clean = spawnSync("node", [cli, path.join(fx, "conf.d", "clean.conf"), "--fail-on-risk"], { encoding: "utf8" });
  assert.equal(clean.status, 0);
  assert.match(clean.stdout, /None of the patterns/);
});
