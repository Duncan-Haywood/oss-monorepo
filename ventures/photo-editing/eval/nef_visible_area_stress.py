"""Stress masked_margins on picture-only crops and darkened copies (eval/nikon-nef-visible-area-2026-11-15.md).

Usage: PYTHONPATH=src python eval/nef_visible_area_stress.py DIR  (DIR holds mei/nef/Nikon*.nef; needs numpy)
"""
import glob, sys
import numpy as np
from array import array
from shootflow import nef
from shootflow import raw_develop as rd
S=sys.argv[1]
print("file | crop | stops under | found (left, right)")
for f in sorted(glob.glob(S+"/mei/nef/Nikon*.nef")):
    raw=nef.parse_nef(open(f,'rb').read())
    t,l,b,r=raw.ifd.entries[rd.TAG_ACTIVE_AREA]
    full=np.frombuffer(raw.values,dtype=np.uint16).reshape(raw.height,raw.width)
    black=float(raw.ifd.entries[rd.TAG_BLACK_LEVEL][0])
    pic=full[:, l:r].astype(float)
    for stops in (0,3,6):
        for name, arr in (("picture only", pic), ("stored", full.astype(float))):
            a = black + (arr-black)/(2**stops)
            a = np.clip(np.round(a),0,65535).astype(np.uint16)
            h,w=a.shape
            res=nef.masked_margins(array("H",a.tobytes()), w, h, 16383)
            print(f.split('/')[-1], "|", name, "|", stops, "|", res)
