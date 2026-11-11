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
z=np.load(f'{S}/tmp_backdrops/hz.npz'); fr0=z['frames']; cy0=z['cy']
yy,xx=np.mgrid[0:1080,0:1920].astype(np.float32)
D0,D1,XB=-100,1150,16; nd=D1-D0; nx=60
ax=np.clip((np.abs(xx-CX)/XB).astype(np.int32),0,nx-1)
frames=[f for f in fr0 if f%4==0]
maps=np.zeros((len(frames),nd,nx,3),np.float32); cnts=np.zeros((len(frames),nd,nx),np.float32)
# mirror symmetry test
im=L(120); print('LR asym f120 mean abs',np.abs(im-im[:,::-1]).mean(), 'signed',(im[:,:960]-im[:,::-1][:,:960]).mean((0,1)))
for i,f in enumerate(frames):
    im=L(f); m=tmask(f); cy=cy0[np.where(fr0==f)[0][0]]
    d=np.hypot(xx-CX,yy-cy)-R0
    di=np.floor(d-D0).astype(np.int32); ok=(~m)&(di>=0)&(di<nd)
    idx=(di*nx+ax)[ok]
    c=np.bincount(idx,minlength=nd*nx).astype(np.float32)
    cnts[i]=c.reshape(nd,nx)
    for ch in range(3):
        maps[i,:,:,ch]=(np.bincount(idx,weights=im[:,:,ch][ok],minlength=nd*nx)/np.maximum(c,1)).reshape(nd,nx)
np.savez(f'{S}/tmp_backdrops/maps.npz',frames=np.array(frames),maps=maps,cnts=cnts,D0=D0,XB=XB)
frames=np.array(frames)
# SVD on outro static-limb frames
sel=np.where((frames>=736)&(frames<=1056))[0]
valid=(cnts[sel]>=8).all(0)
X=maps[sel][:,valid]  # (nf, nbin, 3)
print('static outro frames',len(sel),'valid bins',valid.sum(),'max val',X.max())
Xf=X.reshape(len(sel),-1); mu=Xf.mean(0); U,s,Vt=np.linalg.svd(Xf-mu,full_matrices=False)
print('sing vals',s[:8]/np.sqrt(Xf.shape[1]))
for k in range(3): print('tc',k,(U[:,k]*s[k]/np.sqrt(Xf.shape[1]))[::3])
print('frames',frames[sel][::3])
# proxies for all frames
di=lambda d:d-D0
print('frame rimR(d2..6,x<160) rimR side(x 640-800)  tealG(d190-210,c)  tealG side  blueB(d 380-420) spaceB(d 700-800)')
for i,f in enumerate(frames):
    if f%8: continue
    M=maps[i]
    print(f, M[di(2):di(6),:10,0].mean().round(1), M[di(2):di(6),40:50,0].mean().round(1), M[di(190):di(210),:10,1].mean().round(1), M[di(190):di(210),40:50,1].mean().round(1), M[di(380):di(420),:10,2].mean().round(1), M[di(700):di(800),:10,2].mean().round(1))
