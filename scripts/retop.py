# Rebuild a trade's wide top (A123): Figma's wide picture made smaller and moved, on a
# backdrop extended from the picture's own plain left side (no seam), saved 1240 x 800 JPEG.
# Use: python3 scripts/retop.py source.png out.jpg SCALE CX CY   (e.g. 0.86 0.47 0.47: the
# object at 86% size, its centre at 47% across and 47% down). Check it at 320 wide.
import sys, numpy as np
from PIL import Image
src_path, out_path, k, cx, cy = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
src=Image.open(src_path).convert('RGB'); a=np.asarray(src).astype(float); H,Wd,_=a.shape
ys,xs=np.mgrid[0:H,0:int(Wd*0.4)]
pts=a[:, :int(Wd*0.4)].reshape(-1,3); X=np.stack([np.ones(xs.size), xs.ravel()/Wd, ys.ravel()/H, (xs.ravel()/Wd)**2, (ys.ravel()/H)**2],1)
coef,_,_,_=np.linalg.lstsq(X,pts,rcond=None)
CW,CH=1600,1032; yy,xx=np.mgrid[0:CH,0:CW]; u=xx/CW; v=yy/CH
Xc=np.stack([np.ones(u.size), u.ravel()*0.4, v.ravel(), (u.ravel()*0.4)**2, v.ravel()**2],1)
canvas=Image.fromarray((Xc@coef).reshape(CH,CW,3).clip(0,255).astype('uint8'))
sw,sh=int(Wd*k),int(H*k); small=src.resize((sw,sh),Image.LANCZOS)
m=np.ones((sh,sw)); f=120
for i in range(f):
    t=(i/f)**1.5; m[i,:]=np.minimum(m[i,:],t); m[-1-i,:]=np.minimum(m[-1-i,:],t); m[:,i]=np.minimum(m[:,i],t); m[:,-1-i]=np.minimum(m[:,-1-i],t)
canvas.paste(small,(int(CW*cx)-sw//2,int(CH*cy)-sh//2),Image.fromarray((m*255).astype('uint8')))
canvas.resize((1240,800),Image.LANCZOS).save(out_path,quality=86,optimize=True,progressive=True)
