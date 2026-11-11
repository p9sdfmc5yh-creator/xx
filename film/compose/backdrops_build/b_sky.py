"""Builder: per-shot smooth sky fit + star catalogue + star motion.  -> sky_build.npz"""
import json,cv2,numpy as np,sys,time
import scipy.sparse as sp, scipy.sparse.linalg as spl
from scipy.spatial import cKDTree
sys.path.insert(0,'/home/user/xx/film/compose'); import text as T
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
np.set_printoptions(linewidth=250,precision=3,suppress=True)
def L(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg').astype(np.float32)[:,:,::-1]
def horizon(im,tm):
    lum=im.max(2); op=cv2.morphologyEx(lum,cv2.MORPH_OPEN,np.ones((7,7),np.uint8))
    im2=np.minimum(im,op[...,None]+(im-lum[...,None])); md=cv2.GaussianBlur(im2,(0,0),1.5)
    gx=cv2.Sobel(md,cv2.CV_32F,1,0,ksize=3)/8; gy=cv2.Sobel(md,cv2.CV_32F,0,1,ksize=3)/8
    gm=np.sqrt(gx*gx+gy*gy).max(2); gm[cv2.dilate(tm.astype(np.uint8),np.ones((9,9),np.uint8))>0]=0
    hit=cv2.dilate((gm>2.5).astype(np.uint8),np.ones((9,9),np.uint8))
    n,lab,st,cen=cv2.connectedComponentsWithStats(hit); keep=np.zeros(n,bool)
    for i in range(1,n):
        if st[i,4]>30000 or (st[i,1]+st[i,3]>=1075 and st[i,4]>3000): keep[i]=True
    k=keep[lab]; return np.where(k.any(0),k.argmax(0),1080).astype(np.float32)+4
H4,W4=270,480
def ops():
    def d1(n): return sp.diags([-np.ones(n-1),np.ones(n-1)],[0,1],shape=(n-1,n))
    def d2(n): return sp.diags([np.ones(n-2),-2*np.ones(n-2),np.ones(n-2)],[0,1,2],shape=(n-2,n))
    Iy,Ix=sp.identity(H4),sp.identity(W4)
    Dy=sp.kron(d1(H4),Ix).tocsr(); Dx=sp.kron(Iy,d1(W4)).tocsr()
    Dyy=sp.kron(d2(H4),Ix); Dxx=sp.kron(Iy,d2(W4)); Dxy=sp.kron(d1(H4),d1(W4))
    P2=(Dyy.T@Dyy+Dxx.T@Dxx+2*Dxy.T@Dxy).tocsr()
    return Dy,Dx,P2
Dy,Dx,P2=ops()
LAM2,LAM1=250.0,1.1
def fit_sky(med,sky,hs):
    Wf=sky.astype(np.float32)
    wd=cv2.resize(Wf,(W4,H4),interpolation=cv2.INTER_AREA); dd=cv2.resize(med*Wf[...,None],(W4,H4),interpolation=cv2.INTER_AREA)/np.maximum(wd,1e-6)[...,None]
    valid=wd>0.999
    yc=(np.arange(H4)*4+2)[:,None]; hs4=hs.reshape(-1,4).min(1)[None,:]
    below=(yc>=hs4-10)
    my=(below[:-1]&below[1:]).ravel().astype(float); mx=(below[:,:-1]&below[:,1:]).ravel().astype(float)
    Pm=Dy.T@sp.diags(my)@Dy+Dx.T@sp.diags(mx)@Dx
    w=valid.ravel().astype(float); d=dd.reshape(-1,3).astype(float)
    for it in range(3):
        A=(sp.diags(w)+LAM2*P2+LAM1*Pm+1e-9*sp.identity(H4*W4)).tocsc()
        lu=spl.splu(A); u=np.stack([lu.solve(w*d[:,c]) for c in range(3)],1)
        res=np.abs(u-d).max(1); w=valid.ravel()/(1+(res/1.5)**2)
    mae=float((np.abs(u-d).mean(1)*valid.ravel()).sum()/max(valid.sum(),1))
    return u.reshape(H4,W4,3).astype(np.float32),mae
gy5,gx5=np.mgrid[-2:3,-2:3]
def det(r,ok,thr):
    mx=cv2.dilate(r,np.ones((5,5),np.float32)); pk=(r>=mx)&(r>thr)&ok; pk[:3]=False;pk[-3:]=False;pk[:,:3]=False;pk[:,-3:]=False
    ys,xs=np.nonzero(pk); out=[]
    for y,x in zip(ys,xs):
        w=np.clip(r[y-2:y+3,x-2:x+3],0,None); s=w.sum()
        out.append((x+(w*gx5).sum()/s,y+(w*gy5).sum()/s,s,r[y,x]))
    return np.array(out).reshape(-1,4)
def track(D,minlen):
    tracks=[[(0,)+tuple(d)] for d in D[0]]
    for i in range(1,len(D)):
        if len(D[i])==0: continue
        t=cKDTree(D[i][:,:2]); used=set()
        for tr in tracks:
            if tr[-1][0]<i-3: continue
            if len(tr)>=3:
                vx=(tr[-1][1]-tr[0][1])/(tr[-1][0]-tr[0][0]); vy=(tr[-1][2]-tr[0][2])/(tr[-1][0]-tr[0][0])
            else: vx,vy=-1.8,0.0
            dt=i-tr[-1][0]; d,j=t.query([tr[-1][1]+vx*dt,tr[-1][2]+vy*dt]); lim=2.5 if len(tr)<3 else 1.3
            if d<lim and j not in used: used.add(j); tr.append((i,)+tuple(D[i][j]))
        for j in range(len(D[i])):
            if j not in used: tracks.append([(i,)+tuple(D[i][j])])
    return [np.array(t) for t in tracks if len(t)>=minlen]
shots=json.load(open('/home/user/xx/film/shots.json'))['shots']
only=sys.argv[1:] 
out={}
PADL,PADR,PADT=60,200,60
for sh in shots:
    sid=sh['id']
    if only and sid not in only: continue
    t0=time.time(); a,b=sh['start'],sh['end']; n=b-a
    z=np.load(f'{S}/tmp_backdrops/shot_{sid}.npz'); med=z['med'].astype(np.float32); tm=z['tm']
    hz=np.minimum(np.minimum(horizon(z['first'].astype(np.float32),tm),horizon(z['last'].astype(np.float32),tm)),horizon(med,tm))
    hs=cv2.erode(hz.reshape(1,-1),np.ones((1,41),np.uint8)).ravel()
    sky=(np.arange(1080)[:,None]<hs[None,:]-10)&~tm
    u,mae=fit_sky(med,sky,hs)
    full=cv2.resize(u,(1920,1080),interpolation=cv2.INTER_CUBIC)
    okm=cv2.erode(sky.astype(np.uint8),np.ones((9,9),np.uint8))>0
    # stars
    frames=list(range(a,b)); R=[]; D=[]
    for f in frames:
        r=L(f)-full; R.append(r.astype(np.float16)); D.append(det(r.mean(2),okm,8.0))
    nd=[len(d) for d in D]
    info=dict(hc=float(hs[960]),hmin=float(hs.min()),skyfrac=float(sky.mean()),fit_mae=mae,ndet=float(np.median(nd)))
    cat=np.zeros((0,5),np.float32); A=0j; c=0j; rr=0
    if np.median(nd)>=8:
        tr=track(D,min(6,n-2))
        P=[];V=[];Wt=[]
        for t in tr:
            if len(t)<4: continue
            px=np.polyfit(t[:,0],t[:,1],1); py=np.polyfit(t[:,0],t[:,2],1); tm_=t[:,0].mean()
            P.append(complex(np.polyval(px,tm_),np.polyval(py,tm_))); V.append(complex(px[0],py[0])); Wt.append(len(t)*(t[-1,0]-t[0,0]))
        P=np.array(P);V=np.array(V);Wt=np.sqrt(np.array(Wt,float))
        for it in range(3):
            M=np.c_[P,np.ones_like(P)]*Wt[:,None]; sol=np.linalg.lstsq(M,V*Wt,rcond=None)[0]
            res=np.abs(V-(sol[0]*P+sol[1])); k=res<max(3*np.median(res),0.05); 
            if k.all(): break
            P,V,Wt=P[k],V[k],Wt[k]
        A=sol[0]; c=-sol[1]/sol[0]
        # residual of prediction along tracks
        er=[]
        for t in tr:
            p0=complex(t[0,1],t[0,2]); pr=c+(p0-c)*np.exp(A*(t[:,0]-t[0,0])); er+=np.abs(pr-(t[:,1]+1j*t[:,2])).tolist()
        rr=float(np.sqrt(np.mean(np.square(er))))
        # stack in ref (first-frame) coords
        Hc,Wc=1080+PADT,1920+PADL+PADR; acc=np.zeros((Hc,Wc,3),np.float32); cnt=np.zeros((Hc,Wc),np.float32)
        okf=okm.astype(np.float32)
        for i,f in enumerate(frames):
            E=np.exp(A*i); Dc=(1-E)*c
            # p_frame = E*p_ref + Dc ; p_ref = p_canvas - (PADL,PADT)
            off=E*complex(-PADL,-PADT)+Dc
            M=np.array([[E.real,-E.imag,off.real],[E.imag,E.real,off.imag]],np.float32)
            r=R[i].astype(np.float32)*okf[...,None]
            acc+=cv2.warpAffine(r,M,(Wc,Hc),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP)
            cnt+=cv2.warpAffine(okf,M,(Wc,Hc),flags=cv2.INTER_LINEAR|cv2.WARP_INVERSE_MAP)
        need=max(3.0,n/4); mean=acc/np.maximum(cnt,1e-3)[...,None]; okc=cnt>=need
        lum=mean.mean(2); noise=1.4826*np.median(np.abs(lum[okc]-np.median(lum[okc])))
        thr=max(2.5,6*noise); dd=det(lum,cv2.erode(okc.astype(np.uint8),np.ones((5,5),np.uint8))>0,thr)
        rows=[]
        for x,y,s,pk in dd:
            xi,yi=int(round(x)),int(round(y)); win=mean[yi-3:yi+4,xi-3:xi+4]
            if win.shape[:2]!=(7,7): continue
            ring=np.concatenate([win[0],win[-1],win[1:-1,0],win[1:-1,-1]]); bg=np.median(ring,0)
            fl=(win[1:-1,1:-1]-bg).sum((0,1))
            fl_l=fl.mean()
            if fl_l<12 or fl_l/max(pk,1e-3)<1.5 or fl_l/max(pk,1e-3)>14: continue
            rows.append((x-PADL,y-PADT,fl[0],fl[1],fl[2]))
        cat=np.array(rows,np.float32).reshape(-1,5)
        info.update(ntracks=len(tr),lam=float(A.real),omega=float(A.imag),cx=float(c.real),cy=float(c.imag),trk_rms=rr,noise=float(noise),thr=float(thr),nstars=len(cat),flux_med=float(np.median(cat[:,2:].mean(1))) if len(cat) else 0)
    out[sid+'_u']=u; out[sid+'_hs']=hs; out[sid+'_cat']=cat; out[sid+'_mot']=np.array([A.real,A.imag,c.real,c.imag,a],np.float64)
    info['t']=round(time.time()-t0,1)
    print(sid,' '.join(f'{k}={v:.4g}' for k,v in info.items()),flush=True)
    np.savez(f'{S}/tmp_backdrops/sky_{sid}.npz',u=u,hs=hs,cat=cat,mot=out[sid+'_mot'],info=json.dumps(info))
