import json,cv2,numpy as np,sys
sys.path.insert(0,'/home/user/xx/film/compose'); import text as T
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
def L(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg').astype(np.float32)[:,:,::-1]
np.set_printoptions(linewidth=250,precision=2,suppress=True)
def tmask(f,dil=13):
    a=T.render_text_layer(f,use_old_name=True,scale=1)[:,:,3]
    m=(a>0.003).astype(np.uint8)
    if m.any(): m=cv2.dilate(m,np.ones((dil,dil),np.uint8))
    return m>0
CX,R0=959.5,2800.0
yy,xx=np.mgrid[0:1080,0:1920].astype(np.float32)
z=np.load(f'{S}/tmp_backdrops/als.npz'); B=z['B'];G=z['G'];D0=int(z['D0']); nd,nx,_=B.shape; XB=16
ax=np.clip((np.abs(xx-CX)/XB).astype(np.int32),0,nx-1)
def limb(im,m):
    r=cv2.GaussianBlur(im[:,:,0],(0,0),1.2); g=np.diff(r,axis=0)
    mm=cv2.dilate(m.astype(np.uint8),np.ones((15,15),np.uint8))>0; g[mm[1:]]=0
    X=[];Y=[]
    for x in range(10,1910,10):
        col=g[:,x-2:x+3].mean(1); y=int(np.argmin(col))
        if col[y]>-2.0 or y<2 or y>1075: continue
        a,b,c=col[y-1],col[y],col[y+1]; dn=a-2*b+c
        X.append(x); Y.append(y+0.5+(0.5*(a-c)/dn if abs(dn)>1e-6 else 0))
    X=np.array(X,float);Y=np.array(Y,float)
    cyi=Y+np.sqrt(R0**2-(X-CX)**2); cy=np.median(cyi); k=np.abs(cyi-cy)<1.0
    return cyi[k].mean()
frames=list(range(0,192))+list(range(736,1222)); cys=[];gs=[]
for f in frames:
    im=L(f); m=tmask(f); cy=limb(im,m); cys.append(cy)
    d=np.hypot(xx-CX,yy-cy)-R0; di=np.floor(d-D0).astype(np.int32); ok=(~m)&(di>=0)&(di<nd)
    b=B[di[ok],ax[ok]]; gg=G[di[ok],ax[ok]]; v=im[ok]; w=(v<249)
    gs.append(float((w*(v-b)*gg).sum()/(w*gg*gg).sum()))
frames=np.array(frames);cys=np.array(cys);gs=np.array(gs)
np.savez(f'{S}/tmp_backdrops/hz_all.npz',frames=frames,cy=cys,g=gs)
def show(a,b):
    k=(frames>=a)&(frames<=b); print(' '.join(f'{f}:{y-R0:.2f}/{g:.3f}' for f,y,g in zip(frames[k],cys[k],gs[k])))
show(84,96);show(132,142);show(172,191);show(744,758);show(1048,1066);show(1144,1176)
