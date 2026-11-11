import sys,cv2,numpy as np,time
sys.path.insert(0,'/home/user/xx/film/compose'); import text as T, backdrops as BD
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
def L(f): return cv2.imread(f'{S}/orig_full/o_{f:04d}.jpg').astype(np.float32)[:,:,::-1]
def tmask(f,dil=13):
    a=T.render_text_layer(f,use_old_name=True,scale=1)[:,:,3]; m=(a>0.003).astype(np.uint8)
    if m.any(): m=cv2.dilate(m,np.ones((dil,dil),np.uint8))
    return m>0
segs=[('intro 0-89',range(0,90,6)),('intro 90-140 (rise)',range(90,141,3)),('intro 141-191',range(141,192,5)),('outro 736-751',range(736,752,5)),('outro 752-1055',range(752,1056,12)),('outro 1056-1148 (rise)',range(1056,1149,5)),('outro 1149-1221',range(1149,1222,8)),('outro fade 1222-1247',range(1222,1248,4))]
for name,fr in segs:
    e=[];sg=[]
    for f in fr:
        o=L(f); n=BD.horizon_bg(f,1,fade=True,dither=0.0)*255; m=~tmask(f)
        d=(n-o)[m]; e.append(np.abs(d).mean()); sg.append(d.mean())
    print('%-26s frames %2d  MAE mean %.2f  max %.2f  bias %.2f'%(name,len(e),np.mean(e),np.max(e),np.mean(sg)))
e=[]
for f in (192,208,224,240,255):
    o=L(f); n=BD.yinyang_bg(f,1,dither=0.0)*255; m=~tmask(f); e.append(np.abs(n-o)[m].mean())
    # layout check: blurred comparison
    ob=cv2.GaussianBlur(o,(0,0),6); nb=cv2.GaussianBlur(n,(0,0),6); e[-1]=(e[-1],np.abs(nb-ob)[m].mean())
print('yinyang MAE (raw, blurred s6):',[(round(a,2),round(b,2)) for a,b in e])
# sheet
tiles=[]
for f in (0,110,191,740,900,1221,200,255):
    o=L(f).astype(np.uint8)[:,:,::-1]; n=BD.to_u8(BD.backdrop(f,1,dither=0.0))[:,:,::-1]
    for im,lab in ((o,'orig %d'%f),(n,'new %d'%f)):
        im=cv2.resize(im,(320,180),interpolation=cv2.INTER_AREA); cv2.putText(im,lab,(5,14),cv2.FONT_HERSHEY_SIMPLEX,0.4,(0,255,255),1,cv2.LINE_AA); tiles.append(im)
sheet=np.vstack([np.hstack(tiles[i:i+4]) for i in range(0,16,4)])
cv2.imwrite(f'{S}/tmp_backdrops/v_hz_sheet.jpg',sheet,[cv2.IMWRITE_JPEG_QUALITY,90]); print(sheet.shape)
t=time.time(); BD.horizon_bg(60,2); t1=time.time()-t; t=time.time(); BD.horizon_bg(61,2); t2=time.time()-t; t=time.time(); BD.horizon_bg(110,2); t3=time.time()-t
t=time.time(); BD.yinyang_bg(224,2); t4=time.time()-t; t=time.time(); BD.yinyang_bg(225,2); t5=time.time()-t
print('4K timings: hz cold %.2f warm %.2f moving %.2f | yy cold %.2f warm %.2f'%(t1,t2,t3,t4,t5))
