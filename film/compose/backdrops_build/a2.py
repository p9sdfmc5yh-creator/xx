import json,cv2,numpy as np,sys
sys.path.insert(0,'/home/user/xx/film/compose'); import text as T
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
def L(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg').astype(np.float32)[:,:,::-1]
np.set_printoptions(linewidth=250,precision=1,suppress=True)
def tmask(f,dil=9):
    a=T.render_text_layer(f,use_old_name=True,scale=1)[:,:,3]
    m=(a>0.004).astype(np.uint8)
    if m.any(): m=cv2.dilate(m,np.ones((dil,dil),np.uint8))
    return m>0
CX,R0=959.5,2800.0
yy,xx=np.mgrid[0:1080,0:1920].astype(np.float32)
def limb(im,m):
    r=cv2.GaussianBlur(im[:,:,0],(0,0),1.2)
    g=np.diff(r,axis=0)
    mm=cv2.dilate(m.astype(np.uint8),np.ones((15,15),np.uint8))>0
    g[mm[1:]]=0
    xs=np.arange(10,1910,10); X=[];Y=[]
    for x in xs:
        col=g[:,x-2:x+3].mean(1); y=int(np.argmin(col))
        if col[y]>-2.0 or y<2 or y>1075: continue
        a,b,c=col[y-1],col[y],col[y+1]; dn=a-2*b+c
        X.append(x); Y.append(y+0.5+(0.5*(a-c)/dn if abs(dn)>1e-6 else 0))
    return np.array(X,float),np.array(Y,float)
def fitcirc(x,y):
    A=np.c_[2*x,2*y,np.ones_like(x)]; b=x*x+y*y
    sol=np.linalg.lstsq(A,b,rcond=None)[0]; cx,cy=sol[:2]; R=np.sqrt(sol[2]+cx*cx+cy*cy)
    return cx,cy,R
frames=list(range(0,192,2))+list(range(736,1222,2))
D0,D1=-80,1300; nb=D1-D0
out={'frames':np.array(frames)}; cys=[];prof=[];profs=[];free=[]
zone_c=np.abs(xx-CX)<300; zone_s=np.abs(xx-CX)>620
for f in frames:
    im=L(f); m=tmask(f)
    x,y=limb(im,m)
    cyi=y+np.sqrt(R0**2-(x-CX)**2); cy=np.median(cyi); k=np.abs(cyi-cy)<1.0
    cy=cyi[k].mean(); sd=cyi[k].std()
    fr=fitcirc(x[k],y[k]) if k.sum()>60 and (x[k].max()-x[k].min())>1500 else (np.nan,)*3
    cys.append(cy); free.append(fr+(sd,k.sum()))
    d=np.hypot(xx-CX,yy-cy)-R0
    bi=np.clip(np.floor(d-D0).astype(np.int32),0,nb-1)
    P=[]
    for z in (zone_c,zone_s):
        w=(z&~m).ravel()
        cnt=np.bincount(bi.ravel()[w],minlength=nb).astype(np.float64)
        p=np.stack([np.bincount(bi.ravel()[w],weights=im[:,:,c].ravel()[w],minlength=nb) for c in range(3)],1)
        p=np.where(cnt[:,None]>20,p/np.maximum(cnt[:,None],1),np.nan); P.append(p)
    prof.append(P[0]); profs.append(P[1])
cys=np.array(cys); free=np.array(free); prof=np.array(prof); profs=np.array(profs)
np.savez(f'{S}/tmp_backdrops/hz.npz',frames=np.array(frames),cy=cys,free=free,prof=prof,profs=profs,D0=D0)
print('frame: ytop(cy-R)  [free cx cy R] sd n')
for i,f in enumerate(frames):
    if f%12==0 or f in (190,736,1220): print(f, f'{cys[i]-R0:.2f}', free[i])
