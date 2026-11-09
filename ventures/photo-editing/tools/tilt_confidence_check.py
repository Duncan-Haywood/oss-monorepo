"""Does tilt confidence track tilt accuracy? Rotates OpenCV sample photos (Apache-2.0,
fetched, not stored) by known angles and bins readings by confidence.

    PYTHONPATH=src python3 tools/tilt_confidence_check.py
"""
import sys, urllib.request, tempfile, statistics
from pathlib import Path
from PIL import Image
from shootflow.frame_analysis import analyze_media as _am
from shootflow.ffmpeg_media import find_ffmpeg_tools
tools=find_ffmpeg_tools()
analyze_media=lambda q:_am(tools,q,media_type="photo")
names="building butterfly board left01 messi5 fruits lena home sudoku aero1 stuff".split()
base="https://raw.githubusercontent.com/opencv/opencv/4.x/samples/data/"
ANG=[-6,-3,-1.5,0,1.5,3,6]
rows=[]
d=Path(tempfile.mkdtemp())
for n in names:
    try:
        raw=urllib.request.urlopen(base+n+".jpg",timeout=20).read()
    except Exception as e:
        print("skip",n,e); continue
    p=d/(n+".jpg"); p.write_bytes(raw)
    im=Image.open(p).convert("RGB")
    res={}
    for a in ANG:
        r=im.rotate(a,expand=False,resample=Image.BICUBIC)
        w,h=r.size; c=int(max(abs(a),0)*0.03*max(w,h))+4
        r=r.crop((c,c,w-c,h-c)); q=d/f"{n}_{a}.jpg"; r.save(q,quality=95)
        f=analyze_media(q)
        res[a]=(f.tilt_degrees,f.tilt_confidence)
    z=res[0][0]
    for a in ANG:
        if a==0: continue
        # PIL rotate positive = counter-clockwise; sign unknown, take better of both
        ch=res[a][0]-z
        err=min(abs(ch-a),abs(ch+a))
        rows.append((n,a,err,res[a][1]))
    print(n,"conf0=%.2f"%res[0][1])
print()
for lo,hi in [(0,0.05),(0.05,0.15),(0.15,0.4),(0.4,1.01)]:
    s=[r for r in rows if lo<=r[3]<hi]
    if s:
        print(f"conf {lo}-{hi}: n={len(s)} within1={sum(r[2]<=1 for r in s)/len(s):.0%} median_err={statistics.median(r[2] for r in s):.2f}")
print("all: n=%d within1=%.0f%% med=%.2f"%(len(rows),100*sum(r[2]<=1 for r in rows)/len(rows),statistics.median(r[2] for r in rows)))
