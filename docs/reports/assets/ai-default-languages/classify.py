"""Label the language (code tasks) or format (document tasks) of each reply.

Rule: for an agent reply that wrote files, the language of its largest
non-test source file (by extension); otherwise the longest fenced code block, ignoring blocks tagged
as program output (text, console, output, untagged). A document reply with
no qualifying block is "Markdown". Diagrams and derivations get extra
checks (Mermaid vs ASCII art, LaTeX math in prose). Imported by analyze.py.
"""
import re

ALIAS = {"python": "Python", "py": "Python", "python3": "Python",
         "javascript": "JavaScript", "js": "JavaScript", "jsx": "JavaScript", "mjs": "JavaScript",
         "typescript": "TypeScript", "ts": "TypeScript", "tsx": "TypeScript",
         "html": "HTML", "css": "CSS", "rust": "Rust", "rs": "Rust", "go": "Go", "golang": "Go",
         "c": "C", "cpp": "C++", "c++": "C++", "arduino": "Arduino C++", "ino": "Arduino C++",
         "bash": "Shell", "sh": "Shell", "shell": "Shell", "zsh": "Shell", "powershell": "PowerShell",
         "sql": "SQL", "yaml": "YAML", "yml": "YAML", "json": "JSON", "toml": "TOML", "ini": "INI",
         "env": "dotenv", "dotenv": "dotenv", "mermaid": "Mermaid", "latex": "LaTeX", "tex": "LaTeX",
         "markdown": "Markdown", "md": "Markdown", "swift": "Swift", "kotlin": "Kotlin", "dart": "Dart",
         "java": "Java", "r": "R", "julia": "Julia", "plantuml": "PlantUML", "dot": "Graphviz",
         "graphviz": "Graphviz", "micropython": "MicroPython", "rst": "reStructuredText",
         "jsonc": "JSON", "http": "HTTP", "proto": "Protobuf", "graphql": "GraphQL", "csharp": "C#",
         "cs": "C#", "lua": "Lua", "ruby": "Ruby", "php": "PHP", "zig": "Zig", "asm": "Assembly"}
OUTPUT_TAGS = {"", "text", "txt", "console", "output", "plaintext", "plain", "none", "log"}
FENCE = re.compile(r"^(```+|~~~+)[ \t]*([^\n`]*)\n(.*?)^\1[ \t]*$", re.M | re.S)

def blocks(reply):
    out = []
    for m in FENCE.finditer(reply):
        tag = m.group(2).strip().split()[0].lower() if m.group(2).strip() else ""
        tag = tag.split(":")[0].split("{")[0]
        out.append((tag, m.group(3)))
    return out

EXT = {"py": "Python", "js": "JavaScript", "mjs": "JavaScript", "ts": "TypeScript", "html": "HTML",
       "rs": "Rust", "go": "Go", "c": "C", "cpp": "C++", "cc": "C++", "ino": "Arduino C++", "sh": "Shell",
       "sql": "SQL", "yaml": "YAML", "yml": "YAML", "json": "JSON", "toml": "TOML", "ini": "INI",
       "env": "dotenv", "md": "Markdown", "mmd": "Mermaid", "tex": "LaTeX", "swift": "Swift",
       "kt": "Kotlin", "dart": "Dart", "java": "Java", "jsx": "JavaScript", "tsx": "TypeScript", "css": "CSS"}
SKIP = ("go.mod", "go.sum", "Cargo.toml", "Cargo.lock", "package.json", "requirements.txt", "pyproject.toml")

def file_label(task, files):
    src = {p: c for p, c in files.items() if p.rsplit("/", 1)[-1] not in SKIP and "test" not in p.lower()
           and p.rsplit(".", 1)[-1] in EXT}
    if task["kind"] == "code":
        src = {p: c for p, c in src.items() if not p.endswith(".md")} or src
    if not src:
        return None
    p = max(src, key=lambda k: len(src[k]))
    lab = EXT[p.rsplit(".", 1)[-1]]
    if lab == "HTML" and "<script" in src[p]:
        lab = "HTML + inline JS"
    return lab

def label(task, reply, files=None):
    """Return (label, all_languages) for one reply."""
    if reply.startswith("ERROR"):
        return "error", []
    if files:
        fl = file_label(task, files)
        if fl and task["id"] not in ("diagram", "derivation"):
            langs = sorted({EXT[p.rsplit(".", 1)[-1]] for p in files if p.rsplit(".", 1)[-1] in EXT})
            return fl, langs
    bs = blocks(reply)
    langs = sorted({ALIAS.get(t, t) for t, _ in bs if t not in OUTPUT_TAGS})
    real = [(t, b) for t, b in bs if t not in OUTPUT_TAGS]
    if task["id"] == "diagram":
        if any(t == "mermaid" for t, _ in bs):
            return "Mermaid", langs
        if any(ALIAS.get(t) in ("PlantUML", "Graphviz") for t, _ in bs):
            return ALIAS[[t for t, _ in bs if ALIAS.get(t) in ("PlantUML", "Graphviz")][0]], langs
        return ("ASCII art" if bs else "Markdown"), langs
    if task["id"] == "derivation":
        latex = bool(re.search(r"\$[^$\n]+\$|\\\(|\\\[|\\frac|\\sqrt", reply))
        if any(ALIAS.get(t) == "LaTeX" for t, _ in real):
            return "LaTeX document", langs
        return ("Markdown + LaTeX math" if latex else "Markdown, plain-text math"), langs
    if not real and "<invoke" in reply:
        # a pretend tool call written as text (no tools were available):
        # take the language from the file it tried to write, if any
        m = re.search(r'name="file_path">[^<]*?\.([A-Za-z0-9]+)<', reply)
        if m and m.group(1) in EXT:
            return EXT[m.group(1)], [EXT[m.group(1)]]
        return "no code (looked for input)", langs
    if not real:
        if task["kind"] == "doc":
            return "Markdown", langs
        return ("no code (looked for input)" if files is not None else "no code"), langs
    tag, _ = max(real, key=lambda tb: len(tb[1]))
    lab = ALIAS.get(tag, tag)
    if lab == "HTML" and "<script" in _:
        lab = "HTML + inline JS"
    if task["kind"] == "doc" and lab == "Markdown":
        return "Markdown", langs
    if task["id"] == "funcdoc" and '"""' in _ and len(_) > len(reply) / 2:
        return "Python docstring", langs
    if task["id"] in ("readme", "funcdoc", "designdoc") and lab not in ("Markdown",):
        # docs whose longest block is a code sample are still Markdown documents
        return "Markdown", langs
    return lab, langs
