"""Single-point mutations of Verilog source, used to probe the checker and as a non-LLM baseline."""
import re

# (regex, replacement) pairs; every match of every pattern is one mutant site.
SWAPS = [(r"(?<![<>=!&|^+\-])\+(?![+=])", "-"), (r"(?<![<>=!&|^+\-])-(?![\->=])", "+"),
         (r"(?<![&])&(?![&])", "|"), (r"(?<![|])\|(?![|])", "&"), (r"\^", "|"),
         (r"&&", "||"), (r"\|\|", "&&"), (r"==", "!="), (r"!=", "=="),
         (r"(?<![<])<(?![<=])", ">"), (r"(?<![>])>(?![>=])", "<"),
         (r"<<", ">>"), (r">>", "<<"), (r"(?<![=!<>])!(?!=)", "")]
NUM = re.compile(r"(?<![\w'])(\d+)(?![\w'])|(?<=')d(\d+)")


def mutants(src):
    """Return a sorted list of (description, mutated_source), de-duplicated."""
    seen, out = {src}, []
    for pat, rep in SWAPS:
        for m in re.finditer(pat, src):
            new = src[:m.start()] + rep + src[m.end():]
            if new not in seen:
                seen.add(new)
                out.append((f"{m.group(0)!r}->{rep!r}@{m.start()}", new))
    for m in NUM.finditer(src):
        g = 1 if m.group(1) is not None else 2
        v = int(m.group(g))
        for nv in (v + 1, max(v - 1, 0)):
            new = src[:m.start(g)] + str(nv) + src[m.end(g):]
            if new not in seen:
                seen.add(new)
                out.append((f"const {v}->{nv}@{m.start(g)}", new))
    return sorted(out, key=lambda t: t[1])
