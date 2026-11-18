"""Rewrite 'arXiv:ID' / 'doi:ID' mentions in a LaTeX file into \\cite{key} and append the bibliography.
Keys come from references.bib (the entry whose eprint or doi equals the id). Usage: wirecite.py main.tex references.bib"""
import re, sys
from pathlib import Path


def keymap(bib):
    m = {}
    for entry in re.finditer(r"@\w+\{([^,]+),(.*?)\n(?=@|\Z)", bib, re.S):
        key, body = entry.groups()
        for f in re.findall(r"(?:eprint|doi)=\{([^}]+)\}", body):
            m[f] = key
    return m


def wire(tex, km):
    def sub(mo):
        i = mo.group(2).rstrip(".")
        tail = mo.group(2)[len(i):]
        return r"\cite{%s}" % km[i] + tail if i in km else mo.group(0)
    tex = re.sub(r"(arXiv:|doi:)(\d{4}\.\d{4,5}|10\.[^\s,)}]+?(?=[\s,)}]|$))", sub, tex)
    if r"\bibliography{" not in tex:
        tex = tex.replace(r"\end{document}",
                          "\\bibliographystyle{IEEEtran}\n\\bibliography{references}\n\\end{document}")
    return tex


if __name__ == "__main__":
    t, b = Path(sys.argv[1]), Path(sys.argv[2])
    t.write_text(wire(t.read_text(), keymap(b.read_text())))
