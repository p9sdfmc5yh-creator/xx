"""Builder (sky fit v2): smooth sky fitted in limb-following coordinates (x, v = y - y_limb(x)) so that the
haze hugging the horizon is bridged correctly behind the title; anisotropic thin-plate + damped extension below."""
import json,cv2,numpy as np,sys,time
import scipy.sparse as sp, scipy.sparse.linalg as spl
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
CX,CY,R=959.5,3380.9,2800.0; V0=-752; NV,NX=313,240
xs=np.arange(1920,dtype=np.float32); yl=(CY-np.sqrt(R*R-(xs-CX)**2)).astype(np.float32)
mapx=np.broadcast_to(xs[None,:],(NV*4,1920)).copy(); mapy=(yl[None,:]+(V0+np.arange(NV*4,dtype=np.float32))[:,None]).astype(np.float32)
def d1(n): return sp.diags([-np.ones(n-1),np.ones(n-1)],[0,1],shape=(n-1,n))
def d2(n): return sp.diags([np.ones(n-2),-2*np.ones(n-2),np.ones(n-2)],[0,1,2],shape=(n-2,n))
Iv,Ix=sp.identity(NV),sp.identity(NX)
Dv=sp.kron(d1(NV),Ix).tocsr(); Dx=sp.kron(Iv,d1(NX)).tocsr()
Dvv=sp.kron(d2(NV),Ix); Dxx=sp.kron(Iv,d2(NX)); Dxv=sp.kron(d1(NV),d1(NX))
LVV,LXX=60.0,250.0; L1V,L1X=2.4,10.0
P2=(LVV*Dvv.T@Dvv+LXX*Dxx.T@Dxx+2*np.sqrt(LVV*LXX)*Dxv.T@Dxv).tocsr()
# frame grid (270x480, 4 px cells) -> coords in the (v,x) grid
fy=(np.arange(270,dtype=np.float32)*4+1.5)[:,None]; fx=(np.arange(480,dtype=np.float32)*4+1.5)[None,:]
fyl=CY-np.sqrt(R*R-(fx-CX)**2)
back_r=((fy-fyl)-V0-1.5)/4; back_c=np.broadcast_to((fx-3.5)/8,back_r.shape).astype(np.float32); back_r=back_r.astype(np.float32)
shots=json.load(open('/home/user/xx/film/shots.json'))['shots']; only=sys.argv[1:]
for sh in shots:
    sid=sh['id']
    if only and sid not in only: continue
    t0=time.time(); z=np.load(f'{S}/tmp_backdrops/shot_{sid}.npz'); med=z['med'].astype(np.float32); tm=z['tm']
    old=dict(np.load(f'{S}/tmp_backdrops/sky_{sid}.npz')); hs=old['hs'].astype(np.float32)
    sky=((np.arange(1080)[:,None]<hs[None,:]-10)&~tm).astype(np.float32)
    wm=cv2.remap(sky,mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)
    dm=cv2.remap(med*sky[...,None],mapx,mapy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=0)
    wd=cv2.resize(wm,(NX,NV),interpolation=cv2.INTER_AREA); dd=cv2.resize(dm,(NX,NV),interpolation=cv2.INTER_AREA)/np.maximum(wd,1e-6)[...,None]
    valid=wd>0.999
    vh=(hs-yl).reshape(-1,8).min(1)[None,:]; vc=(V0+np.arange(NV)*4+1.5)[:,None]
    below=vc>=vh-10
    mv=(below[:-1]&below[1:]).ravel().astype(float); mx=(below[:,:-1]&below[:,1:]).ravel().astype(float)
    Pm=L1V*Dv.T@sp.diags(mv)@Dv+L1X*Dx.T@sp.diags(mx)@Dx
    w=valid.ravel().astype(float); d=dd.reshape(-1,3).astype(float)
    for it in range(2):
        A=(sp.diags(w)+P2+Pm+1e-9*sp.identity(NV*NX)).tocsc(); lu=spl.splu(A)
        u=np.stack([lu.solve(w*d[:,c]) for c in range(3)],1)
        res=np.abs(u-d).max(1); w=valid.ravel()/(1+(res/1.5)**2)
    mae=float((np.abs(u-d).mean(1)*valid.ravel()).sum()/max(valid.sum(),1))
    uf=cv2.remap(u.reshape(NV,NX,3).astype(np.float32),back_c,back_r,cv2.INTER_CUBIC,borderMode=cv2.BORDER_REPLICATE)
    old['u_v1']=old.get('u_v1',old['u']); old['u']=uf.astype(np.float32)
    np.savez(f'{S}/tmp_backdrops/sky_{sid}.npz',**old)
    print(sid,'fit_mae %.3f'%mae,'range',uf.min().round(1),uf.max().round(1),'t %.1f'%(time.time()-t0),flush=True)
