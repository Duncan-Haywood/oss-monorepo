"""Token cost of the same content in different file formats (see the post
docs/posts/2026-10-30-what-files-llms-read-best.md). Needs tiktoken, pyyaml,
toml. Run from the repo root:
SSL_CERT_FILE=... python3 docs/reports/assets/file-formats-for-llms/measure.py 40 > docs/reports/assets/file-formats-for-llms/results.json"""
import ast, json, random, re, subprocess, sys, urllib.request
from xml.sax.saxutils import escape
import tiktoken, toml, yaml

ENC = {e: tiktoken.get_encoding(e) for e in ("o200k_base", "cl100k_base")}
SITE = "https://monorepo-projects-site.duncan-andrew-haywood.workers.dev"
random.seed(20261030)

def tok(s):
    return {e: len(enc.encode(s, disallowed_special=())) for e, enc in ENC.items()}

def files(ext):
    out = subprocess.run(["git", "ls-files", f"*.{ext}"], capture_output=True, text=True).stdout.split()
    return [f for f in out if "/node_modules/" not in f]

# A. One structured file in six serialisations.
def to_xml(v, tag="item", ind=0):
    p = "  " * ind
    if isinstance(v, dict):
        inner = "".join(to_xml(x, k, ind + 1) for k, x in v.items())
        return f"{p}<{tag}>\n{inner}{p}</{tag}>\n"
    if isinstance(v, list):
        return "".join(to_xml(x, tag, ind) for x in v)
    return f"{p}<{tag}>{escape(str(v))}</{tag}>\n"

def formats_of(path):
    raw = open(path).read()
    data = json.loads(json.dumps(yaml.safe_load(raw), default=str))  # dates as strings
    no_comments = yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=10**6)
    return {
        "yaml (as written, with comments)": raw,
        "yaml (data only)": no_comments,
        "json (indent 2)": json.dumps(data, indent=2, ensure_ascii=False),
        "json (minified)": json.dumps(data, separators=(",", ":"), ensure_ascii=False),
        "toml": toml.dumps(data if isinstance(data, dict) else {"items": data}),
        "xml": to_xml(data, "root"),
    }

# A2. One table as CSV, JSON records, a Markdown table and XML rows.
def tables_of(path):
    import csv, io
    rows = list(csv.DictReader(open(path)))
    cols = list(rows[0])
    md = "| " + " | ".join(cols) + " |\n|" + "---|" * len(cols) + "\n" + "".join("| " + " | ".join(r[c] for c in cols) + " |\n" for r in rows)
    return {"csv": open(path).read(), "markdown table": md,
            "json records (indent 2)": json.dumps(rows, indent=2),
            "json records (minified)": json.dumps(rows, separators=(",", ":")),
            "xml rows": to_xml({"row": rows}, "table")}

# B. A blog post as Markdown source vs the HTML page a crawler fetches.
def strip_html(h):
    h = re.sub(r"(?is)<(script|style)\b.*?</\1>", "", h)
    h = re.sub(r"(?s)<[^>]+>", " ", h)
    return re.sub(r"\s+", " ", h).strip()

def posts(n):
    out = []
    names = sorted(subprocess.run(["git", "ls-files", "docs/posts/*.md"], capture_output=True, text=True).stdout.split())
    for f in random.sample(names, n):
        slug = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", f.rsplit("/", 1)[1][:-3])
        try:
            html = urllib.request.urlopen(urllib.request.Request(f"{SITE}/writing/{slug}/", headers={"User-Agent": "curl/8"}), timeout=20).read().decode()
        except Exception:
            continue
        md = open(f).read()
        out.append({"post": f, "md": tok(md)["o200k_base"], "html": tok(html)["o200k_base"],
                    "html_text_only": tok(strip_html(html))["o200k_base"], "md_bytes": len(md.encode()), "html_bytes": len(html.encode())})
    return out

# C. Characters per token by file type across the repository.
def density(ext, n=300, cap=200_000):
    fs = files(ext)
    fs = random.sample(fs, min(n, len(fs)))
    ch = t = 0
    for f in fs:
        try:
            s = open(f, encoding="utf-8").read()[:cap]
        except Exception:
            continue
        ch += len(s); t += tok(s)["o200k_base"]
    return {"files": len(fs), "chars_per_token": round(ch / t, 2) if t else None}

# D. A Python module vs its interface (signatures and docstrings, bodies cut).
def stub(src):
    tree = ast.parse(src)
    class Cut(ast.NodeTransformer):
        def visit_FunctionDef(self, node):
            self.generic_visit(node)
            doc = ast.get_docstring(node)
            node.body = ([ast.Expr(ast.Constant(doc))] if doc else []) + [ast.Expr(ast.Constant(...))]
            return node
        visit_AsyncFunctionDef = visit_FunctionDef
    tree = Cut().visit(tree)
    tree.body = [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Import, ast.ImportFrom))
                 or (isinstance(n, ast.Expr) and isinstance(getattr(n, "value", None), ast.Constant))]
    return ast.unparse(tree)

def stubs(n=200):
    fs = [f for f in files("py") if "/test" not in f and not f.endswith("__init__.py")]
    rows = []
    for f in random.sample(fs, min(n, len(fs))):
        try:
            src = open(f).read()
            s = stub(src)
        except Exception:
            continue
        a, b = tok(src)["o200k_base"], tok(s)["o200k_base"]
        if a > 200:
            rows.append(b / a)
    rows.sort()
    return {"modules": len(rows), "median_stub_share": round(rows[len(rows) // 2], 3),
            "p25": round(rows[len(rows) // 4], 3), "p75": round(rows[3 * len(rows) // 4], 3)}

if __name__ == "__main__":
    res = {"structured": {f: {k: tok(v) for k, v in formats_of(f).items()} for f in ("portfolio/flagships.yaml", "portfolio/usage/usage.yaml")}}
    t = "research/marriage-divorce-evidence/reproducibility/annual_acs/predictive_margins.csv"
    res["tabular"] = {t: {k: tok(v) for k, v in tables_of(t).items()}}
    res["density"] = {e: density(e) for e in ["py", "mjs", "ts", "json", "md", "html", "xml", "svg", "yaml", "toml", "csv", "txt"]}
    res["python_interface"] = stubs()
    p = posts(int(sys.argv[1]) if len(sys.argv) > 1 else 40)
    res["posts"] = {"n": len(p), "sum_md": sum(r["md"] for r in p), "sum_html": sum(r["html"] for r in p),
                    "sum_html_text_only": sum(r["html_text_only"] for r in p),
                    "html_over_md_median": sorted(r["html"] / r["md"] for r in p)[len(p) // 2] if p else None, "rows": p}
    json.dump(res, sys.stdout, indent=1)
