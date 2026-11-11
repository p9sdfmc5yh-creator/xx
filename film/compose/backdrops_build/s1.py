import json,cv2,numpy as np,sys
sys.path.insert(0,'/home/user/xx/film/compose'); import text as T
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
np.set_printoptions(linewidth=250,precision=2,suppress=True)
def L(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg').astype(np.float32)[:,:,::-1]
def tmask(f,dil=13):
    a=T.render_text_layer(f,use_old_name=True,scale=1)[:,:,3]
    m=(a>0.003).astype(np.uint8)
    if m.any(): m=cv2.dilate(m,np.ones((dil,dil),np.uint8))
    return m>0
def horizon(im,tm):
    u8=np.clip(im,0,255).astype(np.uint8); md=cv2.medianBlur(u8,5).astype(np.float32); md=cv2.GaussianBlur(md,(0,0),1.5)
    gx=cv2.Sobel(md,cv2.CV_32F,1,0,ksize=3)/8; gy=cv2.Sobel(md,cv2.CV_32F,0,1,ksize=3)/8
    gm=np.sqrt(gx*gx+gy*gy).max(2); gm[cv2.dilate(tm.astype(np.uint8),np.ones((9,9),np.uint8))>0]=0
    hit=gm>3.0
    # require persistence: at least 3 of next 8 rows also hit or strong
    hit=cv2.erode(hit.astype(np.uint8),np.ones((3,1),np.uint8))>0
    first=np.where(hit.any(0),hit.argmax(0),1080)
    return first.astype(np.float32)
def stars(im,sky):
    lum=im.max(2); u8=np.clip(lum,0,255).astype(np.uint8); bg=cv2.medianBlur(u8,7).astype(np.float32)
    bg=cv2.blur(bg,(5,5)); r=lum-bg
    mx=cv2.dilate(r,np.ones((5,5),np.float32)); pk=(r>=mx)&(r>5.0)&sky
    ys,xs=np.nonzero(pk); out=[]
    for y,x in zip(ys,xs):
        if y<3 or x<3 or y>1076 or x>1916: continue
        w=np.clip(r[y-2:y+3,x-2:x+3],0,None); s=w.sum()
        if s<=0: continue
        gy,gx=np.mgrid[-2:3,-2:3]
        out.append((x+(w*gx).sum()/s,y+(w*gy).sum()/s,s,r[y,x]))
    return np.array(out).reshape(-1,4),r
shots=json.load(open('/home/user/xx/film/shots.json'))['shots']
allinfo={}
for sh in shots:
    a,b=sh['start'],sh['end']; n=b-a
    fl=sorted(set(np.linspace(a,b-1,min(n,12)).round().astype(int).tolist()))
    ims=[L(f) for f in fl]; tm=np.zeros((1080,1920),bool)
    for f in fl: tm|=tmask(f)
    med=np.median(np.stack(ims),0)
    h0=horizon(ims[0],tm); h1=horizon(ims[-1],tm); hm=horizon(med,tm); h=np.minimum(np.minimum(h0,h1),hm)
    hs=cv2.erode(h.reshape(1,-1),np.ones((1,41),np.uint8)).ravel()  # running min
    hs=cv2.blur(hs.reshape(1,-1),(31,1)).ravel()
    yy=np.arange(1080)[:,None]
    sky=(yy<hs[None,:]-10)&~tm
    s0,r0=stars(ims[0],sky); s1,r1=stars(ims[-1],sky); sm,rm=stars(med,sky)
    # match
    info=dict(id=sh['id'],hc=float(hs[900:1020].min()),hl=float(hs[:60].min()),hr=float(hs[-60:].min()),hmin=float(hs.min()),n0=len(s0),n1=len(s1),nm=len(sm))
    if len(s0)>5 and len(s1)>5:
        from scipy.spatial import cKDTree
        d,j=cKDTree(s1[:,:2]).query(s0[:,:2]); k=d<8
        dx=s1[j[k],0]-s0[k,0]; dy=s1[j[k],1]-s0[k,1]
        px=s0[k,0]-960; py=s0[k,1]-540
        A=np.r_[np.c_[px,np.ones_like(px),np.zeros_like(px)],np.c_[py,np.zeros_like(py),np.ones_like(py)]]
        sol=np.linalg.lstsq(A,np.r_[dx,dy],rcond=None)[0]
        res=np.r_[dx,dy]-A@sol
        info.update(match=int(k.sum()),zoom=float(sol[0]),tx=float(sol[1]),ty=float(sol[2]),rres=float(np.sqrt((res**2).mean())),dmed=float(np.median(np.hypot(dx,dy))),
                    fluxratio=float(np.median(s1[j[k],2]/s0[k,2])),fluxsd=float(np.std(np.log(s1[j[k],2]/s0[k,2]))),peakmed=float(np.median(s0[:,3])),peakmax=float(s0[:,3].max()))
    # sky temporal change
    bl=lambda x:cv2.GaussianBlur(x,(0,0),4)
    dd=np.abs(bl(ims[0])-bl(ims[-1]))[sky]; info['skydiff']=float(dd.mean()) if sky.any() else -1
    info['skyfrac']=float(sky.mean())
    # sky colours along centre column and top row
    allinfo[sh['id']]=info
    np.savez_compressed(f'{S}/tmp_backdrops/shot_{sh["id"]}.npz',med=med.astype(np.float16),tm=tm,hs=hs,frames=np.array(fl),first=ims[0].astype(np.float16),last=ims[-1].astype(np.float16))
    print(' '.join(f'{k}={v:.3g}' if isinstance(v,float) else f'{k}={v}' for k,v in info.items()),flush=True)
json.dump(allinfo,open(f'{S}/tmp_backdrops/shot_info.json','w'))
