"""Count source files by language in this repository, per top-level area.

Usage: python3 census.py  (from anywhere inside the repo; stdlib only)
Uses `git ls-files`, so only committed files count. Most files here were
written by AI coding sessions; see the post for which areas had a language
rule in their instructions.
"""
import collections, subprocess

LANG = {"py": "Python", "mjs": "JavaScript", "js": "JavaScript", "jsx": "JavaScript",
        "ts": "TypeScript", "tsx": "TypeScript", "rs": "Rust", "go": "Go", "c": "C",
        "h": "C", "cpp": "C++", "v": "Verilog", "sv": "Verilog", "swift": "Swift",
        "kt": "Kotlin", "java": "Java", "sh": "Shell", "tf": "Terraform", "scad": "OpenSCAD",
        "nix": "Nix", "R": "R", "jl": "Julia", "rb": "Ruby", "lua": "Lua", "cs": "C#"}
DOCS = {"md": "Markdown", "html": "HTML", "txt": "Plain text", "yaml": "YAML", "yml": "YAML",
        "json": "JSON", "toml": "TOML", "bib": "BibTeX", "tex": "LaTeX", "rst": "reStructuredText",
        "adoc": "AsciiDoc", "org": "Org", "ipynb": "Notebook", "mmd": "Mermaid", "svg": "SVG"}

def main():
    root = subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip()
    files = subprocess.check_output(["git", "-C", root, "ls-files"], text=True).split("\n")
    code = collections.defaultdict(collections.Counter)
    docs = collections.Counter()
    projects = collections.defaultdict(collections.Counter)
    for f in filter(None, files):
        ext = f.rsplit(".", 1)[-1] if "." in f.rsplit("/", 1)[-1] else ""
        top = f.split("/", 1)[0] if "/" in f else "(root)"
        if ext in LANG:
            code[top][LANG[ext]] += 1
            if top in ("research", "ventures") and f.count("/") >= 2:
                projects[(top, f.split("/")[1])][LANG[ext]] += 1
        if ext in DOCS:
            docs[DOCS[ext]] += 1
    print("Source files by language and area")
    for top in sorted(code, key=lambda t: -sum(code[t].values())):
        tot = sum(code[top].values())
        parts = ", ".join(f"{l} {n} ({100*n/tot:.0f}%)" for l, n in code[top].most_common(6))
        print(f"  {top:10} {tot:6}  {parts}")
    print("\nProjects by main language (most files)")
    for top in ("research", "ventures"):
        c = collections.Counter(max(v, key=v.get) for (t, _), v in projects.items() if t == top)
        tot = sum(c.values())
        print(f"  {top:10} {tot:4} projects: " + ", ".join(f"{l} {n}" for l, n in c.most_common()))
        other = sorted(p for (t, p), v in projects.items() if t == top
                       and set(v) - {"Python", "JavaScript", "TypeScript", "Shell"})
        print(f"    with a language outside Python/JS/TS/Shell: " + ", ".join(
            f"{p} ({'/'.join(sorted(set(projects[(top, p)]) - {'Python', 'JavaScript', 'TypeScript', 'Shell'}))})"
            for p in other))
    print("\nDocument and data files by format")
    tot = sum(docs.values())
    for fmt, n in docs.most_common():
        print(f"  {fmt:18} {n:6} ({100*n/tot:.0f}%)")

if __name__ == "__main__":
    main()
