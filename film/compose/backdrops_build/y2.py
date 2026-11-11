import cv2,numpy as np,sys
sys.path.insert(0,'/home/user/xx/film/compose'); import text as T
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
np.set_printoptions(linewidth=250,precision=5,suppress=True)
def L(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg').astype(np.float32)[:,:,::-1]
fl=list(range(192,256,3)); im=np.mean([L(f) for f in fl],0)
tm=np.zeros((1080,1920),bool)
for f in (200,230,255):
    a=T.render_text_layer(f,use_old_name=True,scale=1)[:,:,3]; tm|=cv2.dilate((a>0.003).astype(np.uint8),np.ones((13,13),np.uint8))>0
yy,xx=np.mgrid[0:1080,0:1920].astype(np.float32)
d0=np.hypot(xx-958.9,yy-(579.77+2806.8))-2806.8; d1=np.hypot(xx-958.9,yy-(579.77+2871.1))-2871.1
u=(xx-959.5)/960; v=(yy-539.5)/540
def basis(u,v,deg): return np.stack([u**i*v**j for i in range(deg+1) for j in range(deg+1-i)],-1)
lum=im.mean(2)
pl=(np.maximum(d0,d1)<-40)&~((xx>1490)&(xx<1730)&(yy>880)&(yy<1055))
A=basis(u[pl],v[pl],4)[::7]; y=lum[pl][::7]
co=np.linalg.lstsq(A,y,rcond=None)[0]; res=y-A@co
print('planet poly deg4 coefs (i,j order):',repr(co.round(4).tolist()),'rms',res.std().round(2))
print('planet colour ratio',(im[pl].mean(0)/lum[pl].mean()).round(4), 'lum at top centre',lum[640:700,900:1020].mean())
sp=(np.minimum(d0,d1)>25)&~tm&~((xx<340)&(yy>280)&(yy<480))
A=basis(u[sp],v[sp],2)[::5]; y=lum[sp][::5]; co2=np.linalg.lstsq(A,y,rcond=None)[0]
print('space poly deg2:',repr(co2.round(4).tolist()),'rms',(y-A@co2).std().round(2),'colour ratio',(im[sp].mean(0)/lum[sp].mean()).round(4),'mean',lum[sp].mean())
# radial check of space lum
r=np.hypot(u,v*0.5625)
for a,b in ((0,.3),(.3,.5),(.5,.7),(.7,.85),(.85,.95),(.95,1.05),(1.05,1.2)):
    k=sp&(r>=a)&(r<b); print('space r',a,b,lum[k].mean().round(2) if k.any() else None, end=' | ')
print()
# limb profile (frame 224): mean lum vs d near limb, centre columns
f224=L(224).mean(2); R=np.polyval([0.003368253487726585,0.8063264740211592,2806.81800530188],32); d=np.hypot(xx-958.9,yy-(579.77+R))-R
k=(np.abs(xx-960)<500)
print('limb profile d:lum', [(dd,f224[k&(d>=dd)&(d<dd+1)].mean().round(1)) for dd in (-60,-40,-30,-20,-14,-10,-7,-5,-3,-2,-1,0,1,2,3,5,8,14,25)])
