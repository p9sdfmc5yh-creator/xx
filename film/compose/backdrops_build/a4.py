import numpy as np
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
np.set_printoptions(linewidth=250,precision=2,suppress=True)
z=np.load(f'{S}/tmp_backdrops/maps.npz'); frames=z['frames']; M=z['maps'].astype(np.float64); C=z['cnts'].astype(np.float64); D0=int(z['D0'])
nf,nd,nx,_=M.shape
W=np.minimum(C,60.0)[...,None]*(M<249.0)   # per channel weights
W[C<4]=0
def prox(i,d0,d1,x0,x1,ch):
    m=M[i,d0-D0:d1-D0,x0:x1,ch]; c=C[i,d0-D0:d1-D0,x0:x1]; return (m*c).sum()/max(c.sum(),1)
g=np.array([(prox(i,190,210,20,30,1)-43.6)/(52.8-43.6) for i in range(nf)])
for it in range(12):
    gg=g[:,None,None,None]
    S1=W.sum(0); Sg=(W*gg).sum(0); Sgg=(W*gg*gg).sum(0); Sy=(W*M).sum(0); Sgy=(W*gg*M).sum(0)
    lam=1e-3*S1+1e-6
    det=S1*(Sgg+lam)-Sg*Sg
    G=np.where(det>1e-9,(S1*Sgy-Sg*Sy)/np.maximum(det,1e-9),0.0)
    B=np.where(S1>0,(Sy-Sg*G)/np.maximum(S1,1e-9),0.0)
    num=(W*(M-B)*G).sum((1,2,3)); den=(W*G*G).sum((1,2,3)); g=num/den
    # gauge
    g0=g[(frames>=736)&(frames<=748)].mean(); g1=g[frames<=88].mean()
    a=g0; s=g1-g0
    g=(g-a)/s; B=B+a*G; G=G*s
pred=np.clip(B+g[:,None,None,None]*G,0,255)
res=np.abs(pred-M); Wc=np.minimum(C,60.0)[...,None]*np.ones(3); Wc[C<4]=0
mae=(res*Wc).sum((1,2,3))/Wc.sum((1,2,3))
print('g:',' '.join(f'{f}:{v:.3f}' for f,v in zip(frames,g)))
print('bin-mae:',' '.join(f'{f}:{v:.2f}' for f,v in zip(frames[::3],mae[::3])))
ds=[-60,-20,-5,-2,-1,0,1,2,4,8,16,32,64,128,200,300,400,600,800,1000]
for xb in (2,25,50):
    print('xbin',xb); 
    for ch in range(3): print('  B',np.array([B[d-D0,xb,ch] for d in ds]),'\n  G',np.array([G[d-D0,xb,ch] for d in ds]))
np.savez(f'{S}/tmp_backdrops/als.npz',B=B,G=G,g=g,frames=frames,S1=S1,D0=D0)
# residual structure: signed residual vs x-bin and vs d for a bright frame and a static frame
for f in (60,188,1000,1220):
    i=int(np.where(frames==f)[0][0]); r=(pred[i]-M[i])*(Wc[i]>0)
    cntd=np.maximum((Wc[i]>0).sum((1,2)),1)
    rd=np.abs(r).sum((1,2))/cntd
    print('f',f,'absres by d-range:',[ (a,round(float(rd[a-D0:b-D0].mean()),2)) for a,b in [(-100,-10),(-10,-2),(-2,3),(3,20),(20,100),(100,300),(300,600),(600,1000)]])
