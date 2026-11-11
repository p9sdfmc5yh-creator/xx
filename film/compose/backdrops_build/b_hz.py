"""Builder: horizon LUTs (base + glow), limb motion, glow time table; yin-yang motion polys. -> hz_build.npz"""
import numpy as np, cv2
from scipy.ndimage import gaussian_filter1d
from scipy.interpolate import CubicSpline
from scipy.signal import savgol_filter
from scipy.optimize import least_squares
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
np.set_printoptions(linewidth=250,precision=4,suppress=True)
z=np.load(f'{S}/tmp_backdrops/als.npz'); B=z['B'].copy();G=z['G'].copy();S1=z['S1'];D0=int(z['D0']); nd,nx,_=B.shape
dc=D0+np.arange(nd)+0.5
valid=(S1>0).all(2) if S1.ndim==3 else S1>0
# fill invalid along d (nearest valid in the column), separately each side
for A in (B,G):
    for x in range(nx):
        v=valid[:,x]; idx=np.where(v)[0]
        if len(idx)==0: continue
        near=idx[np.clip(np.searchsorted(idx,np.arange(nd)),0,len(idx)-1)]
        lo=idx[np.clip(np.searchsorted(idx,np.arange(nd))-1,0,len(idx)-1)]
        pick=np.where(np.abs(near-np.arange(nd))<=np.abs(lo-np.arange(nd)),near,lo)
        A[:,x]=A[pick,x]
    for x in range(nx):
        if not valid[:,x].any(): A[:,x]=A[:,x-1]
print('invalid frac',1-valid.mean(),'G far (d>900) mean',G[dc>900].mean(0).mean(0),'B far',B[dc>900].mean((0,1)), 'B deep',B[dc<-60].mean((0,1)),'G deep',G[dc<-60].mean((0,1)))
def side(A,outer):
    A=A.copy()
    if outer:
        fit=(dc>=1.5)&(dc<=5.5); ext=dc<1.5
    else:
        fit=(dc>=-6.5)&(dc<=-2.5); ext=dc>-2.5
    X=np.c_[dc[fit],np.ones(fit.sum())]
    co=np.linalg.lstsq(X,A[fit].reshape(fit.sum(),-1),rcond=None)[0]
    A[ext]=(np.c_[dc[ext],np.ones(ext.sum())]@co).reshape(ext.sum(),nx,3)
    # limit the extrapolation to +-6 px beyond 0
    far=(dc<-6) if outer else (dc>6)
    edge=np.argmin(np.abs(dc-(-5.5 if outer else 5.5))); A[far]=A[edge]
    # variable smoothing along d
    sig=np.clip(0.03*np.abs(dc)-0.1,0,10.0); levels=[0,0.7,1.5,3,5,7.5,10]
    stack=[A]+[gaussian_filter1d(A,s,axis=0,mode='nearest') for s in levels[1:]]
    out=np.empty_like(A)
    for i in range(nd):
        k=np.searchsorted(levels,sig[i],side='right')-1; k=min(k,len(levels)-2); t=(sig[i]-levels[k])/(levels[k+1]-levels[k])
        out[i]=(1-t)*stack[k][i]+t*stack[k+1][i]
    # x smoothing (mirror at centre)
    out=gaussian_filter1d(out,1.2,axis=1,mode='mirror')
    return out
# upsample x: 16px bins (centres 8,24,..) -> 4px bins (centres 2,6,..,  up to 1022)
def upx(A):
    xc=np.arange(nx)*16+8.0; xm=np.r_[-xc[::-1][:4][::-1][::-1],xc]  # mirrored knots
    xm=np.r_[-xc[3::-1],xc]; Am=np.concatenate([A[:,3::-1],A],1)
    cs=CubicSpline(xm,Am,axis=1,bc_type='natural'); xn=np.arange(256)*4+2.0
    return cs(np.clip(xn,0,xc[-1])).astype(np.float32)
