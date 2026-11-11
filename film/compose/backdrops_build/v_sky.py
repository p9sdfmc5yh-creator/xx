import sys,cv2,numpy as np,time,json
sys.path.insert(0,'/home/user/xx/film/compose'); import text as T, backdrops as BD
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
def L(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg').astype(np.float32)[:,:,::-1]
def tmask(f,dil=13):
    a=T.render_text_layer(f,use_old_name=True,scale=1)[:,:,3]; m=(a>0.003).astype(np.uint8)
    if m.any(): m=cv2.dilate(m,np.ones((dil,dil),np.uint8))
    return m>0
tiles=[]; res={}
for s in BD.shots():
    sid=s['id']; a,b=s['start'],s['end']; hs=BD.old_horizon(sid); es=[];e0=[]
    for f in (a,(a+b)//2,b-1):
        o=L(f); m=(np.arange(1080)[:,None]<hs[None,:]-10)&~tmask(f)
        n=BD.sky_plate(sid,f,1,True,0.0)*255; n0=BD.sky_plate(sid,f,1,False,0.0)*255
        es.append(np.abs(n-o)[m].mean()); e0.append(np.abs(n0-o)[m].mean())
        if f==(a+b)//2:
            oo=o.copy(); 
            for x in range(0,1920,4): 
                y=int(hs[x]); 
                if 0<=y<1080: oo[max(y-1,0):y+2,x:x+2]=(0,255,0)
            for im in (oo,n):
                tiles.append(cv2.resize(np.clip(im,0,255).astype(np.uint8)[:,:,::-1],(213,120),interpolation=cv2.INTER_AREA))
            cv2.putText(tiles[-2],sid,(4,12),cv2.FONT_HERSHEY_SIMPLEX,0.36,(0,255,255),1,cv2.LINE_AA)
    res[sid]=(max(es),max(e0),len(BD._data()['stars_'+sid]))
print(' '.join(f'{k}:{v[0]:.2f}/{v[1]:.2f}/n{v[2]}' for k,v in res.items()))
print('worst',max(v[0] for v in res.values()),'mean',np.mean([v[0] for v in res.values()]))
while len(tiles)%6: tiles.append(np.zeros_like(tiles[0]))
sheet=np.vstack([np.hstack(tiles[i:i+6]) for i in range(0,len(tiles),6)]); cv2.imwrite(f'{S}/tmp_backdrops/v_sky_sheet.jpg',sheet,[cv2.IMWRITE_JPEG_QUALITY,90]); print(sheet.shape)
json.dump({k:[float(x) for x in v] for k,v in res.items()},open(f'{S}/tmp_backdrops/v_sky.json','w'))
