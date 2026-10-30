#!/bin/sh
# One command per figure; run from research/verifiable-training-mechanisms.
# Needs numpy, scipy, scikit-learn, matplotlib (milestone 3 and 4 figures).
set -e
PY=${PY:-python3}
export PYTHONPATH=src
$PY experiments/margin/figure.py      # fig. 1: loss given up versus tolerance
$PY experiments/frontier/figure.py    # fig. 2: requester cost versus tolerance
# fig. 2 as PNG for LaTeX (any SVG rasteriser; here headless Chromium via Playwright, 3x scale)
node -e "
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:640,height:380},deviceScaleFactor:3});await p.goto('file://'+process.cwd()+'/experiments/frontier/frontier.svg');await p.screenshot({path:'experiments/frontier/frontier.png'});await b.close()})()"
