#!/bin/sh
# Build paper/main.tex (IEEEtran conference class, the MLCAD format) from ../PAPER.md.
# PAPER.md stays the source of truth; main.tex is generated. Needs pandoc; pdflatex only to typeset.
set -e
cd "$(dirname "$0")"
TITLE=$(sed -n '1s/^# //p' ../PAPER.md)
# body = PAPER.md minus the title line and the abstract section (the abstract goes in the abstract environment)
awk 'NR>1' ../PAPER.md > body.md
ABS=$(awk '/^## Abstract/{f=1;next} /^## /{f=0} f' ../PAPER.md | pandoc -f markdown -t latex)
awk '/^## Abstract/{skip=1;next} /^## /{skip=0} !skip' body.md > body2.md
pandoc -f markdown -t latex --top-level-division=default body2.md -o body.tex
{
cat <<HDR
\\documentclass[conference]{IEEEtran}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb,booktabs,longtable,array,hyperref}
\\providecommand{\\tightlist}{\\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}}
\\begin{document}
\\title{$TITLE}
\\author{\\IEEEauthorblockN{Anonymous (draft; not submitted)}}
\\maketitle
\\begin{abstract}
$ABS
\\end{abstract}
HDR
cat body.tex
printf '%s\n' '\end{document}'
} > main.tex
rm -f body.md body2.md body.tex
echo wrote main.tex