LUT={}
for name,A in (('B',B),('G',G)):
    LUT[name+'o']=side(A,True)[94:].astype(np.float32); LUT[name+'i']=side(A,False)[:106].astype(np.float32)
# far-space base & interior constants
print('LUT shapes',LUT['Bo'].shape,LUT['Bi'].shape)
# ---- time functions
h=np.load(f'{S}/tmp_backdrops/hz_all.npz'); fr=h['frames']; yt=h['cy']-2800.0; g=h['g']
def sstep(u): u=np.clip(u,0,1); return u*u*(3-2*u)
def sstep5(u): u=np.clip(u,0,1); return u*u*u*(u*(6*u-15)+10)
def cosease(u): u=np.clip(u,0,1); return 0.5-0.5*np.cos(np.pi*u)
for nm,(a,b),p0 in (('intro',(60,191),[90,138,935.7,580.8]),('outro',(1030,1221),[1062,1150,935.7,699.9])):
    k=(fr>=a)&(fr<=b)
    for en,e in (('smoothstep',sstep),('smootherstep',sstep5),('cos',cosease)):
        f=lambda p:p[2]+(p[3]-p[2])*e((fr[k]-p[0])/(p[1]-p[0]))-yt[k]
        r=least_squares(f,p0); print(nm,en,r.x,'rms %.3f max %.3f'%(np.sqrt((r.fun**2).mean()),np.abs(r.fun).max()))
# glow table
gt=np.zeros(1248); 
def seg(a,b):
    k=(fr>=a)&(fr<=b); v=g[k].copy()
    if len(v)>=9: v=savgol_filter(v,9,2,mode='interp')
    gt[a:b+1]=v
seg(0,191); seg(736,751); seg(752,1055); seg(1056,1221)
gt[0:90]=g[(fr>=0)&(fr<90)].mean(); gt[736:752]=0.0
pl=g[(fr>=1175)&(fr<=1221)].mean(); gt[1175:]=pl; 
pl2=g[(fr>=182)&(fr<=191)].mean(); gt[182:192]=pl2; gt[192:736]=pl2
print('g plateaus',gt[0],pl2,pl,'g@90..96',gt[88:97],'g@748..756',gt[748:756],'g@1052..1060',gt[1052:1060])
print('max |g-gt| intro %.3f outro %.3f'%(np.abs(g[fr<192]-gt[:192]).max(),np.abs(g[fr>=736]-gt[736:1222]).max()))
ytab=np.full(1248,np.nan); ytab[fr]=yt
np.savez(f'{S}/tmp_backdrops/hz_build.npz',gt=gt,ytab=ytab,D0=D0,**LUT)
# ---- yin-yang polys
r=np.load(f'{S}/tmp_backdrops/yy_meas.npy'); t=r[:,0]-192
np.set_printoptions(precision=8,suppress=False)
for name,c,deg in (('limb_cx',1,0),('limb_ytop',None,0),('limb_R',3,2),('dot_x',5,2),('dot_y',6,2),('dot_r',7,1),('moon_x',10,2),('moon_y',11,2),('moon_r',12,1)):
    v=r[:,2]-r[:,3] if c is None else r[:,c]
    p=np.polyfit(t,v,deg); print(name,repr(p.tolist()),'rms %.3f'%np.std(v-np.polyval(p,t)))
# dot in planet polar coords
cy=r[:,2]; R=r[:,3]; phi=np.arctan2(r[:,5]-r[:,1],cy-r[:,6]); rho=np.hypot(r[:,5]-r[:,1],cy-r[:,6])/R
print('dot phi lin',np.polyfit(t,phi,1),'rho mean',rho.mean(),rho.std(),'dot r / R',(r[:,7]/R).mean(), 'moon r/R',(r[:,12]/R).mean())
phm=np.arctan2(r[:,10]-r[:,1],cy-r[:,11]); rhm=np.hypot(r[:,10]-r[:,1],cy-r[:,11])/R
print('moon phi lin',np.polyfit(t,phm,1),'rho',rhm[0],rhm[-1],np.polyfit(t,rhm,1))
