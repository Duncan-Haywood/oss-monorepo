"""Milestone 6b: the six real corners where cornerSubPix 11x11 and findChessboardCornersSB
disagree most, magnified 8x. Red: 11x11; green: SB; blue: 5x5. Writes ring_crops.png.

    python3 experiments/m6b_render/crops.py
"""
import glob, os, sys
import numpy as np, cv2
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'src'))
from selfcal import detect
rows=[]
for cam in ('left','right'):
    for f in sorted(glob.glob(os.path.join(ROOT, 'data', f'{cam}*.jpg'))):
        a,_=detect(f,method='subpix11'); b,_=detect(f,method='sb'); c5,_=detect(f,method='subpix5')
        g=np.linalg.norm(a-b,axis=1); g5=np.linalg.norm(c5-b,axis=1)
        for i in np.argsort(-g)[:3]:
            if g[i]>1: rows.append((g[i],g5[i],f,i,a[i],b[i],c5[i]))
rows.sort(key=lambda r:-r[0])
print(len(rows))
for r in rows[:8]: print(round(r[0],2),round(r[1],2),r[2],r[3],np.round(r[4],1),np.round(r[5],1))
tiles=[]
for g,g5,f,i,a,b,c5 in rows[:6]:
    img=cv2.cvtColor(cv2.imread(f,0),cv2.COLOR_GRAY2BGR)
    cx,cy=int(b[0]),int(b[1]); h=24
    crop=cv2.copyMakeBorder(img,h,h,h,h,cv2.BORDER_CONSTANT)[cy:cy+2*h,cx:cx+2*h]
    crop=cv2.resize(crop,None,fx=8,fy=8,interpolation=cv2.INTER_NEAREST)
    for p,col in ((a,(0,0,255)),(b,(0,200,0)),(c5,(255,0,0))):
        q=((p-np.array([cx-h,cy-h]))*8).astype(int); cv2.circle(crop,tuple(q),6,col,-1)
    cv2.putText(crop,f'{os.path.basename(f)} #{i} gap {g:.1f}',(5,20),0,0.6,(0,255,255),2)
    tiles.append(crop)
cv2.imwrite(os.path.join(HERE, 'ring_crops.png'),np.vstack([np.hstack(tiles[:3]),np.hstack(tiles[3:6])]))
