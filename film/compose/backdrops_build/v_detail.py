import sys,cv2,numpy as np,time
sys.path.insert(0,'/home/user/xx/film/compose'); import backdrops as BD
S='/tmp/claude-0/-home-user-xx/7e18b1fa-923d-5a7b-99f5-35aa0b46033b/scratchpad'
u8=lambda im:BD.to_u8(im)[:,:,::-1]
hz=u8(BD.horizon_bg(180,2)); y0=int(580.8*2)-200; c1=hz[y0:y0+400,1600:2240]
yy=u8(BD.yinyang_bg(224,2)); c2=yy[1700:2100,2900:3540]; c3=yy[563:963,102:502]
sk=u8(BD.sky_plate('m09_juhua',584,2)); c4=sk[0:400,1000:1640]
# brighten the star crop x2 for inspection (right half)
c4b=c4.copy(); c4b[:,320:]=np.clip(c4[:,320:].astype(np.float32)*2.5,0,255).astype(np.uint8)
row2=np.hstack([c3,c4b,np.zeros((400,240,3),np.uint8)])
cv2.imwrite(f'{S}/tmp_backdrops/v_detail.jpg',np.vstack([np.hstack([c1,c2]),row2]),[cv2.IMWRITE_JPEG_QUALITY,93])
for f in (60,61,110,111,224,225,300,301,470,471,900,901):
    t=time.time(); BD.backdrop(f,2); print('f%d %.2fs'%(f,time.time()-t),end='  ')
print()
BD.write_sky_colors('/home/user/xx/film/sky_colors.json')
