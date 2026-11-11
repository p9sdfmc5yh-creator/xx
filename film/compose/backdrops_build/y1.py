import cv2,numpy as np
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
np.set_printoptions(linewidth=250,precision=2,suppress=True)
def L(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg').astype(np.float32)[:,:,::-1]
def fitcirc(x,y):
    for it in range(3):
        A=np.c_[2*x,2*y,np.ones_like(x)]; b=x*x+y*y
        sol=np.linalg.lstsq(A,b,rcond=None)[0]; cx,cy=sol[:2]; R=np.sqrt(sol[2]+cx*cx+cy*cy)
        res=np.hypot(x-cx,y-cy)-R; k=np.abs(res)<2.5*res.std()+0.3; x,y=x[k],y[k]
    return cx,cy,R,res.std()
def blob(gr,thr,below,box):
    x0,y0,x1,y1=box; sub=gr[y0:y1,x0:x1]; m=((sub<thr) if below else (sub>thr)).astype(np.uint8)
    n,lab,st,cen=cv2.connectedComponentsWithStats(m)
    best=max([i for i in range(1,n) if st[i,0]>0 and st[i,1]>0 and st[i,0]+st[i,2]<x1-x0 and st[i,1]+st[i,3]<y1-y0] or [0],key=lambda i:st[i,4])
    ys,xs=np.nonzero(lab==best); 
    # soft centroid with fractional coverage
    cov=np.clip((thr-sub)/40+0.5,0,1) if below else np.clip((sub-thr)/40+0.5,0,1)
    cov=cov*cv2.dilate((lab==best).astype(np.uint8),np.ones((5,5),np.uint8))
    A=cov.sum(); cx=(cov*np.arange(x0,x1)[None,:]).sum()/A; cy=(cov*np.arange(y0,y1)[:,None]).sum()/A
    mxx=(cov*(np.arange(x0,x1)[None,:]-cx)**2).sum()/A; myy=(cov*(np.arange(y0,y1)[:,None]-cy)**2).sum()/A
    return cx,cy,np.sqrt(A/np.pi),2*np.sqrt(mxx),2*np.sqrt(myy)
rows=[]
for f in range(192,256):
    im=L(f); gr=im.mean(2); g=np.diff(cv2.GaussianBlur(gr,(0,0),1.2),axis=0)
    X=[];Y=[]
    for x in range(10,1910,10):
        col=g[450:,x-2:x+3].mean(1); y=int(np.argmax(col))
        if col[y]<8 or y<2 or y>620: continue
        a,b,c=col[y-1],col[y],col[y+1]; dn=a-2*b+c
        X.append(x);Y.append(450+y+0.5+0.5*(a-c)/dn)
    c=fitcirc(np.array(X,float),np.array(Y,float))
    dot=blob(gr,95,True,(1300,760,1919,1079)); moon=blob(gr,95,False,(0,200,500,560))
    rows.append((f,)+c+dot+moon)
rows=np.array(rows); np.save(f'{S}/tmp_backdrops/yy_meas.npy',rows)
print('f | limb cx cy R rms ytop | dot cx cy r ax ay | moon cx cy r ax ay')
for r in rows[::7]: print(int(r[0]),r[1:5],round(r[2]-r[3],2),'|',r[5:10],'|',r[10:15])
print(rows[-1][0],rows[-1][1:5],round(rows[-1][2]-rows[-1][3],2),rows[-1][5:10],rows[-1][10:15])
# linearity of motion
t=rows[:,0]-192
for name,c in (('limb cx',1),('limb cy',2),('limb R',3),('dot x',5),('dot y',6),('dot r',7),('moon x',10),('moon y',11),('moon r',12)):
    p1=np.polyfit(t,rows[:,c],1); p2=np.polyfit(t,rows[:,c],2)
    print(name,'lin',p1,'rms',np.std(rows[:,c]-np.polyval(p1,t)).round(3),'quad',p2,'rms',np.std(rows[:,c]-np.polyval(p2,t)).round(3))
# colours (mean of frames 220..230)
im=np.mean([L(f) for f in range(216,232,3)],0)
print('col x=960 down:',[ (y,im[y,940:980].mean(0).round(0)) for y in (585,590,600,620,660,720,800,900,1000,1070)])
print('row y=1000:',[ (x,im[990:1010,x-10:x+10].mean((0,1)).round(0)) for x in (30,200,500,900,1300,1850)])
print('row y=700 :',[ (x,im[690:710,x-10:x+10].mean((0,1)).round(0)) for x in (500,900,1300,1500)])
print('space:',[ ((x,y),im[y-15:y+15,x-15:x+15].mean((0,1)).round(1)) for x,y in ((60,40),(960,40),(1860,40),(1500,300),(60,520),(1860,560))])
mo=rows[int(224-192)]; dx,dy=int(mo[10]),int(mo[11]); f224=L(224)
print('moon int',f224[dy-30:dy+30,dx-30:dx+30].mean((0,1)).round(1),'std',f224[dy-30:dy+30,dx-30:dx+30].std((0,1)).round(1))
dx,dy=int(mo[5]),int(mo[6]); print('dot int',f224[dy-25:dy+25,dx-25:dx+25].mean((0,1)).round(1))
print('planet std (texture) 224:',f224[850:1050,300:700].std((0,1)).round(2))
